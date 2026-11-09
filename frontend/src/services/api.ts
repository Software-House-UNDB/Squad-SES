import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import {
  clearSession,
  getAccessToken,
  getRefreshToken,
  saveTokens,
  UNAUTHORIZED_EVENT,
} from '../auth/session.ts';
import type { Tokens } from '../types/auth.ts';

const baseURL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export const api = axios.create({
  baseURL,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Várias requisições podem receber 401 ao mesmo tempo; só uma renova o token e as demais esperam o resultado.
let refreshing: Promise<string> | null = null;

function refreshAccessToken(): Promise<string> {
  refreshing ??= axios
    .post<Tokens>(`${baseURL}/auth/refresh`, { refreshToken: getRefreshToken() })
    .then(({ data }) => {
      saveTokens(data);
      return data.accessToken;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

type RetriableConfig = InternalAxiosRequestConfig & { _retry?: boolean };

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as RetriableConfig | undefined;
    // 401 sem token enviado é o próprio login com credenciais inválidas: não é sessão expirada.
    const wasAuthenticated = Boolean(original?.headers?.Authorization);
    if (error.response?.status !== 401 || !original || !wasAuthenticated) throw error;

    if (!original._retry && getRefreshToken()) {
      original._retry = true;
      let accessToken: string | null = null;
      try {
        accessToken = await refreshAccessToken();
      } catch (refreshError) {
        // Falha de rede/5xx na renovação não derruba a sessão; só o 401 (refresh token inválido) derruba.
        if (!axios.isAxiosError(refreshError) || refreshError.response?.status !== 401)
          throw refreshError;
      }
      if (accessToken) {
        original.headers.Authorization = `Bearer ${accessToken}`;
        // Se esta repetição também der 401, este mesmo interceptor (já com _retry) encerra a sessão.
        return api(original);
      }
    }

    clearSession();
    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    throw error;
  },
);

export function getErrorMessage(error: unknown, fallback = 'Ocorreu um erro inesperado.'): string {
  if (axios.isAxiosError(error)) {
    const message = (error.response?.data as { message?: unknown } | undefined)?.message;
    if (typeof message === 'string') return message;
    if (!error.response) return 'Não foi possível conectar ao servidor.';
  }
  return fallback;
}
