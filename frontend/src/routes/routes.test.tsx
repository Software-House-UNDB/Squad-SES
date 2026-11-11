import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { clearSession } from '../auth/session.ts';
import { loginAs, renderApp } from '../test-utils.tsx';

const heading = (name: string) => screen.getByRole('heading', { name });

// Caixa preta: abre uma URL com um perfil e verifica só o que o usuário enxerga.
describe('rotas protegidas por perfil', () => {
  beforeEach(() => clearSession());

  it('redireciona visitante para o login', () => {
    renderApp('/gerenciamento/analise-oficios');
    expect(heading('Entrar')).toBeInTheDocument();
  });

  it('visitante também não abre o dashboard', () => {
    renderApp('/dashboard');
    expect(heading('Entrar')).toBeInTheDocument();
  });

  it('mantém públicas as telas de cadastro', () => {
    renderApp('/cadastro');
    expect(heading('Criar conta')).toBeInTheDocument();
  });

  it('coordenação acessa a análise de ofícios', () => {
    loginAs('coordenacao_ses');
    renderApp('/gerenciamento/analise-oficios');
    expect(heading('Análise de Ofícios')).toBeInTheDocument();
  });

  it.each(['/gerenciamento/assinatura-termos', '/administracao/usuarios'])(
    'coordenação acessa %s',
    (path) => {
      loginAs('coordenacao_ses');
      renderApp(path);
      expect(screen.queryByRole('heading', { name: 'Acesso negado' })).not.toBeInTheDocument();
    },
  );

  it.each([
    '/gerenciamento/analise-oficios',
    '/gerenciamento/assinatura-termos',
    '/administracao/usuarios',
    '/administracao/configuracoes',
  ])('representante da IES não acessa %s', (path) => {
    loginAs('representante_ies');
    renderApp(path);
    expect(heading('Acesso negado')).toBeInTheDocument();
  });

  it('representante da IES acessa o dashboard', () => {
    loginAs('representante_ies');
    renderApp('/dashboard');
    expect(heading('Bem-vindo(a) ao SAGES!')).toBeInTheDocument();
  });

  it('usuário autenticado que abre /login vai para a tela inicial do seu perfil', () => {
    loginAs('coordenacao_ses');
    renderApp('/login');
    expect(heading('Análise de Ofícios')).toBeInTheDocument();
  });

  it('rota desconhecida leva o representante para o dashboard', () => {
    loginAs('representante_ies');
    renderApp('/qualquer-coisa');
    expect(heading('Bem-vindo(a) ao SAGES!')).toBeInTheDocument();
  });

  it('rota desconhecida leva o visitante para o login', () => {
    renderApp('/qualquer-coisa');
    expect(heading('Entrar')).toBeInTheDocument();
  });
});

describe('novo processo', () => {
  beforeEach(() => clearSession());

  it('representante da IES abre a tela', () => {
    loginAs('representante_ies');
    renderApp('/gerenciamento/novo-processo');
    expect(heading('Novo processo de documentação')).toBeInTheDocument();
  });

  it('coordenação não cria processo (RF-06)', () => {
    loginAs('coordenacao_ses');
    renderApp('/gerenciamento/novo-processo');
    expect(heading('Acesso negado')).toBeInTheDocument();
  });
});
