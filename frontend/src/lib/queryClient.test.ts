import { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { describe, expect, it } from 'vitest';
import { shouldRetry } from './queryClient.ts';

function erroHttp(status: number) {
  const config = {} as InternalAxiosRequestConfig;
  return new AxiosError('x', 'ERR', config, null, {
    data: {},
    status,
    statusText: '',
    headers: {},
    config,
  });
}

// Unitário: política de retentativa do TanStack Query.
describe('shouldRetry', () => {
  it.each([400, 401, 403, 404, 422])('não repete erro %i (cliente)', (status) => {
    expect(shouldRetry(0, erroHttp(status))).toBe(false);
  });

  it('repete erro 5xx até 2 vezes', () => {
    expect(shouldRetry(0, erroHttp(500))).toBe(true);
    expect(shouldRetry(1, erroHttp(503))).toBe(true);
    expect(shouldRetry(2, erroHttp(500))).toBe(false);
  });

  it('repete falha de rede (sem resposta)', () => {
    expect(shouldRetry(0, new AxiosError('Network Error', 'ERR_NETWORK'))).toBe(true);
  });

  it('repete erro que não é do axios, com o mesmo limite', () => {
    expect(shouldRetry(0, new Error('boom'))).toBe(true);
    expect(shouldRetry(2, new Error('boom'))).toBe(false);
  });
});
