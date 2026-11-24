import { beforeEach, describe, expect, it } from 'vitest';
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
    // O estado persistido é `aprovado`; a geração dos TCEs (→ aguardando_assinaturas) é passo do sistema.
    expect((await concluirAnalise('demo', 'aprovado')).status).toBe('aprovado');
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

  describe('ciclo de correção do representante', () => {
    const novo = (nome: string) => ({ nomeArquivo: nome, tamanhoBytes: 2048, hashSha256: `h-${nome}`.padEnd(64, '0') });

    it('lista os processos da instituição com os devolvidos primeiro', async () => {
      const lista = await listarMeusProcessos();
      expect(lista[0]).toMatchObject({ id: 'devolvido', status: 'pendencia', pendencias: 2 });
      expect(lista.map((r) => r.id)).toEqual(expect.arrayContaining(['demo', 'em-analise', 'aprovado', 'devolvido']));
    });

    it('substituir exige processo devolvido e documento em pendência', async () => {
      await expect(substituirDocumento('demo', 'apolice', novo('a.pdf'))).rejects.toBeInstanceOf(TransicaoInvalidaError);
      await expect(substituirDocumento('devolvido', 'plano-atividades', novo('a.pdf'))).rejects.toBeInstanceOf(
        TransicaoInvalidaError,
      );
      await expect(substituirDocumento('devolvido', 'nao-existe', novo('a.pdf'))).rejects.toBeInstanceOf(
        TransicaoInvalidaError,
      );
      await expect(substituirDocumento('nao-existe', 'apolice', novo('a.pdf'))).rejects.toBeInstanceOf(
        ProcessoNaoEncontradoError,
      );
    });

    it('substituir sobe a versão, volta o documento a "não analisado" e preserva o histórico', async () => {
      const antes = (await buscarProcessoParaAnalise('devolvido')).documentos.find((d) => d.id === 'apolice')!;
      const p = await substituirDocumento('devolvido', 'apolice', novo('apolice-v2.pdf'));
      const d = p.documentos.find((x) => x.id === 'apolice')!;
      expect(d).toMatchObject({
        versao: antes.versao + 1,
        decisao: 'pendente',
        nomeArquivo: 'apolice-v2.pdf',
        tamanhoBytes: 2048,
      });
      expect(d.hashSha256).toBe(novo('apolice-v2.pdf').hashSha256);
      expect(d.comentarios).toEqual(antes.comentarios);
      // Opção A: os documentos já aprovados continuam aprovados.
      expect(p.documentos.filter((x) => x.decisao === 'aprovado').length).toBeGreaterThan(0);
    });

    it('recusa arquivo com o mesmo conteúdo de outro documento do processo ou do próprio', async () => {
      const p = await buscarProcessoParaAnalise('devolvido');
      const outro = p.documentos.find((d) => d.decisao === 'aprovado')!;
      await expect(
        substituirDocumento('devolvido', 'apolice', { ...novo('x.pdf'), hashSha256: outro.hashSha256 }),
      ).rejects.toBeInstanceOf(ArquivoRepetidoError);
      const proprio = p.documentos.find((d) => d.id === 'apolice')!;
      await expect(
        substituirDocumento('devolvido', 'apolice', { ...novo('x.pdf'), hashSha256: proprio.hashSha256 }),
      ).rejects.toBeInstanceOf(ArquivoRepetidoError);
    });

    it('sem hash (navegador sem SubtleCrypto) o serviço gera o seu e segue', async () => {
      const p = await substituirDocumento('devolvido', 'apolice', { nomeArquivo: 'a.pdf', tamanhoBytes: 10 });
      expect(p.documentos.find((d) => d.id === 'apolice')!.hashSha256).toMatch(/^[0-9a-f]{64}$/);
    });

    it('reenviar só com todas as pendências corrigidas: pendencia → enviado', async () => {
      await expect(reenviarProcesso('devolvido')).rejects.toBeInstanceOf(TransicaoInvalidaError);
      const abertas = (await buscarProcessoParaAnalise('devolvido')).documentos.filter((d) => d.decisao === 'pendencia');
      for (const d of abertas) await substituirDocumento('devolvido', d.id, novo(`${d.id}-v2.pdf`));
      const p = await reenviarProcesso('devolvido');
      expect(p.status).toBe('enviado');
      await expect(reenviarProcesso('devolvido')).rejects.toBeInstanceOf(TransicaoInvalidaError);
    });

    it('fecha o ciclo com a coordenação: o reenviado volta à análise e mantém os aprovados', async () => {
      const abertas = (await buscarProcessoParaAnalise('devolvido')).documentos.filter((d) => d.decisao === 'pendencia');
      for (const d of abertas) await substituirDocumento('devolvido', d.id, novo(`${d.id}-v2.pdf`));
      await reenviarProcesso('devolvido');
      const emAnalise = await iniciarAnalise('devolvido');
      expect(emAnalise.status).toBe('em_analise');
      const aprovados = emAnalise.documentos.filter((d) => d.decisao === 'aprovado');
      const naoAnalisados = emAnalise.documentos.filter((d) => d.decisao === 'pendente');
      expect(aprovados.length).toBe(emAnalise.documentos.length - abertas.length);
      expect(naoAnalisados.map((d) => d.id).sort()).toEqual(abertas.map((d) => d.id).sort());
    });
  });
});
