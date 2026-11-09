import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { login as loginRequest } from '../services/authService.ts';
import type { LoginPayload, Usuario } from '../types/auth.ts';
import { AuthContext, type AuthContextValue } from './AuthContext.ts';
import { clearSession, loadUsuario, saveSession, UNAUTHORIZED_EVENT } from './session.ts';

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [usuario, setUsuario] = useState<Usuario | null>(loadUsuario);

  const { mutateAsync: loginMutation } = useMutation({ mutationFn: loginRequest });

  const logout = useCallback(() => {
    clearSession();
    setUsuario(null);
    queryClient.clear();
  }, [queryClient]);

  // O interceptor do axios avisa quando a sessão expira (access e refresh token inválidos).
  useEffect(() => {
    window.addEventListener(UNAUTHORIZED_EVENT, logout);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, logout);
  }, [logout]);

  const login = useCallback(
    async (payload: LoginPayload) => {
      const session = await loginMutation(payload);
      saveSession(session);
      setUsuario(session.usuario);
      return session.usuario;
    },
    [loginMutation],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      usuario,
      isAuthenticated: usuario !== null,
      login,
      logout,
      hasPerfil: (perfis) =>
        !perfis || perfis.length === 0 || (usuario !== null && perfis.includes(usuario.perfil)),
    }),
    [usuario, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
