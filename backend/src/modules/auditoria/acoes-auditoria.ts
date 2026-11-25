// Lista canônica de valores de `auditoria.acao`. Constante no código (e não enum no
// Prisma): a coluna segue `String`, então uma ação nova não exige migration no Neon.
export const ACOES_AUDITORIA = [
  'CREATE',
  'UPDATE',
  'DELETE',
  'IMPORT_LOTE',
  // Coordenação SES registra a observação de análise (PATCH /processos/:id/analise).
  'ANALISE',
  // Mudança de status pela máquina de estados (RF-07): enviar, iniciar análise,
  // apontar pendência, aprovar. dadosAntes/dadosDepois trazem o status.
  'TRANSICAO',
  // Coordenação SES anexa documento de retorno (ofício carimbado, kit de estágio...).
  'RETORNO_COORDENACAO',
  // Ato de assinar (RF-15), uma por signatário.
  'ASSINATURA',
] as const;

export type AcaoAuditoria = (typeof ACOES_AUDITORIA)[number];

export const ehAcaoAuditoria = (valor: unknown): valor is AcaoAuditoria =>
  typeof valor === 'string' && (ACOES_AUDITORIA as readonly string[]).includes(valor);
