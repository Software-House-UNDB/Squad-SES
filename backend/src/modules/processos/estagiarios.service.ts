import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { UsuarioAutenticado } from '../auth/usuario-atual.decorator.js';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import { registrosDeAcesso } from '../auditoria/acesso-estagiarios.js';
import { AtualizarEstagiarioDto, CriarEstagiarioDto } from './dto/estagiario.dto.js';
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly processos: ProcessosService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async listar(processoId: string, usuario: UsuarioAutenticado) {
    await this.processos.garantirAcesso(processoId, usuario);
    const estagiarios = await this.prisma.estagiario.findMany({
      where: { processoId },
      orderBy: { nome: 'asc' },
    });
    await this.auditoria.registrarAcesso(usuario, registrosDeAcesso(estagiarios, processoId));
    return estagiarios;
  }

  async buscar(processoId: string, id: string, usuario: UsuarioAutenticado) {
    await this.processos.garantirAcesso(processoId, usuario);
    const estagiario = await this.obter(this.prisma, processoId, id);
    await this.auditoria.registrarAcesso(usuario, registrosDeAcesso([estagiario], processoId));
    return estagiario;
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

  remover(processoId: string, id: string, usuario: UsuarioAutenticado) {
    return this.prisma.$transaction(async (tx) => {
      await this.processos.obterEditavel(tx, processoId, usuario);
      const estagiario = await this.obter(tx, processoId, id);
      const documentos = await tx.documento.count({
        where: { estagiarioId: id },
      });
      if (documentos > 0) {
        throw new ConflictException('Estagiário possui documentos enviados');
      }

      await tx.estagiario.delete({ where: { id } });
      await this.auditoria.registrar(tx, usuario, {
        acao: 'DELETE',
        entidade: 'estagiario',
        entidadeId: id,
        dadosAntes: semCpf(estagiario),
      });
    });
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
