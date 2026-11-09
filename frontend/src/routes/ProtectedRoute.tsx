import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/useAuth.ts';
import type { Perfil } from '../types/auth.ts';

interface ProtectedRouteProps {
  // Perfis com acesso. Omitido = qualquer usuário autenticado.
  perfis?: Perfil[];
}

export default function ProtectedRoute({ perfis }: ProtectedRouteProps) {
  const { isAuthenticated, hasPerfil } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (!hasPerfil(perfis)) {
    return <Navigate to="/acesso-negado" replace />;
  }

  return <Outlet />;
}
