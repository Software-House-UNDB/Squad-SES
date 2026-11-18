import { describe, expect, it } from 'vitest';
import {
  agruparDocumentos,
  podeAprovarProcesso,
  podeDecidir,
  podeDevolverProcesso,
  progresso,
  validarComentario,
  type DocumentoAnalise,
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
