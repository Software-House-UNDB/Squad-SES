import { useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthLayout from '../components/AuthLayout.tsx';
import '../styles/forms.css';

const initialForm = {
  nome: '',
  email: '',
  matricula: '',
  senha: '',
  confirmarSenha: '',
};

type FormErrors = Partial<Record<keyof typeof initialForm, string>>;

export default function Cadastro() {
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

    if (!form.nome.trim()) {
      nextErrors.nome = 'Informe seu nome completo.';
    }

    if (!form.email.trim()) {
      nextErrors.email = 'Informe seu e-mail institucional.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      nextErrors.email = 'Digite um e-mail válido.';
    }

    if (!form.matricula.trim()) {
      nextErrors.matricula = 'Informe sua matrícula.';
    }

    if (!form.senha) {
      nextErrors.senha = 'Crie uma senha.';
    } else if (form.senha.length < 6) {
      nextErrors.senha = 'A senha deve ter ao menos 6 caracteres.';
    }

    if (!form.confirmarSenha) {
      nextErrors.confirmarSenha = 'Confirme sua senha.';
    } else if (form.confirmarSenha !== form.senha) {
      nextErrors.confirmarSenha = 'As senhas não coincidem.';
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
      navigate('/cadastro/sucesso', { state: { email: form.email } });
    }, 500);
  }

  return (
    <AuthLayout>
      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        <h1 className="auth-form__title">Criar conta</h1>

        <div className={`form-field ${errors.nome ? 'has-error' : ''}`}>
          <label htmlFor="nome">Nome Completo</label>
          <input
            id="nome"
            name="nome"
            type="text"
            autoComplete="name"
            placeholder="Digite seu nome completo"
            value={form.nome}
            onChange={handleChange}
          />
          {errors.nome && <span className="form-error">{errors.nome}</span>}
        </div>

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

        <div className={`form-field ${errors.matricula ? 'has-error' : ''}`}>
          <label htmlFor="matricula">Matrícula</label>
          <input
            id="matricula"
            name="matricula"
            type="text"
            inputMode="numeric"
            placeholder="Digite sua matrícula"
            value={form.matricula}
            onChange={handleChange}
          />
          {errors.matricula && <span className="form-error">{errors.matricula}</span>}
        </div>

        <div className={`form-field ${errors.senha ? 'has-error' : ''}`}>
          <label htmlFor="senha">Senha</label>
          <input
            id="senha"
            name="senha"
            type="password"
            autoComplete="new-password"
            placeholder="Crie uma senha"
            value={form.senha}
            onChange={handleChange}
          />
          {errors.senha && <span className="form-error">{errors.senha}</span>}
        </div>

        <div className={`form-field ${errors.confirmarSenha ? 'has-error' : ''}`}>
          <label htmlFor="confirmarSenha">Confirmar Senha</label>
          <input
            id="confirmarSenha"
            name="confirmarSenha"
            type="password"
            autoComplete="new-password"
            placeholder="Repita a senha"
            value={form.confirmarSenha}
            onChange={handleChange}
          />
          {errors.confirmarSenha && <span className="form-error">{errors.confirmarSenha}</span>}
        </div>

        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Criando conta...' : 'Criar Conta'}
        </button>

        <p className="auth-form__switch">
          Já possui conta? <Link to="/login">Fazer login</Link>
        </p>
      </form>
    </AuthLayout>
  );
}
