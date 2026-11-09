import { QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import App from './App.tsx';
import { AuthProvider } from './auth/AuthProvider.tsx';
import { saveSession } from './auth/session.ts';
import { queryClient } from './lib/queryClient.ts';
import { api } from './services/api.ts';
import type { Perfil } from './types/auth.ts';

export function usuarioDe(perfil: Perfil) {
  return { id: '1', email: 'f@x.com', perfil, instituicao: 'UNDB' };
}

export function loginAs(perfil: Perfil) {
  saveSession({ accessToken: 'access', refreshToken: 'refresh', usuario: usuarioDe(perfil) });
}

// Renderiza qualquer elemento com os mesmos providers do main.tsx.
export function renderWithProviders(ui: ReactElement, path = '/') {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <AuthProvider>{ui}</AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// Renderiza o App real (todas as rotas) numa URL.
export function renderApp(path: string) {
  return renderWithProviders(<App />, path);
}

type FakeReply = { status: number; data?: unknown } | 'network-error';

// Substitui o servidor: devolve a resposta escolhida pelo teste, mantendo os interceptors reais ativos.
export function fakeServer(reply: (config: InternalAxiosRequestConfig) => FakeReply) {
  api.defaults.adapter = (config: InternalAxiosRequestConfig) => {
    const result = reply(config);
    if (result === 'network-error') {
      return Promise.reject(new AxiosError('Network Error', 'ERR_NETWORK', config));
    }

    const response = {
      data: result.data ?? {},
      status: result.status,
      statusText: '',
      headers: {},
      config,
    };
    return result.status < 400
      ? Promise.resolve(response)
      : Promise.reject(new AxiosError('fail', 'ERR_BAD_REQUEST', config, null, response));
  };
}
