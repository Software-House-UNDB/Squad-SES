import { useLocation, useNavigate } from 'react-router-dom'
import AuthLayout from '../components/AuthLayout.jsx'
import '../styles/forms.css'
import './CadastroSucesso.css'

export default function CadastroSucesso() {
  const navigate = useNavigate()
  const location = useLocation()
  const email = location.state?.email

  return (
    <AuthLayout>
      <div className="success-card">
        <div className="success-card__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="30" height="30" fill="none">
            <path
              d="M5 13l4 4 10-10"
              stroke="#fff"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        <h1 className="auth-form__title">Conta criada com sucesso!</h1>
        <p className="auth-form__subtitle">
          Um e-mail de confirmação foi enviado para{' '}
          {email ? <strong>{email}</strong> : 'seu endereço institucional'}.
        </p>

        <button
          type="button"
          className="btn btn-primary"
          onClick={() => navigate('/login')}
        >
          Acessar o Sistema
        </button>
      </div>
    </AuthLayout>
  )
}
