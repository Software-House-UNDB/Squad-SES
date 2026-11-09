import { Bell, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/useAuth.ts';
import './Topbar.css';

// TODO: substituir pelos dados do usuário autenticado quando a sessão existir.
const PLACEHOLDER_USER = { name: 'Débora Vieira', initials: 'DV' };

interface TopbarProps {
  user?: { name: string; initials: string };
}

export default function Topbar({ user = PLACEHOLDER_USER }: TopbarProps) {
  const navigate = useNavigate();
  const { logout } = useAuth();

  return (
    <header className="topbar">
      <div className="topbar__spacer" />
      <div className="topbar__actions">
        <button type="button" className="topbar__bell" aria-label="Notificações">
          <Bell size={19} strokeWidth={2} />
        </button>
        <div className="topbar__avatar" title={user.name}>
          {user.initials}
        </div>
        <button
          type="button"
          className="topbar__logout"
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
