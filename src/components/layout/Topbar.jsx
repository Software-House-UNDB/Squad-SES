import { Bell } from 'lucide-react'
import './Topbar.css'

// TODO: substituir pelos dados do usuário autenticado quando a sessão existir.
const PLACEHOLDER_USER = { name: 'Débora Vieira', initials: 'DV' }

export default function Topbar({ user = PLACEHOLDER_USER }) {
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
      </div>
    </header>
  )
}
