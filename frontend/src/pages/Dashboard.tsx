import { useNavigate } from 'react-router-dom'
import Logo from '../components/Logo.tsx'
import './Dashboard.css'

export default function Dashboard() {
  const navigate = useNavigate()

  return (
    <div className="dashboard">
      <div className="dashboard__card">
        <Logo size="lg" />
        <h1>Bem-vindo(a) ao SAGES!</h1>
        <p>Login realizado com sucesso. Esta é uma tela de destino de exemplo.</p>
        <button type="button" className="btn btn-primary" onClick={() => navigate('/login')}>
          Sair
        </button>
      </div>
    </div>
  )
}
