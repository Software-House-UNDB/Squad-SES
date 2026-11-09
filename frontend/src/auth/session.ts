import type { Tokens, Usuario } from '../types/auth.ts';

// MVP: refresh token em localStorage. Ticket de hardening para Sprint 4
// migra para cookie httpOnly (requer CORS com credentials e proxy em dev).
const ACCESS_KEY = 'ses:access-token';
const REFRESH_KEY = 'ses:refresh-token';
const USER_KEY = 'ses:usuario';

export const UNAUTHORIZED_EVENT = 'ses:unauthorized';

export interface Session extends Tokens {
  usuario: Usuario;
}

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_KEY);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY);
}

export function saveTokens({ accessToken, refreshToken }: Tokens): void {
  localStorage.setItem(ACCESS_KEY, accessToken);
  localStorage.setItem(REFRESH_KEY, refreshToken);
}

export function saveSession({ usuario, ...tokens }: Session): void {
  saveTokens(tokens);
  localStorage.setItem(USER_KEY, JSON.stringify(usuario));
}

export function loadUsuario(): Usuario | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw || !getAccessToken()) return null;

  try {
    return JSON.parse(raw) as Usuario;
  } catch {
    clearSession();
    return null;
  }
}

export function clearSession(): void {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(USER_KEY);
}
