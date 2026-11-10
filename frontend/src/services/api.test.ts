import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearSession,
  getAccessToken,
  getRefreshToken,
  saveSession,
  UNAUTHORIZED_EVENT,
} from '../auth/session.ts';
import { api, getErrorMessage } from './api.ts';

const usuario = {
  id: '1',
  email: 'f@x.com',
  perfil: 'coordenacao_ses',
  instituicao: null,
} as const;

function login(accessToken = 'old', refreshToken = 'refresh') {
  saveSession({ accessToken, refreshToken, usuario });
}

// Simula o servidor: só aceita o access token informado; qualquer outro recebe 401. Sem tocar na rede.
function serverAccepting(validToken: string) {
  const calls: Array<string | undefined> = [];
  api.defaults.adapter = (config: InternalAxiosRequestConfig) => {
    const auth = config.headers.Authorization as string | undefined;
    calls.push(auth);
    const response = {
      data: {},
      status: auth === `Bearer ${validToken}` ? 200 : 401,
      statusText: '',
      headers: {},
      config,
    };
    return response.status === 200
      ? Promise.resolve(response)
      : Promise.reject(new AxiosError('unauthorized', 'ERR_BAD_REQUEST', config, null, response));
  };
  return calls;
}

function refreshRejects() {
  vi.spyOn(axios, 'post').mockRejectedValue(
    new AxiosError('expired', 'ERR_BAD_REQUEST', undefined, null, {
      data: {},
      status: 401,
      statusText: '',
      headers: {},
      config: {} as InternalAxiosRequestConfig,
    }),
  );
}

describe('cliente axios', () => {
  const onUnauthorized = vi.fn();

  beforeEach(() => {
    clearSession();
    onUnauthorized.mockClear();
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  });

  afterEach(() => {
    window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    vi.restoreAllMocks();
  });

  it('envia o access token no header Authorization', async () => {
    login('old');
    const calls = serverAccepting('old');
    await api.get('/x');
    expect(calls).toEqual(['Bearer old']);
  });

  it('renova o token em 401 e repete a requisição', async () => {
    login('old', 'refresh-1');
    const calls = serverAccepting('new');
    const refresh = vi
      .spyOn(axios, 'post')
      .mockResolvedValue({ data: { accessToken: 'new', refreshToken: 'refresh-2' } });

    await expect(api.get('/x')).resolves.toMatchObject({ status: 200 });

    expect(refresh).toHaveBeenCalledWith(expect.stringContaining('/auth/refresh'), {
      refreshToken: 'refresh-1',
    });
    expect(calls).toEqual(['Bearer old', 'Bearer new']);
    expect(getAccessToken()).toBe('new');
    expect(getRefreshToken()).toBe('refresh-2');
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('faz uma única renovação quando várias requisições expiram juntas', async () => {
    login('old');
    serverAccepting('new');
    const refresh = vi
      .spyOn(axios, 'post')
      .mockResolvedValue({ data: { accessToken: 'new', refreshToken: 'r2' } });

    await Promise.all([api.get('/a'), api.get('/b'), api.get('/c')]);

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('desloga quando o refresh token também expirou', async () => {
    login('old');
    serverAccepting('new');
    refreshRejects();

    await expect(api.get('/x')).rejects.toBeTruthy();

    expect(getAccessToken()).toBeNull();
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('desloga se o servidor continua negando após renovar', async () => {
    login('old');
    serverAccepting('outro-token');
    vi.spyOn(axios, 'post').mockResolvedValue({ data: { accessToken: 'new', refreshToken: 'r2' } });

    await expect(api.get('/x')).rejects.toBeTruthy();

    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('não derruba a sessão em 401 sem token (login com senha errada)', async () => {
    serverAccepting('qualquer');
    const refresh = vi.spyOn(axios, 'post');

    await expect(api.post('/auth/login', {})).rejects.toBeTruthy();

    expect(refresh).not.toHaveBeenCalled();
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('falha de rede na renovação mantém a sessão', async () => {
    login('old');
    serverAccepting('new');
    vi.spyOn(axios, 'post').mockRejectedValue(new AxiosError('Network Error', 'ERR_NETWORK'));

    await expect(api.get('/x')).rejects.toBeTruthy();

    expect(getAccessToken()).toBe('old');
    expect(onUnauthorized).not.toHaveBeenCalled();
  });
});

describe('getErrorMessage', () => {
  const comResposta = (data: unknown) =>
    new AxiosError('x', 'ERR', undefined, null, {
      data,
      status: 400,
      statusText: '',
      headers: {},
      config: {} as InternalAxiosRequestConfig,
    });

  it('usa a mensagem enviada pelo servidor', () => {
    expect(getErrorMessage(comResposta({ message: 'CPF inválido' }))).toBe('CPF inválido');
  });

  it('ignora mensagem que não é texto (ex.: lista de validação) e usa o padrão', () => {
    expect(getErrorMessage(comResposta({ message: ['a', 'b'] }), 'Padrão')).toBe('Padrão');
  });

  it('avisa quando não há conexão com o servidor', () => {
    expect(getErrorMessage(new AxiosError('Network Error', 'ERR_NETWORK'))).toBe(
      'Não foi possível conectar ao servidor.',
    );
  });

  it('usa o padrão para erros que não são do axios', () => {
    expect(getErrorMessage(new Error('boom'), 'Padrão')).toBe('Padrão');
  });
});
