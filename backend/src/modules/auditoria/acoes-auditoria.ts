// Lista canônica de valores de `auditoria.acao`. Constante no código (e não enum no
// Prisma): a coluna segue `String`, então uma ação nova não exige migration no Neon.
export const ACOES_AUDITORIA = [
  'CREATE',
  'UPDATE',
  'DELETE',
  'IMPORT_LOTE',
  // Coordenação SES registra a observação de análise (PATCH /processos/:id/analise).
  'ANALISE',
  // Coordenação SES anexa documento de retorno (ofício carimbado, kit de estágio...).
  'RETORNO_COORDENACAO',
  // Ato de assinar (RF-15), uma por signatário.
  'ASSINATURA',
  // Acesso (RF-23 + LGPD), gravados com registrarAcesso(). Login com sucesso.
  'LOGIN',
  // Login recusado (e-mail inexistente ou senha errada); usuario_id fica vazio.
  'LOGIN_FALHA',
  // Leitura de dados pessoais de estagiário: uma linha por estagiário exibido.
  'ACESSO',
  // URL assinada de documento gerada (abrir/baixar o PDF), logado ou pelo link de assinatura.
  'DOWNLOAD',
] as const;

export type AcaoAuditoria = (typeof ACOES_AUDITORIA)[number];

export const ehAcaoAuditoria = (valor: unknown): valor is AcaoAuditoria =>
  typeof valor === 'string' && (ACOES_AUDITORIA as readonly string[]).includes(valor);
