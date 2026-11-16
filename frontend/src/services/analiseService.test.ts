import { beforeEach, describe, expect, it } from 'vitest';
import {
  buscarProcessoParaAnalise,
  concluirAnalise,
  decidirDocumento,
  iniciarAnalise,
  ProcessoNaoEncontradoError,
  reiniciarBaseDeExemplo,
  TransicaoInvalidaError,
} from './analiseService.ts';

describe('analiseService (simulado)', () => {
  beforeEach(() => reiniciarBaseDeExemplo());

  it('processo inexistente', async () => {
    await expect(buscarProcessoParaAnalise('nao-existe')).rejects.toBeInstanceOf(ProcessoNaoEncontradoError);
  });

  it('iniciar análise só a partir de enviado', async () => {
    expect((await iniciarAnalise('demo')).status).toBe('em_analise');
    await expect(iniciarAnalise('demo')).rejects.toBeInstanceOf(TransicaoInvalidaError);
  });

  it('não decide documento fora de análise', async () => {
    await expect(decidirDocumento('demo', 'apolice', { decisao: 'aprovado' })).rejects.toBeInstanceOf(
      TransicaoInvalidaError,
    );
  });

  it('pendência exige comentário e o registra no documento', async () => {
    await iniciarAnalise('demo');
    await expect(decidirDocumento('demo', 'apolice', { decisao: 'pendencia', comentario: '  ' })).rejects.toBeInstanceOf(
      TransicaoInvalidaError,
    );
    const p = await decidirDocumento('demo', 'apolice', { decisao: 'pendencia', comentario: ' Vencida ' });
    const d = p.documentos.find((x) => x.id === 'apolice')!;
    expect(d.decisao).toBe('pendencia');
    expect(d.comentarios.at(-1)).toMatchObject({ tipo: 'pendencia', texto: 'Vencida' });
  });

  it('aprovar o processo exige todos os documentos aprovados', async () => {
    await iniciarAnalise('demo');
    await expect(concluirAnalise('demo', 'aprovado')).rejects.toBeInstanceOf(TransicaoInvalidaError);
    let p = await buscarProcessoParaAnalise('demo');
    for (const d of p.documentos) p = await decidirDocumento('demo', d.id, { decisao: 'aprovado' });
    expect((await concluirAnalise('demo', 'aprovado')).status).toBe('aguardando_assinaturas');
  });

  it('devolver exige ao menos uma pendência', async () => {
    await expect(concluirAnalise('em-analise', 'pendencia')).resolves.toMatchObject({ status: 'pendencia' });
    await iniciarAnalise('demo');
    await expect(concluirAnalise('demo', 'pendencia')).rejects.toBeInstanceOf(TransicaoInvalidaError);
  });

  it('devolve cópias: alterar o resultado não muda a base', async () => {
    const p = await buscarProcessoParaAnalise('demo');
    p.status = 'concluido';
    expect((await buscarProcessoParaAnalise('demo')).status).toBe('enviado');
  });
});
