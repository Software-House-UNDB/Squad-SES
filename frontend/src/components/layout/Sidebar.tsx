import { NavLink } from 'react-router-dom';
import { X } from 'lucide-react';
import Logo from '../Logo.tsx';
import { useAuth } from '../../auth/useAuth.ts';
import { navFor, PERFIL_LABEL } from '../../routes/navigation.ts';
import './Sidebar.css';

interface SidebarProps {
  /** Só afeta telas estreitas, onde o menu vira uma gaveta. */
  open: boolean;
  onClose: () => void;
}

export default function Sidebar({ open, onClose }: SidebarProps) {
  const { usuario } = useAuth();
  if (!usuario) return null;

  return (
    <>
      <div
        className={`sidebar-backdrop ${open ? 'sidebar-backdrop--open' : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside id="menu-principal" className={`sidebar ${open ? 'sidebar--open' : ''}`}>
        <div className="sidebar__brand">
          <Logo size="sm" />
          <button type="button" className="sidebar__close" aria-label="Fechar menu" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <nav className="sidebar__nav" aria-label="Menu principal">
          {navFor(usuario.perfil).map((section, i) => (
            <div className="sidebar__section" key={section.label ?? i}>
              {section.label && <p className="sidebar__section-label">{section.label}</p>}
              {section.items.map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  onClick={onClose}
                  className={({ isActive }) =>
                    `sidebar__item ${isActive ? 'sidebar__item--active' : ''}`
                  }
                >
                  <Icon size={18} strokeWidth={2} aria-hidden="true" />
                  {label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <p className="sidebar__profile">{PERFIL_LABEL[usuario.perfil]}</p>
      </aside>
    </>
  );
}
