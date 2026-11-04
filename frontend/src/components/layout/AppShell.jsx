import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar.jsx'
import Topbar from './Topbar.jsx'
import AppFooter from './AppFooter.jsx'
import './AppShell.css'

/** Casca da área autenticada do sistema: sidebar + topbar + conteúdo da rota + rodapé. */
export default function AppShell() {
  return (
    <div className="app-shell">
      <Sidebar />
      <div className="app-shell__main">
        <Topbar />
        <main className="app-shell__content">
          <Outlet />
        </main>
        <AppFooter />
      </div>
    </div>
  )
}
