import { AxiosError, CanceledError } from 'axios';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from './api.ts';
import { ArquivoRepetidoError } from './processoService.ts';
import {
  ArquivoRecusadoError,
  enviarDocumento,
  UploadCanceladoError,
  UploadFalhouError,
} from './uploadService.ts';

const arquivo = new File(['%PDF-1.4'], 'apolice.pdf', { type: 'application/pdf' });
const dados = { arquivo, tipo: 'apolice' as const };

function erroHttp(status: number, data: unknown = {}) {
  return new AxiosError('x', 'ERR', undefined, undefined, { status, data } as never);
}

afterEach(() => vi.restoreAllMocks());

describe('enviarDocumento', () => {
  it('envia multipart com tipo, estagiário e arquivo, e informa o progresso', async () => {
    const post = vi.spyOn(api, 'post').mockImplementation(async (_url, _corpo, config) => {
      config?.onUploadProgress?.({ loaded: 5, total: 10 } as never);
      return { data: { id: 'd1', hashSha256: 'abc' } };
    });
    const progresso: number[] = [];
    const r = await enviarDocumento('p1', { ...dados, estagiarioId: 'e1' }, { onProgresso: (p) => progresso.push(p) });

    expect(r).toEqual({ id: 'd1', hashSha256: 'abc' });
    expect(progresso).toEqual([50, 100]);
    const [url, corpo] = post.mock.calls[0] as [string, FormData];
    expect(url).toBe('/processos/p1/documentos');
    expect(corpo.get('tipo')).toBe('apolice');
    expect(corpo.get('estagiarioId')).toBe('e1');
    expect((corpo.get('arquivo') as File).name).toBe('apolice.pdf');
  });

  it('409 vira ArquivoRepetidoError', async () => {
    vi.spyOn(api, 'post').mockRejectedValue(erroHttp(409));
    await expect(enviarDocumento('p1', dados)).rejects.toBeInstanceOf(ArquivoRepetidoError);
  });

  it('400 e 413 viram ArquivoRecusadoError com o motivo da API', async () => {
    vi.spyOn(api, 'post').mockRejectedValue(erroHttp(400, { motivo: 'apenas arquivos PDF são aceitos' }));
    await expect(enviarDocumento('p1', dados)).rejects.toMatchObject({
      name: 'ArquivoRecusadoError',
      motivo: 'apenas arquivos PDF são aceitos',
    });
    vi.spyOn(api, 'post').mockRejectedValue(erroHttp(413));
    await expect(enviarDocumento('p1', dados)).rejects.toBeInstanceOf(ArquivoRecusadoError);
  });

  it('cancelamento vira UploadCanceladoError', async () => {
    vi.spyOn(api, 'post').mockRejectedValue(new CanceledError());
    await expect(enviarDocumento('p1', dados)).rejects.toBeInstanceOf(UploadCanceladoError);
  });

  it('rede e 5xx viram UploadFalhouError', async () => {
    vi.spyOn(api, 'post').mockRejectedValue(erroHttp(503));
    await expect(enviarDocumento('p1', dados)).rejects.toBeInstanceOf(UploadFalhouError);
    vi.spyOn(api, 'post').mockRejectedValue(new AxiosError('Network Error'));
    await expect(enviarDocumento('p1', dados)).rejects.toBeInstanceOf(UploadFalhouError);
  });
});
