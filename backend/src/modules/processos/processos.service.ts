import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { Perfil, StatusProcesso } from '../../generated/prisma/enums.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { UsuarioAutenticado } from '../auth/usuario-atual.decorator.js';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import { AtualizarProcessoDto, CriarProcessoDto, ListarProcessosDto } from './dto/processo.dto.js';

// pendencia: o ofício foi reprovado e volta para correção antes do reenvio.
const STATUS_EDITAVEIS: StatusProcesso[] = [StatusProcesso.rascunho, StatusProcesso.pendencia];

@Injectable()
export class ProcessosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  criar(dto: CriarProcessoDto, usuario: UsuarioAutenticado) {
    return this.prisma.$transaction(async (tx) => {
      const processo = await tx.processo.create({
        data: { tipoEstagio: dto.tipoEstagio, criadoPorId: usuario.id },
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
        data: { tipoEstagio: dto.tipoEstagio },
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
    if (processo.criadoPorId !== usuario.id) {
      throw new ForbiddenException('Apenas o criador pode alterar o processo');
    }
    if (!STATUS_EDITAVEIS.includes(processo.status)) {
      throw new ConflictException(`Processo em ${processo.status} não pode ser alterado`);
    }
    return processo;
  }

  // O representante só enxerga os próprios processos, e a resposta é 404
  // para não revelar que um processo de outra pessoa existe.
  private escopo(usuario: UsuarioAutenticado): Prisma.ProcessoWhereInput {
    return usuario.perfil === Perfil.COORDENACAO_SES ? {} : { criadoPorId: usuario.id };
  }
}
