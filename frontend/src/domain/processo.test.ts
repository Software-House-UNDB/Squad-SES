import { describe, expect, it } from 'vitest';
import {
  STATUS_PROCESSO,
  STATUS_PROCESSO_LABEL,
  STATUS_PROCESSO_VARIANT,
  ehStatusProcesso,
} from './processo.ts';

describe('domínio do status do processo (RF-07)', () => {
  it('lista os 7 estados na ordem da máquina de estados', () => {
    expect(STATUS_PROCESSO).toEqual([
      'rascunho',
      'enviado',
      'em_analise',
      'pendencia',
      'aprovado',
      'aguardando_assinaturas',
      'concluido',
    ]);
  });

  it('tem rótulo e variante para todos os estados, sem sobra', () => {
    expect(Object.keys(STATUS_PROCESSO_LABEL).sort()).toEqual([...STATUS_PROCESSO].sort());
    expect(Object.keys(STATUS_PROCESSO_VARIANT).sort()).toEqual([...STATUS_PROCESSO].sort());
  });

  it('usa o mapeamento canônico definido na issue #43', () => {
    expect(STATUS_PROCESSO_VARIANT).toEqual({
      rascunho: 'neutral',
      enviado: 'info',
      em_analise: 'pending',
      pendencia: 'warning',
      aprovado: 'approved',
      aguardando_assinaturas: 'info',
      concluido: 'closed',
    });
    expect(STATUS_PROCESSO_LABEL.em_analise).toBe('Em análise');
    expect(STATUS_PROCESSO_LABEL.aguardando_assinaturas).toBe('Aguardando assinaturas');
  });

  it('ehStatusProcesso aceita só valores da máquina de estados', () => {
    expect(ehStatusProcesso('aprovado')).toBe(true);
    expect(ehStatusProcesso('Aprovado')).toBe(false);
    expect(ehStatusProcesso('arquivado')).toBe(false);
    expect(ehStatusProcesso(null)).toBe(false);
  });
});
