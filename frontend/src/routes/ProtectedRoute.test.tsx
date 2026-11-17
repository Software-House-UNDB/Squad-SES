import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { clearSession } from '../auth/session.ts';
import { loginAs, renderWithProviders } from '../test-utils.tsx';
import type { Perfil } from '../types/auth.ts';
import ProtectedRoute from './ProtectedRoute.tsx';

function renderGuard(perfis?: Perfil[]) {
  return renderWithProviders(
    <Routes>
      <Route path="/login" element={<p>tela de login</p>} />
      <Route path="/acesso-negado" element={<p>tela de acesso negado</p>} />
      <Route element={<ProtectedRoute perfis={perfis} />}>
        <Route path="/" element={<p>conteúdo protegido</p>} />
      </Route>
    </Routes>,
  );
}

// Unitário (caixa branca): cada ramo da guarda, isolado das telas reais.
describe('ProtectedRoute', () => {
  beforeEach(() => clearSession());

  it('sem sessão manda para o login', () => {
    renderGuard();
    expect(screen.getByText('tela de login')).toBeInTheDocument();
  });

  it('sem sessão manda para o login mesmo exigindo um perfil', () => {
    renderGuard(['COORDENACAO_SES']);
    expect(screen.getByText('tela de login')).toBeInTheDocument();
  });

  it('sem lista de perfis, qualquer usuário autenticado entra', () => {
    loginAs('REPRESENTANTE_UNDB');
    renderGuard();
    expect(screen.getByText('conteúdo protegido')).toBeInTheDocument();
  });

  it('lista de perfis vazia também libera qualquer usuário autenticado', () => {
    loginAs('REPRESENTANTE_UNDB');
    renderGuard([]);
    expect(screen.getByText('conteúdo protegido')).toBeInTheDocument();
  });

  it('perfil permitido entra', () => {
    loginAs('COORDENACAO_SES');
    renderGuard(['COORDENACAO_SES']);
    expect(screen.getByText('conteúdo protegido')).toBeInTheDocument();
  });

  it('perfil não permitido vai para acesso negado, não para o login', () => {
    loginAs('REPRESENTANTE_UNDB');
    renderGuard(['COORDENACAO_SES']);
    expect(screen.getByText('tela de acesso negado')).toBeInTheDocument();
  });

  it('aceita mais de um perfil', () => {
    loginAs('REPRESENTANTE_UNDB');
    renderGuard(['COORDENACAO_SES', 'REPRESENTANTE_UNDB']);
    expect(screen.getByText('conteúdo protegido')).toBeInTheDocument();
  });
});
