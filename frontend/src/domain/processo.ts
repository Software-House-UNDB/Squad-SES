import type { BadgeVariant } from '../components/ui/Badge.tsx';

// Fonte única do status de processo (RF-07). Mudar a máquina de estados = mudar só aqui.

// Igual ao enum StatusProcesso do Prisma, na ordem do fluxo.
export const STATUS_PROCESSO = [
  'rascunho',
  'enviado',
  'em_analise',
  'pendencia',
  'aprovado',
  'aguardando_assinaturas',
  'concluido',
] as const;

export type StatusProcesso = (typeof STATUS_PROCESSO)[number];

export const STATUS_PROCESSO_LABEL: Record<StatusProcesso, string> = {
  rascunho: 'Rascunho',
  enviado: 'Enviado',
  em_analise: 'Em análise',
  pendencia: 'Pendência',
  aprovado: 'Aprovado',
  aguardando_assinaturas: 'Aguardando assinaturas',
  concluido: 'Concluído',
};

// Mapeamento canônico (issue #43): azul = esperando a próxima etapa; amarelo = ação em curso.
export const STATUS_PROCESSO_VARIANT: Record<StatusProcesso, BadgeVariant> = {
  rascunho: 'neutral',
  enviado: 'info',
  em_analise: 'pending',
  pendencia: 'warning',
  aprovado: 'approved',
  aguardando_assinaturas: 'info',
  concluido: 'closed',
};

export const ehStatusProcesso = (valor: unknown): valor is StatusProcesso =>
  typeof valor === 'string' && (STATUS_PROCESSO as readonly string[]).includes(valor);
