import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import type { StatusProcesso } from '../../generated/prisma/enums.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import type { UsuarioAutenticado } from '../auth/usuario-atual.decorator.js';
import { ProcessosService } from '../processos/processos.service.js';
import { CriarComentarioDto } from './dto/comentario.dto.js';
import { exigirPodeComentar } from './regras-comentario.js';

// O que sai na API. O autor mostra só id, nome e perfil: nunca e-mail nem hash de senha.
const COMENTARIO = {
  id: true,
  processoId: true,
  documentoId: true,
  tipo: true,
  texto: true,
  criadoEm: true,
  autor: { select: { id: true, nome: true, perfil: true } },
} satisfies Prisma.ComentarioSelect;

// Mais antigo primeiro; o id desempata comentários do mesmo instante.
const ORDEM = [
  { criadoEm: 'asc' },
  { id: 'asc' },
] satisfies Prisma.ComentarioOrderByWithRelationInput[];

const MENSAGEM_SEM_DOCUMENTO = 'Documento não encontrado';

// O pool tem 10 conexões e o Prisma desiste de esperar uma em 2 s (P2028). Em um pico,
// a transação entra na fila e espera mais, em vez de falhar com 500.
const ESPERA_POR_CONEXAO_MS = 10_000;

// Nomes das FKs, definidos na migration comentarios_por_documento.
const FK_DOCUMENTO = 'comentarios_documento_id_fkey';
const FK_AUTOR = 'comentarios_autor_id_fkey';

// O P2003 do Prisma traz o nome da restrição dentro de `meta`, em lugares que mudam
// conforme o adapter/engine; por isso a busca é no meta inteiro. Funciona porque
// nenhum nome de FK desta tabela contém o outro: ao criar uma FK nova, manter isso.
function violouRestricao(erro: unknown, restricao: string) {
  const { code, meta } = erro as { code?: string; meta?: unknown };
  return code === 'P2003' && JSON.stringify(meta ?? {}).includes(restricao);
}

@Injectable()
export class ComentariosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly processos: ProcessosService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async criar(
    processoId: string,
    documentoId: string,
    dto: CriarComentarioDto,
    usuario: UsuarioAutenticado,
  ) {
    await this.processos.garantirAcesso(processoId, usuario);
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          // Trava o processo contra troca de status até o fim desta transação: sem
          // isso, um comentário poderia entrar no mesmo instante em que o processo
          // é aprovado. Comentários simultâneos não se bloqueiam (lock compartilhado).
          const status = await this.travarStatus(tx, processoId);
          exigirPodeComentar(usuario.perfil, dto.tipo, status);
          await this.garantirDocumento(tx, processoId, documentoId);

          const comentario = await tx.comentario.create({
            data: {
              processoId,
              documentoId,
              autorId: usuario.id,
              tipo: dto.tipo,
              texto: dto.texto,
            },
            select: COMENTARIO,
          });
          // Sem o texto: a auditoria é imutável e o comentário já guarda o conteúdo.
          await this.auditoria.registrar(tx, usuario, {
            acao: 'CREATE',
            entidade: 'comentario',
            entidadeId: comentario.id,
            dadosDepois: { processoId, documentoId, autorId: usuario.id, tipo: dto.tipo },
          });
          return comentario;
        },
        { maxWait: ESPERA_POR_CONEXAO_MS },
      );
    } catch (erro) {
      // O documento foi removido depois da checagem: a FK recusa o insert.
      if (violouRestricao(erro, FK_DOCUMENTO)) throw new NotFoundException(MENSAGEM_SEM_DOCUMENTO);
      // Token ainda válido de um usuário que já não existe: pede novo login.
      if (violouRestricao(erro, FK_AUTOR)) {
        throw new UnauthorizedException('Usuário não encontrado');
      }
      // Nem a fila do pool deu conta do pico: avisa que vale tentar de novo.
      if ((erro as { code?: string }).code === 'P2028') {
        throw new ServiceUnavailableException('Sistema ocupado. Tente novamente em instantes');
      }
      throw erro;
    }
  }

  async listarDoDocumento(processoId: string, documentoId: string, usuario: UsuarioAutenticado) {
    await this.processos.garantirAcesso(processoId, usuario);
    await this.garantirDocumento(this.prisma, processoId, documentoId);
    return this.prisma.comentario.findMany({
      where: { processoId, documentoId },
      select: COMENTARIO,
      orderBy: ORDEM,
    });
  }

  // Inclui os comentários de documentos que já foram removidos (documentoId nulo).
  async listarDoProcesso(processoId: string, usuario: UsuarioAutenticado) {
    await this.processos.garantirAcesso(processoId, usuario);
    return this.prisma.comentario.findMany({
      where: { processoId },
      select: COMENTARIO,
      orderBy: ORDEM,
    });
  }

  private async travarStatus(tx: Prisma.TransactionClient, processoId: string) {
    const [processo] = await tx.$queryRaw<{ status: StatusProcesso }[]>`
      SELECT status FROM processos WHERE id = ${processoId}::uuid FOR SHARE`;
    if (!processo) throw new NotFoundException('Processo não encontrado');
    return processo.status;
  }

  private async garantirDocumento(
    cliente: Prisma.TransactionClient,
    processoId: string,
    documentoId: string,
  ) {
    const documento = await cliente.documento.findFirst({
      where: { id: documentoId, processoId },
      select: { id: true },
    });
    if (!documento) throw new NotFoundException(MENSAGEM_SEM_DOCUMENTO);
  }
}
