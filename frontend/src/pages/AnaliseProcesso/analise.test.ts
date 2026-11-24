import { describe, expect, it } from 'vitest';
import {
  agruparDocumentos,
  decisaoVisivel,
  documentosComPendencia,
  ordenarResumos,
  podeAprovarProcesso,
  podeDecidir,
  podeDevolverProcesso,
  podeReenviar,
  podeSubstituir,
  progresso,
  resumirProcesso,
  ultimaPendencia,
  validarComentario,
  type DocumentoAnalise,
  type ProcessoAnalise,
  type ResumoProcesso,
} from './analise.ts';

const doc = (id: string, decisao: DocumentoAnalise['decisao'], estagiario?: string): DocumentoAnalise => ({
  id,
  rotulo: id,
  tipo: estagiario ? 'documento_pessoal' : 'apolice',
  estagiario,
  nomeArquivo: `${id}.pdf`,
  tamanhoBytes: 1024,
  hashSha256: 'a'.repeat(64),
  versao: 1,
  decisao,
  comentarios: [],
});

describe('progresso', () => {
  it('conta documentos já decididos', () => {
    expect(progresso([doc('a', 'aprovado'), doc('b', 'pendencia'), doc('c', 'pendente')])).toEqual({
      analisados: 2,
      total: 3,
    });
  });
  it('lista vazia = 0 de 0', () => {
    expect(progresso([])).toEqual({ analisados: 0, total: 0 });
  });
});

describe('podeDecidir', () => {
  it('só em análise', () => {
    expect(podeDecidir('em_analise')).toBe(true);
    for (const s of ['rascunho', 'enviado', 'pendencia', 'aprovado', 'aguardando_assinaturas', 'concluido'] as const) {
      expect(podeDecidir(s)).toBe(false);
    }
  });
});

describe('podeAprovarProcesso (RF-08)', () => {
  it('exige todos aprovados', () => {
    expect(podeAprovarProcesso('em_analise', [doc('a', 'aprovado'), doc('b', 'aprovado')])).toBe(true);
    expect(podeAprovarProcesso('em_analise', [doc('a', 'aprovado'), doc('b', 'pendente')])).toBe(false);
    expect(podeAprovarProcesso('em_analise', [doc('a', 'aprovado'), doc('b', 'pendencia')])).toBe(false);
  });
  it('recusa processo sem documentos e fora de análise', () => {
    expect(podeAprovarProcesso('em_analise', [])).toBe(false);
    expect(podeAprovarProcesso('enviado', [doc('a', 'aprovado')])).toBe(false);
  });
});

describe('podeDevolverProcesso', () => {
  it('exige ao menos uma pendência e análise em andamento', () => {
    expect(podeDevolverProcesso('em_analise', [doc('a', 'aprovado'), doc('b', 'pendencia')])).toBe(true);
    expect(podeDevolverProcesso('em_analise', [doc('a', 'aprovado')])).toBe(false);
    expect(podeDevolverProcesso('aprovado', [doc('b', 'pendencia')])).toBe(false);
  });
});

describe('validarComentario (RF-12)', () => {
  it('recusa vazio e só espaços', () => {
    expect(validarComentario('')).not.toBeNull();
    expect(validarComentario('   \n ')).not.toBeNull();
  });
  it('recusa texto acima de 1000 caracteres', () => {
    expect(validarComentario('x'.repeat(1001))).not.toBeNull();
  });
  it('aceita texto válido', () => {
    expect(validarComentario('Apólice vencida.')).toBeNull();
    expect(validarComentario('x'.repeat(1000))).toBeNull();
  });
});

describe('agruparDocumentos', () => {
  it('separa os do processo e agrupa por estagiário, preservando a ordem', () => {
    const grupos = agruparDocumentos([
      doc('apolice', 'pendente'),
      doc('p-ana', 'pendente', 'Ana'),
      doc('p-bia', 'pendente', 'Bia'),
      doc('d-ana', 'pendente', 'Ana'),
    ]);
    expect(grupos.map((g) => g.titulo)).toEqual(['Do processo', 'Ana', 'Bia']);
    expect(grupos[1].documentos.map((d) => d.id)).toEqual(['p-ana', 'd-ana']);
  });
  it('omite grupo "Do processo" quando não há documentos gerais', () => {
    expect(agruparDocumentos([doc('x', 'pendente', 'Ana')]).map((g) => g.titulo)).toEqual(['Ana']);
  });
});

const comentario = (id: string, tipo: 'pendencia' | 'observacao', texto: string) => ({
  id,
  autor: 'Coordenação SES',
  tipo,
  texto,
  criadoEm: '2026-11-12T14:05:00.000Z',
});

describe('documentosComPendencia', () => {
  it('lista só os documentos em pendência, na ordem original', () => {
    const docs = [doc('a', 'aprovado'), doc('b', 'pendencia'), doc('c', 'pendente'), doc('d', 'pendencia')];
    expect(documentosComPendencia(docs).map((d) => d.id)).toEqual(['b', 'd']);
  });
});

describe('ultimaPendencia', () => {
  it('devolve o texto do comentário de pendência mais recente', () => {
    const d = {
      ...doc('a', 'pendencia'),
      comentarios: [
        comentario('1', 'pendencia', 'Apólice vencida.'),
        comentario('2', 'observacao', 'Sem pressa.'),
        comentario('3', 'pendencia', 'Falta a assinatura.'),
      ],
    };
    expect(ultimaPendencia(d)).toBe('Falta a assinatura.');
  });
  it('sem comentário de pendência = null', () => {
    expect(ultimaPendencia(doc('a', 'pendente'))).toBeNull();
    expect(ultimaPendencia({ ...doc('a', 'pendente'), comentarios: [comentario('1', 'observacao', 'x')] })).toBeNull();
  });
});

describe('podeSubstituir', () => {
  it('só o documento em pendência, com o processo devolvido', () => {
    expect(podeSubstituir('pendencia', doc('a', 'pendencia'))).toBe(true);
    expect(podeSubstituir('pendencia', doc('a', 'aprovado'))).toBe(false);
    expect(podeSubstituir('pendencia', doc('a', 'pendente'))).toBe(false);
  });
  it('recusa fora do status pendencia, mesmo com o documento em pendência', () => {
    for (const s of ['rascunho', 'enviado', 'em_analise', 'aprovado', 'aguardando_assinaturas', 'concluido'] as const) {
      expect(podeSubstituir(s, doc('a', 'pendencia'))).toBe(false);
    }
  });
});

describe('podeReenviar (RF-07, RF-08)', () => {
  it('libera quando não resta nenhuma pendência aberta', () => {
    expect(podeReenviar('pendencia', [doc('a', 'aprovado'), doc('b', 'pendente')])).toBe(true);
  });
  it('bloqueia enquanto houver pendência aberta', () => {
    expect(podeReenviar('pendencia', [doc('a', 'aprovado'), doc('b', 'pendencia')])).toBe(false);
  });
  it('bloqueia fora do status pendencia e sem documentos', () => {
    expect(podeReenviar('enviado', [doc('a', 'pendente')])).toBe(false);
    expect(podeReenviar('em_analise', [doc('a', 'aprovado')])).toBe(false);
    expect(podeReenviar('pendencia', [])).toBe(false);
  });
});

const processo = (over: Partial<ProcessoAnalise> & Pick<ProcessoAnalise, 'id'>): ProcessoAnalise => ({
  numero: `2026/${over.id}`,
  status: 'enviado',
  instituicao: 'UNDB',
  enviadoEm: '2026-11-10T13:20:00.000Z',
  estagiarios: 2,
  documentos: [],
  ...over,
});

describe('resumirProcesso', () => {
  it('conta documentos, analisados e pendências abertas', () => {
    const r = resumirProcesso(
      processo({
        id: '1',
        status: 'pendencia',
        documentos: [doc('a', 'aprovado'), doc('b', 'pendencia'), doc('c', 'pendente')],
      }),
    );
    expect(r).toEqual({
      id: '1',
      numero: '2026/1',
      status: 'pendencia',
      enviadoEm: '2026-11-10T13:20:00.000Z',
      estagiarios: 2,
      totalDocumentos: 3,
      analisados: 2,
      pendencias: 1,
    });
  });
});

describe('pendência só vale para o representante depois da devolução', () => {
  it('decisaoVisivel: a pendência fica oculta enquanto o processo não foi devolvido', () => {
    expect(decisaoVisivel('pendencia', 'pendencia')).toBe('pendencia');
    expect(decisaoVisivel('em_analise', 'pendencia')).toBe('pendente');
    expect(decisaoVisivel('enviado', 'pendencia')).toBe('pendente');
  });
  it('decisaoVisivel: aprovado e não analisado não mudam', () => {
    for (const s of ['enviado', 'em_analise', 'pendencia', 'aprovado'] as const) {
      expect(decisaoVisivel(s, 'aprovado')).toBe('aprovado');
      expect(decisaoVisivel(s, 'pendente')).toBe('pendente');
    }
  });
  it('resumirProcesso: só conta pendências abertas de um processo devolvido', () => {
    const docs = [doc('a', 'aprovado'), doc('b', 'pendencia')];
    expect(resumirProcesso(processo({ id: '1', status: 'em_analise', documentos: docs })).pendencias).toBe(0);
    expect(resumirProcesso(processo({ id: '1', status: 'pendencia', documentos: docs })).pendencias).toBe(1);
  });
});

describe('ordenarResumos', () => {
  const r = (id: string, status: ResumoProcesso['status'], enviadoEm: string): ResumoProcesso => ({
    id,
    numero: id,
    status,
    enviadoEm,
    estagiarios: 1,
    totalDocumentos: 1,
    analisados: 0,
    pendencias: 0,
  });
  it('devolvidos primeiro; depois o mais recente; não altera a lista de entrada', () => {
    const entrada = [
      r('antigo', 'enviado', '2026-10-01T00:00:00.000Z'),
      r('devolvido', 'pendencia', '2026-09-01T00:00:00.000Z'),
      r('novo', 'em_analise', '2026-11-01T00:00:00.000Z'),
    ];
    expect(ordenarResumos(entrada).map((x) => x.id)).toEqual(['devolvido', 'novo', 'antigo']);
    expect(entrada.map((x) => x.id)).toEqual(['antigo', 'devolvido', 'novo']);
  });
});
