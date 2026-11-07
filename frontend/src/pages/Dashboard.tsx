import { useNavigate } from 'react-router-dom';
import Logo from '../components/Logo.tsx';
import { useAuth } from '../auth/useAuth.ts';
import './Dashboard.css';

export default function Dashboard() {
  const navigate = useNavigate();
  const { logout } = useAuth();

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="dashboard">
      <div className="dashboard__card">
        <Logo size="lg" />
        <h1>Bem-vindo(a) ao SAGES!</h1>
        <p>Login realizado com sucesso. Esta é uma tela de destino de exemplo.</p>
        <button type="button" className="btn btn-primary" onClick={handleLogout}>
          Sair
        </button>
      </div>
    </div>
  );
}
