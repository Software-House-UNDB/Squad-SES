import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSession, getAccessToken, getRefreshToken } from '../auth/session.ts';
import { DEMO_USER } from '../services/authService.ts';
import { fakeServer, renderApp, usuarioDe } from '../test-utils.tsx';
import type { Perfil } from '../types/auth.ts';

const heading = (name: string) => screen.getByRole('heading', { name });

async function preencherEEnviar(email = 'f@x.com', senha = 'segredo') {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('E-mail Institucional'), email);
  await user.type(screen.getByLabelText('Senha'), senha);
  await user.click(screen.getByRole('button', { name: 'Entrar' }));
}

function servidorAutenticaComo(perfil: Perfil) {
  fakeServer(() => ({
    status: 200,
    data: { accessToken: 'novo-access', refreshToken: 'novo-refresh', usuario: usuarioDe(perfil) },
  }));
}

// Caixa preta: usa a tela como o usuário (digita, clica, lê a tela) com o servidor simulado.
describe('fluxo de login (API real)', () => {
  beforeEach(() => clearSession());

  it('valida os campos antes de chamar o servidor', async () => {
    const servidor = vi.fn(() => ({ status: 200 }));
    fakeServer(servidor);
    renderApp('/login');

    await userEvent.setup().click(screen.getByRole('button', { name: 'Entrar' }));

    expect(screen.getByText('Informe seu e-mail institucional.')).toBeInTheDocument();
    expect(screen.getByText('Informe sua senha.')).toBeInTheDocument();
    expect(servidor).not.toHaveBeenCalled();
  });

  it('rejeita e-mail em formato inválido', async () => {
    renderApp('/login');
    await preencherEEnviar('isso-nao-e-email', 'segredo');
    expect(screen.getByText('Digite um e-mail válido.')).toBeInTheDocument();
  });

  it('coordenação cai na análise de ofícios e a sessão fica guardada', async () => {
    servidorAutenticaComo('coordenacao_ses');
    renderApp('/login');

    await preencherEEnviar();

    expect(await screen.findByRole('heading', { name: 'Análise de Ofícios' })).toBeInTheDocument();
    expect(getAccessToken()).toBe('novo-access');
    expect(getRefreshToken()).toBe('novo-refresh');
  });

  it('representante da IES cai no dashboard', async () => {
    servidorAutenticaComo('representante_ies');
    renderApp('/login');

    await preencherEEnviar();

    expect(
      await screen.findByRole('heading', { name: 'Bem-vindo(a) ao SAGES!' }),
    ).toBeInTheDocument();
  });

  it('depois do login volta para a página que o usuário tentou abrir', async () => {
    servidorAutenticaComo('coordenacao_ses');
    renderApp('/administracao/usuarios');
    expect(heading('Entrar')).toBeInTheDocument();

    await preencherEEnviar();

    expect(await screen.findByRole('heading', { name: 'Usuários' })).toBeInTheDocument();
  });

  it('mostra a mensagem do servidor e não cria sessão com credenciais inválidas', async () => {
    fakeServer(() => ({ status: 401, data: { message: 'Credenciais incorretas.' } }));
    renderApp('/login');

    await preencherEEnviar('f@x.com', 'errada');

    expect(await screen.findByRole('alert')).toHaveTextContent('Credenciais incorretas.');
    expect(heading('Entrar')).toBeInTheDocument();
    expect(getAccessToken()).toBeNull();
  });

  it('avisa quando o servidor está fora do ar e permite tentar de novo', async () => {
    fakeServer(() => 'network-error');
    renderApp('/login');

    await preencherEEnviar();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível conectar ao servidor.',
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'Entrar' })).toBeEnabled());
  });

  it('não mostra a credencial de demonstração quando o mock está desligado', () => {
    renderApp('/login');
    expect(screen.queryByText('Acesso de demonstração')).not.toBeInTheDocument();
  });
});

describe('fluxo de login (demonstração, VITE_AUTH_MOCK=true)', () => {
  beforeEach(() => {
    clearSession();
    vi.stubEnv('VITE_AUTH_MOCK', 'true');
  });
  afterEach(() => vi.unstubAllEnvs());

  it('mostra a credencial de demonstração', () => {
    renderApp('/login');
    expect(screen.getByText('Acesso de demonstração')).toBeInTheDocument();
    expect(screen.getByText(DEMO_USER.email)).toBeInTheDocument();
  });

  it('entra com a credencial de demonstração como coordenação, sem usar o servidor', async () => {
    const servidor = vi.fn(() => ({ status: 500 }));
    fakeServer(servidor);
    renderApp('/login');

    await preencherEEnviar(DEMO_USER.email, DEMO_USER.senha);

    expect(await screen.findByRole('heading', { name: 'Análise de Ofícios' })).toBeInTheDocument();
    expect(servidor).not.toHaveBeenCalled();
  });

  it('recusa credencial diferente da de demonstração', async () => {
    renderApp('/login');

    await preencherEEnviar(DEMO_USER.email, 'outra-senha');

    expect(await screen.findByRole('alert')).toHaveTextContent('E-mail ou senha inválidos.');
    expect(getAccessToken()).toBeNull();
  });
});
