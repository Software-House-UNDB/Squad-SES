import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { clearSession } from '../../auth/session.ts';
import { loginAs, renderApp } from '../../test-utils.tsx';

const menu = () => screen.getByRole('navigation', { name: 'Menu principal' });

describe('shell da área autenticada', () => {
  beforeEach(() => clearSession());

  it('coordenação vê o menu completo e a identidade no header', () => {
    loginAs('coordenacao_ses');
    renderApp('/dashboard');

    const links = within(menu())
      .getAllByRole('link')
      .map((a) => a.textContent);
    expect(links).toEqual([
      'Início',
      'Análise de Ofícios',
      'Assinatura de Termos',
      'Usuários',
      'Configurações',
    ]);
    expect(screen.getByText('f@x.com')).toBeInTheDocument();
    expect(screen.getByText(/Coordenação SES/, { selector: '.topbar__role' })).toBeInTheDocument();
  });

  it('representante da IES vê só o início', () => {
    loginAs('representante_ies');
    renderApp('/dashboard');

    expect(within(menu()).getAllByRole('link')).toHaveLength(1);
    expect(screen.queryByText('Administração')).not.toBeInTheDocument();
  });

  it('marca a página atual no menu', () => {
    loginAs('coordenacao_ses');
    renderApp('/gerenciamento/analise-oficios');

    expect(within(menu()).getByRole('link', { name: 'Análise de Ofícios' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('sair encerra a sessão e volta ao login', async () => {
    loginAs('representante_ies');
    renderApp('/dashboard');

    await userEvent.click(screen.getByRole('button', { name: 'Sair' }));
    expect(screen.getByRole('heading', { name: 'Entrar' })).toBeInTheDocument();
  });
});
