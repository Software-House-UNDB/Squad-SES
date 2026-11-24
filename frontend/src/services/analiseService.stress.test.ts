import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProcessoAnalise } from '../pages/AnaliseProcesso/analise.ts';
import type { StatusProcesso } from '../domain/processo.ts';
import { agruparDocumentos } from '../pages/AnaliseProcesso/analise.ts';
import {
  buscarProcessoParaAnalise,
  concluirAnalise,
  decidirDocumento,
  iniciarAnalise,
  listarMeusProcessos,
  ProcessoNaoEncontradoError,
  reenviarProcesso,
  reiniciarBaseDeExemplo,
  substituirDocumento,
  TransicaoInvalidaError,
} from './analiseService.ts';
import { ArquivoRepetidoError } from './processoService.ts';

// Teste de estresse: sequências aleatórias (com semente fixa, reproduzíveis) de TODAS as operações,
// de coordenação e representante, misturadas e fora de ordem. Depois de cada operação confere
// regras que nunca podem ser violadas, aconteça o que acontecer.

function prng(semente: number) {
  let s = semente >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const IDS = ['demo', 'em-analise', 'aprovado', 'devolvido'];
const STATUS_VALIDOS: StatusProcesso[] = [
  'rascunho',
  'enviado',
  'em_analise',
  'pendencia',
  'aprovado',
  'aguardando_assinaturas',
  'concluido',
];
// Transições que o PDF permite (RF-07). Qualquer outra é defeito.
const TRANSICOES: Record<string, StatusProcesso[]> = {
  enviado: ['em_analise'],
  em_analise: ['aprovado', 'pendencia'],
  pendencia: ['enviado'],
};

const COMENTARIOS = ['', '   ', 'Apólice vencida.', 'x'.repeat(1000), 'x'.repeat(1001), '<img src=x onerror=alert(1)>', '\n\n'];
// Pool pequeno de hashes: força colisões (arquivo repetido) com frequência.
const HASHES = ['a'.repeat(64), 'b'.repeat(64), 'c'.repeat(64), 'd'.repeat(64), undefined];

// Cada operação do serviço espera um setTimeout (~15 ms medidos neste ambiente). Com milhares de
// operações isso estoura qualquer limite sem dizer nada sobre as regras; aqui o atraso vira microtarefa.
// A ordem assíncrona se mantém (continua sendo uma promessa), só some a espera.
beforeEach(() => {
  vi.stubGlobal('setTimeout', (fn: () => void) => {
    queueMicrotask(fn);
    return 0;
  });
});
afterEach(() => vi.unstubAllGlobals());

type Foto = Map<string, ProcessoAnalise>;

async function fotografar(): Promise<Foto> {
  const foto: Foto = new Map();
  for (const id of IDS) foto.set(id, await buscarProcessoParaAnalise(id));
  return foto;
}

function conferir(antes: Foto, depois: Foto, contexto: string) {
  for (const [id, p] of depois) {
    const a = antes.get(id)!;
    const ctx = `${contexto} [${id}]`;
    expect(STATUS_VALIDOS, ctx).toContain(p.status);
    if (p.status !== a.status) expect(TRANSICOES[a.status] ?? [], `${ctx}: ${a.status} → ${p.status}`).toContain(p.status);
    if (p.status === 'aprovado' || p.status === 'aguardando_assinaturas') {
      expect(p.documentos.every((d) => d.decisao === 'aprovado'), `${ctx}: aprovado com documento não aprovado`).toBe(true);
    }
    if (p.status === 'enviado') {
      expect(p.documentos.some((d) => d.decisao === 'pendencia'), `${ctx}: enviado com pendência aberta`).toBe(false);
    }
    expect(p.documentos.map((d) => d.id), `${ctx}: documentos mudaram`).toEqual(a.documentos.map((d) => d.id));
    const hashes = p.documentos.map((d) => d.hashSha256);
    expect(new Set(hashes).size, `${ctx}: hash repetido no processo`).toBe(hashes.length);
    for (const d of p.documentos) {
      const antigo = a.documentos.find((x) => x.id === d.id)!;
      expect(d.versao, `${ctx}/${d.id}: versão diminuiu`).toBeGreaterThanOrEqual(antigo.versao);
      expect(d.comentarios.slice(0, antigo.comentarios.length), `${ctx}/${d.id}: comentário perdido`).toEqual(antigo.comentarios);
      if (d.decisao === 'pendencia') {
        expect(
          d.comentarios.some((c) => c.tipo === 'pendencia' && c.texto.trim() !== ''),
          `${ctx}/${d.id}: pendência sem comentário`,
        ).toBe(true);
      }
      expect(new Set(d.comentarios.map((c) => c.id)).size, `${ctx}/${d.id}: id de comentário repetido`).toBe(d.comentarios.length);
      for (const c of d.comentarios) expect(c.texto.length, `${ctx}/${d.id}: comentário gigante`).toBeLessThanOrEqual(1000);
    }
  }
}

const PERMITIDOS = [TransicaoInvalidaError, ArquivoRepetidoError, ProcessoNaoEncontradoError];

describe('analiseService — estresse com operações aleatórias', () => {
  beforeEach(() => reiniciarBaseDeExemplo());

  it.each([1, 2, 3, 7, 42, 2026, 31337, 99999])('semente %i: 150 operações mantêm todas as regras', async (semente) => {
    const rnd = prng(semente);
    const sorteia = <T,>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)];
    let foto = await fotografar();

    for (let passo = 0; passo < 150; passo++) {
      const id = sorteia(IDS);
      const doc = sorteia(foto.get(id)!.documentos).id;
      const op = Math.floor(rnd() * 6);
      const nome = ['iniciar', 'decidir', 'concluir', 'substituir', 'reenviar', 'listar'][op];
      try {
        if (op === 0) await iniciarAnalise(id);
        if (op === 1) {
          const decisao = sorteia(['aprovado', 'pendencia'] as const);
          await decidirDocumento(id, doc, { decisao, comentario: sorteia(COMENTARIOS) });
        }
        if (op === 2) await concluirAnalise(id, sorteia(['aprovado', 'pendencia'] as const));
        if (op === 3) {
          await substituirDocumento(id, doc, {
            nomeArquivo: `v${passo}.pdf`,
            tamanhoBytes: 1 + Math.floor(rnd() * 5000),
            hashSha256: sorteia(HASHES),
          });
        }
        if (op === 4) await reenviarProcesso(id);
        if (op === 5) expect((await listarMeusProcessos()).length).toBe(IDS.length);
      } catch (e) {
        if (!PERMITIDOS.some((C) => e instanceof C)) throw new Error(`passo ${passo} (${nome} ${id}/${doc}): erro inesperado: ${String(e)}`);
      }
      const depois = await fotografar();
      conferir(foto, depois, `semente ${semente}, passo ${passo} (${nome} ${id}/${doc})`);
      foto = depois;
    }
  });
});

describe('analiseService — entradas hostis', () => {
  beforeEach(() => reiniciarBaseDeExemplo());

  it.each(['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'prototype', ''])(
    'id "%s" é processo inexistente, nunca um erro estranho',
    async (id) => {
      await expect(buscarProcessoParaAnalise(id)).rejects.toBeInstanceOf(ProcessoNaoEncontradoError);
      await expect(iniciarAnalise(id)).rejects.toBeInstanceOf(ProcessoNaoEncontradoError);
      await expect(reenviarProcesso(id)).rejects.toBeInstanceOf(ProcessoNaoEncontradoError);
      await expect(
        substituirDocumento(id, 'apolice', { nomeArquivo: 'a.pdf', tamanhoBytes: 1 }),
      ).rejects.toBeInstanceOf(ProcessoNaoEncontradoError);
    },
  );

  it.each(['__proto__', 'constructor', 'toString'])('documento "%s" não pertence ao processo', async (docId) => {
    await expect(
      substituirDocumento('devolvido', docId, { nomeArquivo: 'a.pdf', tamanhoBytes: 1 }),
    ).rejects.toBeInstanceOf(TransicaoInvalidaError);
  });

  it.each([
    ['nome vazio', { nomeArquivo: '', tamanhoBytes: 10 }],
    ['nome só com espaços', { nomeArquivo: '   ', tamanhoBytes: 10 }],
    ['tamanho zero', { nomeArquivo: 'a.pdf', tamanhoBytes: 0 }],
    ['tamanho negativo', { nomeArquivo: 'a.pdf', tamanhoBytes: -5 }],
    ['tamanho NaN', { nomeArquivo: 'a.pdf', tamanhoBytes: Number.NaN }],
    ['tamanho infinito', { nomeArquivo: 'a.pdf', tamanhoBytes: Number.POSITIVE_INFINITY }],
  ])('substituir recusa %s e não altera o documento', async (_nome, arquivo) => {
    const antes = await buscarProcessoParaAnalise('devolvido');
    await expect(substituirDocumento('devolvido', 'apolice', arquivo)).rejects.toBeInstanceOf(TransicaoInvalidaError);
    expect(await buscarProcessoParaAnalise('devolvido')).toEqual(antes);
  });

  it('hash repetido é detectado mesmo em maiúsculas', async () => {
    const p = await buscarProcessoParaAnalise('devolvido');
    const outro = p.documentos.find((d) => d.decisao === 'aprovado')!;
    await expect(
      substituirDocumento('devolvido', 'apolice', {
        nomeArquivo: 'x.pdf',
        tamanhoBytes: 10,
        hashSha256: outro.hashSha256.toUpperCase(),
      }),
    ).rejects.toBeInstanceOf(ArquivoRepetidoError);
  });

  it('operações simultâneas no mesmo documento: só uma vence, a outra é recusada, sem estado partido', async () => {
    const arquivo = (n: string) => ({ nomeArquivo: n, tamanhoBytes: 10, hashSha256: n.padEnd(64, '0') });
    const resultados = await Promise.allSettled([
      substituirDocumento('devolvido', 'apolice', arquivo('a')),
      substituirDocumento('devolvido', 'apolice', arquivo('b')),
      substituirDocumento('devolvido', 'apolice', arquivo('c')),
    ]);
    expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const doc = (await buscarProcessoParaAnalise('devolvido')).documentos.find((d) => d.id === 'apolice')!;
    expect(doc.versao).toBe(2);
  });

  it('dois reenvios simultâneos: um passa, o outro é recusado', async () => {
    const p = await buscarProcessoParaAnalise('devolvido');
    for (const d of p.documentos.filter((x) => x.decisao === 'pendencia')) {
      await substituirDocumento('devolvido', d.id, { nomeArquivo: `${d.id}.pdf`, tamanhoBytes: 5, hashSha256: d.id.padEnd(64, '1') });
    }
    const r = await Promise.allSettled([reenviarProcesso('devolvido'), reenviarProcesso('devolvido')]);
    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect((await buscarProcessoParaAnalise('devolvido')).status).toBe('enviado');
  });

  it('muito arquivo repetido em sequência não vaza memória nem trava (1000 tentativas)', async () => {
    const t0 = performance.now();
    for (let i = 0; i < 1000; i++) {
      await substituirDocumento('devolvido', 'apolice', { nomeArquivo: 'a.pdf', tamanhoBytes: 1, hashSha256: 'e'.repeat(64) }).catch(() => undefined);
    }
    expect(performance.now() - t0).toBeLessThan(3000);
  });
});

describe('agruparDocumentos — volume', () => {
  it('5000 documentos de um mesmo estagiário agrupam rápido', () => {
    const docs = Array.from({ length: 5000 }, (_, i) => ({
      id: `d${i}`,
      rotulo: 'Doc',
      tipo: 'documento_pessoal',
      estagiario: 'Ana',
      nomeArquivo: 'a.pdf',
      tamanhoBytes: 1,
      hashSha256: String(i).padStart(64, '0'),
      versao: 1,
      decisao: 'pendente' as const,
      comentarios: [],
    }));
    const t0 = performance.now();
    const grupos = agruparDocumentos(docs);
    expect(performance.now() - t0).toBeLessThan(200);
    expect(grupos[0].documentos).toHaveLength(5000);
  });
});
