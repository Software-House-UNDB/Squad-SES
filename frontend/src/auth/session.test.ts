import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearSession,
  getAccessToken,
  getRefreshToken,
  loadUsuario,
  saveSession,
  saveTokens,
} from './session.ts';

const usuario = {
  id: '1',
  email: 'f@x.com',
  perfil: 'coordenacao_ses',
  instituicao: null,
} as const;

// Unitário (caixa branca): conhece as chaves e o formato guardados no localStorage.
describe('session', () => {
  beforeEach(() => localStorage.clear());

  it('guarda e recupera tokens e usuário', () => {
    saveSession({ accessToken: 'a', refreshToken: 'r', usuario });
    expect(getAccessToken()).toBe('a');
    expect(getRefreshToken()).toBe('r');
    expect(loadUsuario()).toEqual(usuario);
  });

  it('saveTokens troca só os tokens e preserva o usuário (renovação)', () => {
    saveSession({ accessToken: 'a', refreshToken: 'r', usuario });
    saveTokens({ accessToken: 'a2', refreshToken: 'r2' });
    expect(getAccessToken()).toBe('a2');
    expect(loadUsuario()).toEqual(usuario);
  });

  it('não considera logado sem access token, mesmo com usuário guardado', () => {
    localStorage.setItem('ses:usuario', JSON.stringify(usuario));
    expect(loadUsuario()).toBeNull();
  });

  it('descarta a sessão se o usuário guardado estiver corrompido', () => {
    localStorage.setItem('ses:access-token', 'a');
    localStorage.setItem('ses:usuario', '{quebrado');
    expect(loadUsuario()).toBeNull();
    expect(getAccessToken()).toBeNull();
  });

  it('clearSession remove tudo', () => {
    saveSession({ accessToken: 'a', refreshToken: 'r', usuario });
    clearSession();
    expect(getAccessToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
    expect(loadUsuario()).toBeNull();
  });
});
