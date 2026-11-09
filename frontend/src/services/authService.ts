import type { LoginPayload, LoginResponse } from '../types/auth.ts';
import { api } from './api.ts';

// Enquanto o backend de autenticação não existe (o módulo auth ainda é só um esqueleto), a demonstração
// aos stakeholders usa a credencial fixa abaixo. Ativado com VITE_AUTH_MOCK=true; remover junto com o
// mock quando POST /auth/login estiver disponível.
export const DEMO_USER = {
  email: 'coordenacao@espma.edu.br',
  senha: 'Espma@2026',
};

export function isAuthMock(): boolean {
  return import.meta.env.VITE_AUTH_MOCK === 'true';
}

async function loginMock({ email, senha }: LoginPayload): Promise<LoginResponse> {
  await new Promise((resolve) => setTimeout(resolve, 500));

  if (email.toLowerCase() !== DEMO_USER.email || senha !== DEMO_USER.senha) {
    throw new Error('Credenciais inválidas.');
  }

  return {
    accessToken: 'demo-access-token',
    refreshToken: 'demo-refresh-token',
    usuario: {
      id: 'demo',
      email: DEMO_USER.email,
      perfil: 'coordenacao_ses',
      instituicao: 'SES-MA',
    },
  };
}

export async function login(payload: LoginPayload): Promise<LoginResponse> {
  if (isAuthMock()) return loginMock(payload);

  const { data } = await api.post<LoginResponse>('/auth/login', payload);
  return data;
}
