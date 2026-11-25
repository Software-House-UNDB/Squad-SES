import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { conflito } from '../../common/conflito.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { Perfil, StatusProcesso } from '../../generated/prisma/enums.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { escopoProcesso } from '../auth/escopo-processo.js';
import type { UsuarioAutenticado } from '../auth/usuario-atual.decorator.js';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import { TRANSICOES, podeTransicionar, type AcaoProcesso } from './maquina-estados.js';
import { pendenciasPacote } from './pacote.js';
import {
  AnalisarProcessoDto,
  ApontarPendenciaDto,
  AtualizarProcessoDto,
  CriarProcessoDto,
  ListarProcessosDto,
} from './dto/processo.dto.js';

// pendencia: o ofício foi reprovado e volta para correção antes do reenvio.
const STATUS_EDITAVEIS: StatusProcesso[] = [StatusProcesso.rascunho, StatusProcesso.pendencia];

// Depois da aprovação, a coordenação devolve documentos ao processo (ofício
// carimbado, kit de estágio) sem mudar o status. concluido fica fechado.
const STATUS_RETORNO: StatusProcesso[] = [
  StatusProcesso.aprovado,
  StatusProcesso.aguardando_assinaturas,
];

// A coordenação só comenta o que já foi enviado e ainda não foi aprovado.
// A troca de status fica com a máquina de estados.
const STATUS_ANALISAVEIS: StatusProcesso[] = [
  StatusProcesso.enviado,
  StatusProcesso.em_analise,
  StatusProcesso.pendencia,
];

@Injectable()
export class ProcessosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  criar(dto: CriarProcessoDto, usuario: UsuarioAutenticado) {
    return this.prisma.$transaction(async (tx) => {
      const processo = await tx.processo.create({
        data: {
          tipoEstagio: dto.tipoEstagio,
          supervisorNome: dto.supervisorNome,
          supervisorEmail: dto.supervisorEmail,
          criadoPorId: usuario.id,
        },
      });
      await this.auditoria.registrar(tx, usuario, {
        acao: 'CREATE',
        entidade: 'processo',
        entidadeId: processo.id,
        dadosDepois: processo,
      });
      return processo;
    });
  }

  async listar(filtro: ListarProcessosDto, usuario: UsuarioAutenticado) {
    const where: Prisma.ProcessoWhereInput = {
      ...this.escopo(usuario),
      status: filtro.status,
    };
    const [itens, total] = await this.prisma.$transaction([
      this.prisma.processo.findMany({
        where,
        include: { _count: { select: { estagiarios: true } } },
        orderBy: { criadoEm: 'desc' },
        skip: (filtro.pagina - 1) * filtro.limite,
        take: filtro.limite,
      }),
      this.prisma.processo.count({ where }),
    ]);
    return { itens, total, pagina: filtro.pagina, limite: filtro.limite };
  }

  async buscar(id: string, usuario: UsuarioAutenticado) {
    const processo = await this.prisma.processo.findFirst({
      where: { id, ...this.escopo(usuario) },
      include: { estagiarios: { orderBy: { nome: 'asc' } } },
    });
    if (!processo) throw new NotFoundException('Processo não encontrado');
    return processo;
  }

  atualizar(id: string, dto: AtualizarProcessoDto, usuario: UsuarioAutenticado) {
    return this.prisma.$transaction(async (tx) => {
      const antes = await this.obterEditavel(tx, id, usuario);
      const depois = await tx.processo.update({
        where: { id },
        data: {
          tipoEstagio: dto.tipoEstagio,
          supervisorNome: dto.supervisorNome,
          supervisorEmail: dto.supervisorEmail,
        },
      });
      await this.auditoria.registrar(tx, usuario, {
        acao: 'UPDATE',
        entidade: 'processo',
        entidadeId: id,
        dadosAntes: antes,
        dadosDepois: depois,
      });
      return depois;
    });
  }

  async analisar(id: string, dto: AnalisarProcessoDto, usuario: UsuarioAutenticado) {
    if (usuario.perfil !== Perfil.COORDENACAO_SES) {
      throw new ForbiddenException('Apenas a coordenação SES analisa processos');
    }
    return this.prisma.$transaction(async (tx) => {
      const antes = await tx.processo.findUnique({ where: { id } });
      if (!antes) throw new NotFoundException('Processo não encontrado');
      if (!STATUS_ANALISAVEIS.includes(antes.status)) {
        throw new ConflictException(`Processo em ${antes.status} não pode ser analisado`);
      }

      const depois = await tx.processo.update({
        where: { id },
        data: { observacaoAnalise: dto.observacaoAnalise },
      });
      await this.auditoria.registrar(tx, usuario, {
        acao: 'ANALISE',
        entidade: 'processo',
        entidadeId: id,
        dadosAntes: { observacaoAnalise: antes.observacaoAnalise },
        dadosDepois: { observacaoAnalise: depois.observacaoAnalise },
      });
      return depois;
    });
  }

  // --- Máquina de estados (RF-07). As regras ficam em maquina-estados.ts. ---

  // rascunho -> enviado e pendencia -> enviado (reenvio). Representante.
  // Com pacote incompleto o processo não avança (RF-08): 422 com tudo o que falta.
  enviar(id: string, usuario: UsuarioAutenticado) {
    return this.transicionar(id, 'enviar', usuario, {}, (tx) =>
      this.garantirPacoteCompleto(tx, id),
    );
  }

  // enviado -> em_analise. Coordenação.
  iniciarAnalise(id: string, usuario: UsuarioAutenticado) {
    return this.transicionar(id, 'iniciar_analise', usuario);
  }

  // em_analise -> pendencia, gravando o motivo na mesma transação. Coordenação.
  apontarPendencia(id: string, dto: ApontarPendenciaDto, usuario: UsuarioAutenticado) {
    return this.transicionar(id, 'apontar_pendencia', usuario, {
      observacaoAnalise: dto.motivo,
    });
  }

  // em_analise -> aprovado. Coordenação. A ida para aguardando_assinaturas é do
  // módulo de assinaturas (POST /assinaturas/processos/:id/iniciar).
  aprovar(id: string, usuario: UsuarioAutenticado) {
    return this.transicionar(id, 'aprovar', usuario);
  }

  // Ordem das checagens: perfil (403), escopo (404), status (409).
  private async transicionar(
    id: string,
    acao: AcaoProcesso,
    usuario: UsuarioAutenticado,
    extras: { observacaoAnalise?: string } = {},
    // Checagem extra antes de mudar o status, na mesma transação (ex.: barramento).
    verificar?: (tx: Prisma.TransactionClient) => Promise<void>,
  ) {
    const regra = TRANSICOES[acao];
    if (usuario.perfil !== regra.perfil) {
      throw new ForbiddenException(`Seu perfil não pode executar esta ação (${acao})`);
    }
    return this.prisma.$transaction(async (tx) => {
      const antes = await tx.processo.findFirst({
        where: { id, ...this.escopo(usuario) },
      });
      if (!antes) throw new NotFoundException('Processo não encontrado');
      if (!podeTransicionar(acao, antes.status)) {
        throw conflito(
          'transicao_invalida',
          `Processo em ${antes.status} não pode ${regra.descricao}`,
        );
      }

      await verificar?.(tx);

      // A condição de status vai no próprio UPDATE (mesmo padrão do #70): se
      // outro pedido mudou o status entre a leitura e aqui, nada é alterado.
      const { count } = await tx.processo.updateMany({
        where: { id, status: antes.status },
        data: { status: regra.para, ...extras },
      });
      if (count === 0) {
        throw conflito(
          'transicao_invalida',
          'O status do processo mudou durante a operação. Recarregue e tente de novo.',
        );
      }

      const camposExtras = Object.keys(extras) as (keyof typeof extras)[];
      await this.auditoria.registrar(tx, usuario, {
        acao: 'TRANSICAO',
        entidade: 'processo',
        entidadeId: id,
        dadosAntes: {
          status: antes.status,
          ...Object.fromEntries(camposExtras.map((campo) => [campo, antes[campo]])),
        },
        dadosDepois: { status: regra.para, ...extras },
      });
      return tx.processo.findUniqueOrThrow({ where: { id } });
    });
  }

  private async garantirPacoteCompleto(tx: Prisma.TransactionClient, processoId: string) {
    // Em sequência, não em Promise.all: consultas paralelas na mesma transação
    // interativa não são recomendadas pelo Prisma.
    const estagiarios = await tx.estagiario.findMany({
      where: { processoId },
      select: { id: true, nome: true, menorIdade: true },
      orderBy: { nome: 'asc' },
    });
    const documentos = await tx.documento.findMany({
      where: { processoId },
      select: { tipo: true, estagiarioId: true },
    });
    const pendencias = pendenciasPacote(estagiarios, documentos);
    if (pendencias.length > 0) {
      throw new UnprocessableEntityException({ erro: 'pacote_incompleto', pendencias });
    }
  }

  remover(id: string, usuario: UsuarioAutenticado) {
    return this.prisma.$transaction(async (tx) => {
      const processo = await this.obterEditavel(tx, id, usuario);
      if (processo.status !== StatusProcesso.rascunho) {
        throw new ConflictException('Só é possível excluir um rascunho');
      }
      const documentos = await tx.documento.count({
        where: { processoId: id },
      });
      if (documentos > 0) {
        throw new ConflictException('Processo possui documentos enviados');
      }

      await tx.estagiario.deleteMany({ where: { processoId: id } });
      await tx.processo.delete({ where: { id } });
      await this.auditoria.registrar(tx, usuario, {
        acao: 'DELETE',
        entidade: 'processo',
        entidadeId: id,
        dadosAntes: processo,
      });
    });
  }

  async garantirAcesso(id: string, usuario: UsuarioAutenticado) {
    const processo = await this.prisma.processo.findFirst({
      where: { id, ...this.escopo(usuario) },
      select: { id: true },
    });
    if (!processo) throw new NotFoundException('Processo não encontrado');
  }

  async obterEditavel(tx: Prisma.TransactionClient, id: string, usuario: UsuarioAutenticado) {
    const processo = await tx.processo.findFirst({
      where: { id, ...this.escopo(usuario) },
    });
    if (!processo) throw new NotFoundException('Processo não encontrado');
    // O escopo já garante que o representante é da mesma instituição (opção A da issue #54).
    // A coordenação continua podendo alterar só o que criou.
    if (usuario.perfil === Perfil.COORDENACAO_SES && processo.criadoPorId !== usuario.id) {
      throw new ForbiddenException('Apenas o criador pode alterar o processo');
    }
    if (!STATUS_EDITAVEIS.includes(processo.status)) {
      throw conflito('status_invalido', `Processo em ${processo.status} não pode ser alterado`);
    }
    return processo;
  }

  async obterParaRetorno(tx: Prisma.TransactionClient, id: string, usuario: UsuarioAutenticado) {
    if (usuario.perfil !== Perfil.COORDENACAO_SES) {
      throw new ForbiddenException('Apenas a coordenação SES envia documentos de retorno');
    }
    const processo = await tx.processo.findFirst({
      where: { id, ...this.escopo(usuario) },
    });
    if (!processo) throw new NotFoundException('Processo não encontrado');
    if (!STATUS_RETORNO.includes(processo.status)) {
      throw conflito(
        'status_invalido',
        `Processo em ${processo.status} não recebe documentos de retorno`,
      );
    }
    return processo;
  }

  // Escopo institucional: ver escopo-processo.ts. Fora do escopo a resposta é 404.
  private escopo(usuario: UsuarioAutenticado): Prisma.ProcessoWhereInput {
    return escopoProcesso(usuario);
  }
}
