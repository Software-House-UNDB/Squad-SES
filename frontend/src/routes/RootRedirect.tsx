import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth.ts';
import { homeFor } from './permissions.ts';

export default function RootRedirect() {
  const { usuario } = useAuth();
  return <Navigate to={usuario ? homeFor(usuario.perfil) : '/login'} replace />;
}
