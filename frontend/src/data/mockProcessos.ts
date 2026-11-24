import type { StatusProcesso } from '../domain/processo.ts';

// Dados fictícios da Lista de processos (esqueleto). Substituir pela API quando a task de
// integração entrar (Sprint 2). Os campos seguem a tabela `processos` do backend.

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
