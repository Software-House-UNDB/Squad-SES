import { useNavigate } from 'react-router-dom';
import Logo from '../components/Logo.tsx';
import './Dashboard.css';

export default function AcessoNegado() {
  const navigate = useNavigate();

  return (
    <div className="dashboard">
      <div className="dashboard__card">
        <Logo size="lg" />
        <h1>Acesso negado</h1>
        <p>Seu perfil não tem permissão para acessar esta página.</p>
        <button type="button" className="btn btn-primary" onClick={() => navigate('/')}>
          Voltar ao início
        </button>
      </div>
    </div>
  );
}
