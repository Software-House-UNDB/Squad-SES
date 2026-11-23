import { act, renderHook, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSession } from '../auth/session.ts';
import { queryClient } from '../lib/queryClient.ts';
import RetornoSES from '../pages/AnaliseProcesso/RetornoSES.tsx';
import { useUploads } from '../pages/NovoProcesso/useUploads.ts';
import * as retorno from '../services/retornoService.ts';
import { loginAs, renderWithProviders } from '../test-utils.tsx';
import { STATUS_PROCESSO, type StatusProcesso } from './processo.ts';
import { ladoDoDocumento, podeEnviarRetorno, podeExcluirDocumento } from './retorno.ts';
import type { Perfil } from '../types/auth.ts';

vi.mock('../services/retornoService.ts', () => ({
  listarDocumentos: vi.fn(),
  removerDocumento: vi.fn(),
}));

// Oráculo independente: a tabela da issue #50/#48 escrita de outro jeito, sem reaproveitar o código testado.
function oraculoExcluir(perfil: Perfil, status: StatusProcesso, lado: 'UNDB' | 'SES') {
  if (perfil === 'COORDENACAO_SES') {
    return lado === 'SES' && (status === 'aprovado' || status === 'aguardando_assinaturas');
  }
  return lado === 'UNDB' && (status === 'rascunho' || status === 'pendencia');
}

// Gerador determinístico (mulberry32) para o teste ser reproduzível.
function semente(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('estresse: regras de retorno da SES', () => {
  it('matriz completa perfil × status × lado bate com o oráculo', () => {
    const perfis: Perfil[] = ['COORDENACAO_SES', 'REPRESENTANTE_UNDB'];
    let casos = 0;
    for (const perfil of perfis) {
      for (const status of STATUS_PROCESSO) {
        for (const lado of ['UNDB', 'SES'] as const) {
          const doc = { enviadoPorId: lado === 'UNDB' ? 'criador' : 'outro' };
          expect(podeExcluirDocumento({ perfil, status, doc, processo: { criadoPorId: 'criador' } })).toBe(
            oraculoExcluir(perfil, status, lado),
          );
          casos++;
        }
        expect(podeEnviarRetorno(perfil, status)).toBe(
          perfil === 'COORDENACAO_SES' && (status === 'aprovado' || status === 'aguardando_assinaturas'),
        );
      }
    }
    expect(casos).toBe(28);
  });

  it('100 mil combinações aleatórias (ids, perfis, status) nunca divergem do oráculo', () => {
    const rnd = semente(2026);
    const escolhe = <T,>(itens: readonly T[]) => itens[Math.floor(rnd() * itens.length)];
    const ids = ['criador', 'coord-1', 'coord-2', '', 'CRIADOR', 'criador ', '00000000-0000-0000-0000-000000000000'];
    for (let i = 0; i < 100_000; i++) {
      const perfil = escolhe<Perfil>(['COORDENACAO_SES', 'REPRESENTANTE_UNDB']);
      const status = escolhe(STATUS_PROCESSO);
      const enviadoPorId = escolhe(ids);
      const processo = { criadoPorId: escolhe(['criador', 'rep-2', ''] as const) };
      const lado = enviadoPorId === processo.criadoPorId ? 'UNDB' : 'SES';
      expect(ladoDoDocumento({ enviadoPorId }, processo)).toBe(lado);
      expect(podeExcluirDocumento({ perfil, status, doc: { enviadoPorId }, processo })).toBe(
        oraculoExcluir(perfil, status, lado),
      );
    }
  });

  it('coordenação e representante nunca podem excluir o mesmo documento ao mesmo tempo', () => {
    for (const status of STATUS_PROCESSO) {
      for (const enviadoPorId of ['criador', 'coord']) {
        const dados = { status, doc: { enviadoPorId }, processo: { criadoPorId: 'criador' } };
        const coord = podeExcluirDocumento({ perfil: 'COORDENACAO_SES', ...dados });
        const rep = podeExcluirDocumento({ perfil: 'REPRESENTANTE_UNDB', ...dados });
        expect(coord && rep).toBe(false);
      }
    }
  });
});

describe('estresse: envios paralelos no useUploads', () => {
  it('300 envios simultâneos terminam cada um no seu estado, sem vazar entre chaves', async () => {
    const { result } = renderHook(() => useUploads());
    const resultados: boolean[] = [];
    await act(async () => {
      resultados.push(
        ...(await Promise.all(
          Array.from({ length: 300 }, (_, i) =>
            result.current.enviar(`k${i}`, async ({ onProgresso }) => {
              onProgresso(10);
              await Promise.resolve();
              if (i % 3 === 0) throw new Error('falha simulada');
              onProgresso(100);
            }),
          ),
        )),
      );
    });
    expect(resultados.filter(Boolean)).toHaveLength(200);
    for (let i = 0; i < 300; i++) {
      expect(result.current.estados[`k${i}`]?.fase).toBe(i % 3 === 0 ? 'erro' : 'enviado');
    }
  });

  it('refazer o mesmo envio 200 vezes seguidas mantém um único estado e aborta o anterior', async () => {
    const { result } = renderHook(() => useUploads());
    const sinais: AbortSignal[] = [];
    await act(async () => {
      await Promise.all(
        Array.from({ length: 200 }, () =>
          result.current.enviar('mesmo', async ({ signal }) => {
            sinais.push(signal);
            await Promise.resolve();
          }),
        ),
      );
    });
    expect(Object.keys(result.current.estados)).toEqual(['mesmo']);
    expect(sinais.filter((s) => s.aborted).length).toBe(199);
  });
});

describe('estresse: tela com muitos documentos', () => {
  beforeEach(() => {
    clearSession();
    queryClient.clear();
  });

  it('renderiza 2000 documentos (1000 da SES) e só mostra excluir nos da SES', async () => {
    const docs = Array.from({ length: 2000 }, (_, i) => ({
      id: `d${i}`,
      processoId: 'p1',
      estagiarioId: null,
      tipo: i % 2 ? 'oficio' : 'plano_atividades',
      nomeArquivo: `arquivo-${i}.pdf`,
      tamanhoBytes: 1024 + i,
      hashSha256: 'a'.repeat(64),
      enviadoPorId: i % 2 ? `coord-${i % 7}` : 'criador',
      criadoEm: '2026-11-20T12:00:00.000Z',
    }));
    vi.mocked(retorno.listarDocumentos).mockResolvedValue(docs);
    loginAs('COORDENACAO_SES');

    const inicio = performance.now();
    renderWithProviders(<RetornoSES processoId="p1" status="aprovado" criadoPorId="criador" />);
    await screen.findByText('arquivo-1.pdf', {}, { timeout: 15_000 });
    const duracao = performance.now() - inicio;

    expect(screen.getAllByText('Retorno da SES')).toHaveLength(1000);
    expect(screen.getAllByRole('button', { name: /^Excluir / })).toHaveLength(1000);
    expect(screen.queryByText('arquivo-0.pdf')).not.toBeInTheDocument();
    expect(duracao).toBeLessThan(10_000);
  }, 30_000);
});
