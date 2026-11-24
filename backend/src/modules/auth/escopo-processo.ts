import type { Prisma } from '../../generated/prisma/client.js';
import { Perfil } from '../../generated/prisma/enums.js';
import type { UsuarioAutenticado } from './usuario-atual.decorator.js';

/**
 * Escopo de leitura de processos (RBAC + ABAC):
 * - coordenação SES vê todos os processos;
 * - representante UNDB vê os processos criados por qualquer representante da mesma instituição.
 *
 * Falha fechada: representante sem instituição não vê nada. A resposta para processo fora do
 * escopo continua sendo 404 (quem chama usa findFirst), para não revelar que o processo existe.
 */
export function escopoProcesso(usuario: UsuarioAutenticado): Prisma.ProcessoWhereInput {
  if (usuario.perfil === Perfil.COORDENACAO_SES) return {};
  if (!usuario.instituicao) return { id: { in: [] } };
  return { criadoPor: { instituicao: usuario.instituicao } };
}
