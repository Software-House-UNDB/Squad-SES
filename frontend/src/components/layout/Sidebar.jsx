import { NavLink } from 'react-router-dom'
import { FileText, Pen, User, Settings } from 'lucide-react'
import Logo from '../Logo.jsx'
import './Sidebar.css'

const NAV_SECTIONS = [
  {
    label: 'Gerenciamento',
    items: [
      { to: '/gerenciamento/analise-oficios', label: 'Análise de Ofícios', icon: FileText },
      { to: '/gerenciamento/assinatura-termos', label: 'Assinatura de Termos', icon: Pen },
    ],
  },
  {
    label: 'Administração',
    items: [
      { to: '/administracao/usuarios', label: 'Usuários', icon: User },
      { to: '/administracao/configuracoes', label: 'Configurações', icon: Settings },
    ],
  },
]

export default function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="sidebar__brand">
        <Logo size="sm" />
      </div>

      <nav className="sidebar__nav">
        {NAV_SECTIONS.map((section) => (
          <div className="sidebar__section" key={section.label}>
            <p className="sidebar__section-label">{section.label}</p>
            {section.items.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) => `sidebar__item ${isActive ? 'sidebar__item--active' : ''}`}
              >
                <Icon size={17} strokeWidth={2} />
                {label}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
    </aside>
  )
}
