import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar.tsx'
import Topbar from './Topbar.tsx'
import AppFooter from './AppFooter.tsx'
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
