import { Bell, LogOut, Menu } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/useAuth.ts';
import { initialsFromEmail, PERFIL_LABEL } from '../../routes/navigation.ts';
import './Topbar.css';

interface TopbarProps {
  onOpenMenu: () => void;
  menuOpen: boolean;
}

export default function Topbar({ onOpenMenu, menuOpen }: TopbarProps) {
  const navigate = useNavigate();
  const { usuario, logout } = useAuth();
  if (!usuario) return null;

  return (
    <header className="topbar">
      <button
        type="button"
        className="topbar__icon-btn topbar__menu"
        aria-label="Abrir menu"
        aria-controls="menu-principal"
        aria-expanded={menuOpen}
        onClick={onOpenMenu}
      >
        <Menu size={20} />
      </button>

      <div className="topbar__actions">
        <button type="button" className="topbar__icon-btn" aria-label="Notificações">
          <Bell size={19} strokeWidth={2} />
        </button>

        <div className="topbar__user">
          <div className="topbar__avatar" aria-hidden="true">
            {initialsFromEmail(usuario.email)}
          </div>
          <div className="topbar__identity">
            <span className="topbar__email">{usuario.email}</span>
            <span className="topbar__role">
              {PERFIL_LABEL[usuario.perfil]}
              {usuario.instituicao ? ` - ${usuario.instituicao}` : ''}
            </span>
          </div>
        </div>

        <button
          type="button"
          className="topbar__icon-btn topbar__logout"
          title="Sair"
          aria-label="Sair"
          onClick={() => {
            logout();
            navigate('/login', { replace: true });
          }}
        >
          <LogOut size={18} strokeWidth={2} />
        </button>
      </div>
    </header>
  );
}
