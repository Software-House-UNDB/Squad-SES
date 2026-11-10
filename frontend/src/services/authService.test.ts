import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeServer } from '../test-utils.tsx';
import { DEMO_USER, isAuthMock, login } from './authService.ts';

// Unitário (caixa branca): os dois caminhos do login, API real e demonstração.
describe('authService.login', () => {
  afterEach(() => vi.unstubAllEnvs());

  describe('com a API (VITE_AUTH_MOCK desligado)', () => {
    it('faz POST /auth/login com e-mail e senha e devolve a resposta do servidor', async () => {
      const resposta = {
        accessToken: 'a',
        refreshToken: 'r',
        usuario: { id: '1', email: 'x@y.com', perfil: 'coordenacao_ses', instituicao: null },
      };
      const recebido: Array<{ method?: string; url?: string; body: unknown }> = [];
      fakeServer((config) => {
        recebido.push({ method: config.method, url: config.url, body: JSON.parse(config.data) });
        return { status: 200, data: resposta };
      });

      await expect(login({ email: 'x@y.com', senha: 's' })).resolves.toEqual(resposta);

      expect(recebido).toEqual([
        { method: 'post', url: '/auth/login', body: { email: 'x@y.com', senha: 's' } },
      ]);
    });

    it('propaga o erro do servidor', async () => {
      fakeServer(() => ({ status: 401, data: { message: 'nope' } }));
      await expect(login({ email: 'x@y.com', senha: 's' })).rejects.toMatchObject({
        response: { status: 401 },
      });
    });
  });

  describe('modo demonstração (VITE_AUTH_MOCK=true)', () => {
    it('isAuthMock reflete a variável de ambiente', () => {
      expect(isAuthMock()).toBe(false);
      vi.stubEnv('VITE_AUTH_MOCK', 'true');
      expect(isAuthMock()).toBe(true);
      vi.stubEnv('VITE_AUTH_MOCK', 'false');
      expect(isAuthMock()).toBe(false);
    });

    it('aceita a credencial fixa e devolve a coordenação, ignorando maiúsculas no e-mail', async () => {
      vi.stubEnv('VITE_AUTH_MOCK', 'true');
      const resposta = await login({
        email: DEMO_USER.email.toUpperCase(),
        senha: DEMO_USER.senha,
      });
      expect(resposta.usuario.perfil).toBe('coordenacao_ses');
      expect(resposta.accessToken).toBeTruthy();
      expect(resposta.refreshToken).toBeTruthy();
    });

    it.each([
      ['senha errada', DEMO_USER.email, 'errada'],
      ['e-mail errado', 'outro@espma.edu.br', DEMO_USER.senha],
    ])('recusa %s', async (_caso, email, senha) => {
      vi.stubEnv('VITE_AUTH_MOCK', 'true');
      await expect(login({ email, senha })).rejects.toThrow('Credenciais inválidas.');
    });

    it('não chama o servidor', async () => {
      vi.stubEnv('VITE_AUTH_MOCK', 'true');
      const servidor = vi.fn(() => ({ status: 500 }));
      fakeServer(servidor);
      await login({ email: DEMO_USER.email, senha: DEMO_USER.senha });
      expect(servidor).not.toHaveBeenCalled();
    });
  });
});
