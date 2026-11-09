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
    expect(screen.getByText('f@x.com', { selector: '.topbar__email' })).toBeInTheDocument();
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

  it('o menu também mostra e-mail, perfil e instituição (visíveis no mobile)', () => {
    loginAs('representante_ies');
    renderApp('/dashboard');

    const aside = screen.getByRole('complementary');
    expect(within(aside).getByText('f@x.com')).toBeInTheDocument();
    expect(within(aside).getByText('Representante da IES')).toBeInTheDocument();
    expect(within(aside).getByText('UNDB')).toBeInTheDocument();
  });

  describe('gaveta do menu', () => {
    it('foca o menu ao abrir e devolve o foco ao botão ao fechar com Esc', async () => {
      loginAs('coordenacao_ses');
      renderApp('/dashboard');

      const abrir = screen.getByRole('button', { name: 'Abrir menu' });
      await userEvent.click(abrir);
      expect(screen.getByRole('button', { name: 'Fechar menu' })).toHaveFocus();
      expect(abrir).toHaveAttribute('aria-expanded', 'true');

      await userEvent.keyboard('{Escape}');
      expect(abrir).toHaveFocus();
      expect(abrir).toHaveAttribute('aria-expanded', 'false');
    });

    it('mantém o Tab dentro do menu enquanto está aberto', async () => {
      loginAs('representante_ies');
      renderApp('/dashboard');
      await userEvent.click(screen.getByRole('button', { name: 'Abrir menu' }));

      // Elementos do menu: Fechar menu e Início. O Tab seguinte volta ao primeiro, sem sair do menu.
      await userEvent.tab();
      expect(screen.getByRole('link', { name: 'Início' })).toHaveFocus();
      await userEvent.tab();
      expect(screen.getByRole('button', { name: 'Fechar menu' })).toHaveFocus();
      await userEvent.tab({ shift: true });
      expect(screen.getByRole('link', { name: 'Início' })).toHaveFocus();
    });
  });

  it('sair encerra a sessão e volta ao login', async () => {
    loginAs('representante_ies');
    renderApp('/dashboard');

    await userEvent.click(screen.getByRole('button', { name: 'Sair' }));
    expect(screen.getByRole('heading', { name: 'Entrar' })).toBeInTheDocument();
  });
});
