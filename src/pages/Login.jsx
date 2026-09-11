import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AuthLayout from '../components/AuthLayout.jsx'
import '../styles/forms.css'

const initialForm = {
  email: '',
  senha: '',
}

export default function Login() {
  const navigate = useNavigate()
  const [form, setForm] = useState(initialForm)
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)

  function handleChange(event) {
    const { name, value } = event.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  function validate() {
    const nextErrors = {}

    if (!form.email.trim()) {
      nextErrors.email = 'Informe seu e-mail institucional.'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      nextErrors.email = 'Digite um e-mail válido.'
    }

    if (!form.senha) {
      nextErrors.senha = 'Informe sua senha.'
    }

    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  function handleSubmit(event) {
    event.preventDefault()
    if (!validate()) return

    setSubmitting(true)
    setTimeout(() => {
      setSubmitting(false)
      navigate('/dashboard')
    }, 500)
  }

  return (
    <AuthLayout>
      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        <h1 className="auth-form__title">Entrar</h1>
        <p className="auth-form__subtitle">Acesse sua conta institucional</p>

        <div className={`form-field ${errors.email ? 'has-error' : ''}`}>
          <label htmlFor="email">E-mail Institucional</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="nome@instituicao.edu.br"
            value={form.email}
            onChange={handleChange}
          />
          {errors.email && <span className="form-error">{errors.email}</span>}
        </div>

        <div className={`form-field ${errors.senha ? 'has-error' : ''}`}>
          <div className="form-field__row">
            <label htmlFor="senha">Senha</label>
            <Link to="/login" className="form-link">
              Esqueceu a senha?
            </Link>
          </div>
          <input
            id="senha"
            name="senha"
            type="password"
            autoComplete="current-password"
            placeholder="Digite sua senha"
            value={form.senha}
            onChange={handleChange}
          />
          {errors.senha && <span className="form-error">{errors.senha}</span>}
        </div>

        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Entrando...' : 'Entrar'}
        </button>

        <p className="auth-form__switch">
          Não possui conta? <Link to="/cadastro">Cadastre-se</Link>
        </p>
      </form>
    </AuthLayout>
  )
}
