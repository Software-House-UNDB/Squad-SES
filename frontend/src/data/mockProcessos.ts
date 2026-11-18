import type { BadgeVariant } from '../components/ui/Badge.tsx';

// Dados fictícios da Lista de processos (esqueleto). Substituir pela API quando a task de
// integração entrar (Sprint 2). Os campos seguem a tabela `processos` do backend.

// Máquina de estados do processo (RF-07), igual ao enum StatusProcesso do Prisma.
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

export const STATUS_PROCESSO_VARIANT: Record<StatusProcesso, BadgeVariant> = {
  rascunho: 'neutral',
  enviado: 'info',
  em_analise: 'pending',
  pendencia: 'warning',
  aprovado: 'approved',
  aguardando_assinaturas: 'info',
  concluido: 'closed',
};

/** Um lote semestral de documentação de estagiários enviado pela UNDB. */
export interface ProcessoResumo {
  id: string;
  numero: string;
  autor: string;
  status: StatusProcesso;
  qtdEstagiarios: number;
  /** ISO 8601 (processos.criado_em). */
  enviadoEm: string;
  /** ISO 8601; só existe quando o processo foi concluído. */
  concluidoEm: string | null;
}

export const mockProcessos: ProcessoResumo[] = [
  {
    id: '1',
    numero: 'PROC-2026/004',
    autor: 'Ana Beatriz Souza',
    status: 'enviado',
    qtdEstagiarios: 48,
    enviadoEm: '2026-11-10T14:20:00Z',
    concluidoEm: null,
  },
  {
    id: '2',
    numero: 'PROC-2026/003',
    autor: 'Carlos Henrique Lima',
    status: 'em_analise',
    qtdEstagiarios: 112,
    enviadoEm: '2026-10-28T09:05:00Z',
    concluidoEm: null,
  },
  {
    id: '3',
    numero: 'PROC-2026/002',
    autor: 'Ana Beatriz Souza',
    status: 'pendencia',
    qtdEstagiarios: 73,
    enviadoEm: '2026-10-15T16:40:00Z',
    concluidoEm: null,
  },
  {
    id: '4',
    numero: 'PROC-2026/001',
    autor: 'Marina Costa Ribeiro',
    status: 'concluido',
    qtdEstagiarios: 205,
    enviadoEm: '2026-08-04T11:00:00Z',
    concluidoEm: '2026-09-02T17:30:00Z',
  },
];
