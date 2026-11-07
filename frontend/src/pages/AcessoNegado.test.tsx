import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { clearSession } from '../auth/session.ts';
import { loginAs, renderApp } from '../test-utils.tsx';

// Caixa preta: o usuário bate numa página proibida e tenta sair dela.
describe('acesso negado', () => {
  beforeEach(() => clearSession());

  it('"Voltar ao início" leva o representante ao dashboard, a sua tela inicial', async () => {
    loginAs('representante_ies');
    renderApp('/administracao/usuarios');
    expect(screen.getByRole('heading', { name: 'Acesso negado' })).toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole('button', { name: 'Voltar ao início' }));

    expect(screen.getByRole('heading', { name: 'Bem-vindo(a) ao SAGES!' })).toBeInTheDocument();
  });

  it('a tela de acesso negado em si é pública, mas redireciona quem não está logado ao voltar', async () => {
    renderApp('/acesso-negado');

    await userEvent.setup().click(screen.getByRole('button', { name: 'Voltar ao início' }));

    expect(screen.getByRole('heading', { name: 'Entrar' })).toBeInTheDocument();
  });
});
