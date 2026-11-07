import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { queryClient } from '../lib/queryClient.ts';
import { loginAs, renderApp } from '../test-utils.tsx';
import { clearSession, getAccessToken, UNAUTHORIZED_EVENT } from './session.ts';

// Integração: AuthProvider + rotas + axios juntos.
describe('encerramento de sessão', () => {
  beforeEach(() => clearSession());

  it('"Sair" no topo limpa a sessão e volta para o login', async () => {
    loginAs('coordenacao_ses');
    renderApp('/gerenciamento/analise-oficios');

    await userEvent.setup().click(screen.getByRole('button', { name: 'Sair' }));

    expect(screen.getByRole('heading', { name: 'Entrar' })).toBeInTheDocument();
    expect(getAccessToken()).toBeNull();
  });

  it('ao sair, descarta os dados em cache para não vazar para o próximo usuário', async () => {
    loginAs('coordenacao_ses');
    queryClient.setQueryData(['processos'], [{ id: 1 }]);
    renderApp('/gerenciamento/analise-oficios');

    await userEvent.setup().click(screen.getByRole('button', { name: 'Sair' }));

    expect(queryClient.getQueryData(['processos'])).toBeUndefined();
  });

  it('"Sair" do dashboard também encerra a sessão', async () => {
    loginAs('representante_ies');
    renderApp('/dashboard');

    await userEvent.setup().click(screen.getByRole('button', { name: 'Sair' }));

    expect(screen.getByRole('heading', { name: 'Entrar' })).toBeInTheDocument();
    expect(getAccessToken()).toBeNull();
  });

  it('expiração de sessão (evento do interceptor) leva o usuário ao login', () => {
    loginAs('representante_ies');
    renderApp('/dashboard');
    expect(screen.getByRole('heading', { name: 'Bem-vindo(a) ao SAGES!' })).toBeInTheDocument();

    act(() => {
      clearSession();
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    });

    expect(screen.getByRole('heading', { name: 'Entrar' })).toBeInTheDocument();
  });
});
