/** Data no formato brasileiro, no horário de Brasília (o mesmo em todas as telas). `null` vira "—". */
export const formatarData = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—';
