import { AxiosError } from 'axios';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from './api.ts';
import { listarDocumentos, removerDocumento } from './retornoService.ts';
import { ProcessoForaDoStatusError, SemPermissaoError } from './uploadService.ts';

const erroHttp = (status: number, data: unknown = {}) =>
  new AxiosError('x', 'ERR', undefined, undefined, { status, data } as never);

afterEach(() => vi.restoreAllMocks());

describe('listarDocumentos', () => {
  it('busca a listagem única do processo (pacote da UNDB e retornos da SES)', async () => {
    const lista = [{ id: 'd1', enviadoPorId: 'u1' }];
    const get = vi.spyOn(api, 'get').mockResolvedValue({ data: lista });
    await expect(listarDocumentos('p1')).resolves.toEqual(lista);
    expect(get).toHaveBeenCalledWith('/processos/p1/documentos');
  });
});

describe('removerDocumento', () => {
  it('chama DELETE no documento do processo', async () => {
    const del = vi.spyOn(api, 'delete').mockResolvedValue({ data: undefined });
    await removerDocumento('p1', 'd1');
    expect(del).toHaveBeenCalledWith('/processos/p1/documentos/d1');
  });

  it('403 vira SemPermissaoError e 409 vira ProcessoForaDoStatusError', async () => {
    vi.spyOn(api, 'delete').mockRejectedValueOnce(erroHttp(403));
    await expect(removerDocumento('p1', 'd1')).rejects.toBeInstanceOf(SemPermissaoError);
    vi.spyOn(api, 'delete').mockRejectedValueOnce(erroHttp(409));
    await expect(removerDocumento('p1', 'd1')).rejects.toBeInstanceOf(ProcessoForaDoStatusError);
  });

  it('outras falhas sobem sem tradução', async () => {
    const falha = erroHttp(500);
    vi.spyOn(api, 'delete').mockRejectedValue(falha);
    await expect(removerDocumento('p1', 'd1')).rejects.toBe(falha);
  });
});
