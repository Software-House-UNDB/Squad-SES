import { Link } from 'react-router-dom';
import { House } from 'lucide-react';
import PageHeader from '../components/layout/PageHeader.tsx';
import { useAuth } from '../auth/useAuth.ts';
import { navFor } from '../routes/navigation.ts';
import './Dashboard.css';

const BOAS_VINDAS = {
  coordenacao_ses: 'Acompanhe os ofícios enviados pelas instituições e os termos aguardando assinatura.',
  representante_ies:
    'O envio de ofícios e pacotes de documentos da sua instituição estará disponível aqui em breve.',
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
