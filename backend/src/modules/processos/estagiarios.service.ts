import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { conflito } from '../../common/conflito.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { TipoDocumento } from '../../generated/prisma/enums.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { StorageService } from '../../storage/storage.service.js';
import type { UsuarioAutenticado } from '../auth/usuario-atual.decorator.js';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import { AtualizarEstagiarioDto, CriarEstagiarioDto } from './dto/estagiario.dto.js';
import { problemasJornada } from './jornada.js';
import { duplicadosNoProcesso, lerLote, loteInvalido } from './lote-estagiarios.js';
import { ProcessosService } from './processos.service.js';

const paraData = (valor?: string) => (valor ? new Date(valor) : undefined);

function comDatas<T extends { dataInicio?: string; dataTermino?: string }>(dto: T) {
  return {
    ...dto,
    dataInicio: paraData(dto.dataInicio),
    dataTermino: paraData(dto.dataTermino),
  };
}

// O responsável só é guardado para menor de idade (RF-13).
function paraGravar(dto: CriarEstagiarioDto) {
  return {
    ...comDatas(dto),
    responsavelNome: dto.menorIdade ? dto.responsavelNome : null,
  };
}

// CPF fica fora do log: a auditoria guarda histórico por mais tempo que o
// cadastro e não deve acumular dado pessoal além do necessário.
function semCpf<T extends { cpf: string }>({ cpf: _cpf, ...dados }: T) {
  return dados;
}

@Injectable()
export class EstagiariosService {
  private readonly logger = new Logger(EstagiariosService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly processos: ProcessosService,
    private readonly auditoria: AuditoriaService,
    private readonly storage: StorageService,
  ) {}

  async listar(processoId: string, usuario: UsuarioAutenticado) {
    await this.processos.garantirAcesso(processoId, usuario);
    return this.prisma.estagiario.findMany({
      where: { processoId },
      orderBy: { nome: 'asc' },
    });
  }

  async buscar(processoId: string, id: string, usuario: UsuarioAutenticado) {
    await this.processos.garantirAcesso(processoId, usuario);
    return this.obter(this.prisma, processoId, id);
  }

  criar(processoId: string, dto: CriarEstagiarioDto, usuario: UsuarioAutenticado) {
    return this.comDuplicidadeTratada(() =>
      this.prisma.$transaction(async (tx) => {
        await this.processos.obterEditavel(tx, processoId, usuario);
        const estagiario = await tx.estagiario.create({
          data: { ...paraGravar(dto), processoId },
        });
        await this.auditoria.registrar(tx, usuario, {
          acao: 'CREATE',
          entidade: 'estagiario',
          entidadeId: estagiario.id,
          dadosDepois: semCpf(estagiario),
        });
        return estagiario;
      }),
    );
  }

  atualizar(
    processoId: string,
    id: string,
    dto: AtualizarEstagiarioDto,
    usuario: UsuarioAutenticado,
  ) {
    return this.comDuplicidadeTratada(() =>
      this.prisma.$transaction(async (tx) => {
        await this.processos.obterEditavel(tx, processoId, usuario);
        const antes = await this.obter(tx, processoId, id);
        const dados = comDatas(dto);

        const inicio = dados.dataInicio ?? antes.dataInicio;
        const termino = dados.dataTermino ?? antes.dataTermino;
        if (inicio && termino && inicio > termino) {
          throw new BadRequestException('data_inicio posterior a data_termino');
        }

        // No PATCH o DTO deixa tudo opcional e o @ValidateIf do RF-13 não
        // vê o registro gravado; a regra é conferida aqui contra o estado final.
        const menorIdade = dados.menorIdade ?? antes.menorIdade;
        const responsavel =
          dados.responsavelNome !== undefined ? dados.responsavelNome : antes.responsavelNome;
        if (menorIdade && !responsavel) {
          throw new BadRequestException('nome do responsável é obrigatório para menor de idade');
        }

        // Teto legal da jornada (#79) contra o estado final: o DTO só vê o
        // que veio no PATCH (ex.: só diasSemana, com horasPorDia já gravado).
        const final = <C extends 'horasPorDia' | 'diasSemana' | 'horarioInicio' | 'horarioFim'>(
          campo: C,
        ) => (dados[campo] !== undefined ? dados[campo] : antes[campo]);
        const [jornada] = problemasJornada({
          horasPorDia: final('horasPorDia'),
          diasSemana: final('diasSemana'),
          horarioInicio: final('horarioInicio'),
          horarioFim: final('horarioFim'),
        });
        if (jornada) throw new BadRequestException(jornada.motivo);
        const depois = await tx.estagiario.update({
          where: { id },
          data: menorIdade ? dados : { ...dados, responsavelNome: null },
        });
        await this.auditoria.registrar(tx, usuario, {
          acao: 'UPDATE',
          entidade: 'estagiario',
          entidadeId: id,
          dadosAntes: semCpf(antes),
          dadosDepois: semCpf(depois),
        });
        return depois;
      }),
    );
  }

  async remover(processoId: string, id: string, usuario: UsuarioAutenticado) {
    const tcesRemovidos = await this.prisma.$transaction(async (tx) => {
      await this.processos.obterEditavel(tx, processoId, usuario);
      const estagiario = await this.obter(tx, processoId, id);
      const documentos = await tx.documento.findMany({
        where: { estagiarioId: id },
      });
      // O TCE do estagiário sai junto: ele é refeito na próxima geração (#76).
      // Sem isso, um processo devolvido de aprovado para pendência travaria a
      // remoção, porque o representante não apaga o TCE gerado pela coordenação.
      // Os documentos que o representante anexou continuam bloqueando.
      const tces = documentos.filter((d) => d.tipo === TipoDocumento.termo_compromisso);
      if (documentos.length > tces.length) {
        throw new ConflictException('Estagiário possui documentos enviados');
      }
      // Em rascunho/pendência não há signatários; a checagem evita o P2003
      // (500) se um dia a ordem dos passos mudar.
      if (
        tces.length > 0 &&
        (await tx.signatario.count({ where: { documentoId: { in: tces.map((d) => d.id) } } }))
      ) {
        throw conflito(
          'documento_em_assinatura',
          'O TCE do estagiário já foi enviado para assinatura',
        );
      }

      for (const { storageKey: _chave, ...tce } of tces) {
        await tx.documento.delete({ where: { id: tce.id } });
        await this.auditoria.registrar(tx, usuario, {
          acao: 'DELETE',
          entidade: 'documento',
          entidadeId: tce.id,
          dadosAntes: tce,
        });
      }
      await tx.estagiario.delete({ where: { id } });
      await this.auditoria.registrar(tx, usuario, {
        acao: 'DELETE',
        entidade: 'estagiario',
        entidadeId: id,
        dadosAntes: semCpf(estagiario),
      });
      return tces.map((tce) => tce.storageKey);
    });
    // Só apaga do bucket depois do commit: falhar aqui deixa um órfão no
    // bucket, nunca um registro apontando para arquivo inexistente.
    await Promise.all(tcesRemovidos.map((chave) => this.removerObjeto(chave)));
  }

  // O lote é tudo ou nada: uma linha inválida rejeita o arquivo inteiro.
  importarLote(processoId: string, conteudo: Buffer, usuario: UsuarioAutenticado) {
    return this.comDuplicidadeTratada(() =>
      this.prisma.$transaction(async (tx) => {
        await this.processos.obterEditavel(tx, processoId, usuario);

        const { total, validos, invalidos } = await lerLote(conteudo);
        const existentes = await tx.estagiario.findMany({
          where: { processoId },
          select: { cpf: true, matricula: true },
        });
        invalidos.push(...duplicadosNoProcesso(validos, existentes));
        if (invalidos.length > 0) throw loteInvalido(total, invalidos);

        await tx.estagiario.createMany({
          data: validos.map(({ dto }) => ({ ...paraGravar(dto), processoId })),
        });
        await this.auditoria.registrar(tx, usuario, {
          acao: 'IMPORT_LOTE',
          entidade: 'processo',
          entidadeId: processoId,
          dadosDepois: { total },
        });
        return { total };
      }),
    );
  }

  private async obter(cliente: Prisma.TransactionClient, processoId: string, id: string) {
    const estagiario = await cliente.estagiario.findFirst({
      where: { id, processoId },
    });
    if (!estagiario) throw new NotFoundException('Estagiário não encontrado');
    return estagiario;
  }

  private async removerObjeto(chave: string) {
    try {
      await this.storage.remover(chave);
    } catch (erro) {
      this.logger.error(`Objeto órfão no storage: ${chave}`, erro);
    }
  }

  private async comDuplicidadeTratada<T>(operacao: () => Promise<T>) {
    try {
      return await operacao();
    } catch (erro) {
      if ((erro as { code?: string }).code === 'P2002') {
        throw new ConflictException('CPF ou matrícula já cadastrados no processo');
      }
      throw erro;
    }
  }
}
