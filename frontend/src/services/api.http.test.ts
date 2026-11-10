/// <reference types="node" />
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Caixa preta de ponta a ponta no cliente: Axios real -> HTTP real -> backend falso em Node.
// Diferente dos outros testes, nada do Axios é simulado: valem as regras de CORS, preflight e JSON.

const USUARIO = { id: '1', email: 'coord@x.com', perfil: 'coordenacao_ses', instituicao: 'SES-MA' };

const servidor = {
  accessValido: 'A1',
  refreshValido: 'R1' as string | null,
  chamadasRefresh: 0,
  ultimaAutorizacao: undefined as string | undefined,
};

function resetServidor() {
  servidor.accessValido = 'A1';
  servidor.refreshValido = 'R1';
  servidor.chamadasRefresh = 0;
  servidor.ultimaAutorizacao = undefined;
}

function responder(res: ServerResponse, status: number, body: unknown = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  });
  res.end(JSON.stringify(body));
}

async function lerJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

async function backendFalso(req: IncomingMessage, res: ServerResponse) {
  if (req.method === 'OPTIONS') return responder(res, 204);

  const body = await lerJson(req);

  if (req.url === '/auth/login') {
    return body.email === 'coord@x.com' && body.senha === '123'
      ? responder(res, 200, {
          accessToken: servidor.accessValido,
          refreshToken: servidor.refreshValido,
          usuario: USUARIO,
        })
      : responder(res, 401, { message: 'E-mail ou senha inválidos.' });
  }

  if (req.url === '/auth/refresh') {
    servidor.chamadasRefresh += 1;
    if (servidor.refreshValido === null || body.refreshToken !== servidor.refreshValido) {
      return responder(res, 401, { message: 'Refresh token inválido.' });
    }
    servidor.accessValido = `A${servidor.chamadasRefresh + 1}`;
    servidor.refreshValido = `R${servidor.chamadasRefresh + 1}`;
    return responder(res, 200, {
      accessToken: servidor.accessValido,
      refreshToken: servidor.refreshValido,
    });
  }

  if (req.url === '/processos') {
    servidor.ultimaAutorizacao = req.headers.authorization;
    return req.headers.authorization === `Bearer ${servidor.accessValido}`
      ? responder(res, 200, { itens: [] })
      : responder(res, 401, { message: 'Não autorizado.' });
  }

  return responder(res, 404);
}

let http: Server;
let api: typeof import('./api.ts').api;
let getErrorMessage: typeof import('./api.ts').getErrorMessage;
let login: typeof import('./authService.ts').login;
let sessao: typeof import('../auth/session.ts');

beforeAll(async () => {
  http = createServer((req, res) => void backendFalso(req, res));
  await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
  vi.stubEnv('VITE_API_URL', `http://127.0.0.1:${(http.address() as AddressInfo).port}`);

  // A URL base é lida quando o módulo carrega, então importa só depois de subir o servidor.
  vi.resetModules();
  ({ api, getErrorMessage } = await import('./api.ts'));
  ({ login } = await import('./authService.ts'));
  sessao = await import('../auth/session.ts');
});

afterAll(async () => {
  vi.unstubAllEnvs();
  if (http.listening) await new Promise((resolve) => http.close(resolve));
});

describe('cliente HTTP contra um backend de verdade', () => {
  const aoExpirar = vi.fn();

  beforeEach(() => {
    resetServidor();
    sessao.clearSession();
    aoExpirar.mockClear();
    window.addEventListener(sessao.UNAUTHORIZED_EVENT, aoExpirar);
    return () => window.removeEventListener(sessao.UNAUTHORIZED_EVENT, aoExpirar);
  });

  async function entrar() {
    const resposta = await login({ email: 'coord@x.com', senha: '123' });
    sessao.saveSession(resposta);
    return resposta;
  }

  it('login com credenciais corretas devolve tokens e usuário', async () => {
    const resposta = await login({ email: 'coord@x.com', senha: '123' });
    expect(resposta).toEqual({ accessToken: 'A1', refreshToken: 'R1', usuario: USUARIO });
  });

  it('login com senha errada: 401 com a mensagem do servidor, sem derrubar nada', async () => {
    const erro = await login({ email: 'coord@x.com', senha: 'errada' }).catch((e) => e);

    expect(getErrorMessage(erro)).toBe('E-mail ou senha inválidos.');
    expect(aoExpirar).not.toHaveBeenCalled();
  });

  it('rota autenticada recebe o access token no header Authorization', async () => {
    await entrar();

    const resposta = await api.get('/processos');

    expect(resposta.status).toBe(200);
    expect(servidor.ultimaAutorizacao).toBe('Bearer A1');
  });

  it('sem sessão a rota autenticada responde 401 e o chamador recebe o erro', async () => {
    await expect(api.get('/processos')).rejects.toMatchObject({ response: { status: 401 } });
    expect(aoExpirar).not.toHaveBeenCalled();
  });

  it('access token expirado: renova e repete a chamada sem o chamador perceber', async () => {
    await entrar();
    servidor.accessValido = 'expirado-no-servidor';
    servidor.refreshValido = 'R1';

    const resposta = await api.get('/processos');

    expect(resposta.status).toBe(200);
    expect(servidor.chamadasRefresh).toBe(1);
    expect(sessao.getAccessToken()).toBe('A2');
    expect(sessao.getRefreshToken()).toBe('R2');
    expect(aoExpirar).not.toHaveBeenCalled();
  });

  it('várias chamadas com token expirado fazem uma única renovação', async () => {
    await entrar();
    servidor.accessValido = 'expirado-no-servidor';

    const respostas = await Promise.all([
      api.get('/processos'),
      api.get('/processos'),
      api.get('/processos'),
    ]);

    expect(respostas.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(servidor.chamadasRefresh).toBe(1);
  });

  it('refresh token revogado: a chamada falha, a sessão é limpa e a aplicação é avisada', async () => {
    await entrar();
    servidor.accessValido = 'expirado-no-servidor';
    servidor.refreshValido = null;

    await expect(api.get('/processos')).rejects.toMatchObject({ response: { status: 401 } });

    expect(sessao.getAccessToken()).toBeNull();
    expect(sessao.getRefreshToken()).toBeNull();
    expect(aoExpirar).toHaveBeenCalledTimes(1);
  });

  it('rota inexistente devolve 404 sem mexer na sessão', async () => {
    await entrar();

    await expect(api.get('/nao-existe')).rejects.toMatchObject({ response: { status: 404 } });

    expect(sessao.getAccessToken()).toBe('A1');
    expect(aoExpirar).not.toHaveBeenCalled();
  });

  it('servidor fora do ar: mensagem de conexão e a sessão é mantida', async () => {
    await entrar();
    await new Promise((resolve) => http.close(resolve));

    // O jsdom imprime "connect ECONNREFUSED" no stderr; é o resultado esperado deste teste.
    const erro = await api.get('/processos').catch((e) => e);

    expect(getErrorMessage(erro)).toBe('Não foi possível conectar ao servidor.');
    expect(sessao.getAccessToken()).toBe('A1');
    expect(aoExpirar).not.toHaveBeenCalled();
  });
});
