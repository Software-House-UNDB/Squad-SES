import { AxiosError, CanceledError } from 'axios';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from './api.ts';
import { ArquivoRepetidoError } from './processoService.ts';
import {
  ArquivoRecusadoError,
  enviarDocumento,
  ProcessoForaDoStatusError,
  SemPermissaoError,
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

  it('o corpo chega ao adaptador como FormData, não como JSON (a instância api usa JSON por padrão)', async () => {
    let capturado: { data: unknown; contentType: unknown } | undefined;
    const adaptadorOriginal = api.defaults.adapter;
    api.defaults.adapter = async (config) => {
      capturado = { data: config.data, contentType: config.headers.getContentType() };
      return { data: { id: 'd1', hashSha256: 'abc' }, status: 200, statusText: 'OK', headers: {}, config };
    };
    try {
      await enviarDocumento('p1', dados);
    } finally {
      api.defaults.adapter = adaptadorOriginal;
    }
    expect(capturado?.data).toBeInstanceOf(FormData);
    expect(String(capturado?.contentType)).toContain('multipart/form-data');
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

  it('403 vira SemPermissaoError (tipo não permitido ou documento do outro lado)', async () => {
    vi.spyOn(api, 'post').mockRejectedValue(erroHttp(403, { message: 'A coordenação não envia documentos do tipo apolice' }));
    await expect(enviarDocumento('p1', dados)).rejects.toBeInstanceOf(SemPermissaoError);
  });

  it('409 por status do processo vira ProcessoForaDoStatusError, e não "arquivo repetido"', async () => {
    vi.spyOn(api, 'post').mockRejectedValue(
      erroHttp(409, { message: 'Processo em concluido não recebe documentos de retorno' }),
    );
    await expect(enviarDocumento('p1', dados)).rejects.toBeInstanceOf(ProcessoForaDoStatusError);
  });

  it('409 de documento duplicado continua sendo ArquivoRepetidoError', async () => {
    vi.spyOn(api, 'post').mockRejectedValue(erroHttp(409, { message: 'Documento já enviado neste processo' }));
    await expect(enviarDocumento('p1', dados)).rejects.toBeInstanceOf(ArquivoRepetidoError);
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
