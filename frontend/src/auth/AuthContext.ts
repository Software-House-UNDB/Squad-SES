import { createContext } from 'react';
import type { LoginPayload, Perfil, Usuario } from '../types/auth.ts';

export interface AuthContextValue {
  usuario: Usuario | null;
  isAuthenticated: boolean;
  login: (payload: LoginPayload) => Promise<Usuario>;
  logout: () => void;
  hasPerfil: (perfis?: Perfil[]) => boolean;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
