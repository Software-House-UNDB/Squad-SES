import { Link } from 'react-router-dom';
import { House } from 'lucide-react';
import PageHeader from '../components/layout/PageHeader.tsx';
import { useAuth } from '../auth/useAuth.ts';
import { navFor } from '../routes/navigation.ts';
import type { Perfil } from '../types/auth.ts';
import './Dashboard.css';

const BOAS_VINDAS: Record<Perfil, string> = {
  COORDENACAO_SES: 'Acompanhe os ofícios enviados pelas instituições e os termos aguardando assinatura.',
  REPRESENTANTE_UNDB:
    'Envie o pacote de documentos dos estagiários e acompanhe os processos da sua instituição, inclusive os devolvidos pela SES para correção.',
};

/** Tela inicial após o login. Os atalhos seguem o menu do perfil. */
export default function Dashboard() {
  const { usuario } = useAuth();
  if (!usuario) return null;

  const atalhos = navFor(usuario.perfil)
    .flatMap((section) => section.items)
    .filter((item) => item.to !== '/dashboard');

  return (
    <>
      <PageHeader icon={House} title="Bem-vindo(a) ao SAGES!" breadcrumb={['Início']} />

      <section className="dashboard-card">
        <p className="dashboard-card__text">{BOAS_VINDAS[usuario.perfil]}</p>

        {atalhos.length > 0 && (
          <ul className="dashboard-card__links">
            {atalhos.map(({ to, label, icon: Icon }) => (
              <li key={to}>
                <Link to={to} className="dashboard-card__link">
                  <Icon size={18} aria-hidden="true" />
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
