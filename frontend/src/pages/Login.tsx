import { useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthLayout from '../components/AuthLayout.tsx';
import '../styles/forms.css';

const initialForm = {
  email: '',
  senha: '',
};

// Credencial fixa para a demonstração aos stakeholders. Remover quando a autenticação real for integrada.
const DEMO_USER = {
  email: 'coordenacao@espma.edu.br',
  senha: 'Espma@2026',
};

type FormErrors = Partial<Record<keyof typeof initialForm | 'credenciais', string>>;

export default function Login() {
  const navigate = useNavigate();
  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function validate() {
    const nextErrors: FormErrors = {};

    if (!form.email.trim()) {
      nextErrors.email = 'Informe seu e-mail institucional.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      nextErrors.email = 'Digite um e-mail válido.';
    }

    if (!form.senha) {
      nextErrors.senha = 'Informe sua senha.';
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    setTimeout(() => {
      setSubmitting(false);

      const credentialsMatch =
        form.email.trim().toLowerCase() === DEMO_USER.email && form.senha === DEMO_USER.senha;

      if (!credentialsMatch) {
        setErrors({ credenciais: 'E-mail ou senha inválidos.' });
        return;
      }

      navigate('/gerenciamento/analise-oficios');
    }, 500);
  }

  return (
    <AuthLayout>
      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        <h1 className="auth-form__title">Entrar</h1>
        <p className="auth-form__subtitle">Acesse sua conta institucional</p>

        <div className="auth-form__demo-hint">
          <strong>Acesso de demonstração</strong>
          <span>{DEMO_USER.email}</span>
          <span>{DEMO_USER.senha}</span>
        </div>

        {errors.credenciais && (
          <p className="form-error form-error--general">{errors.credenciais}</p>
        )}

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
  );
}
