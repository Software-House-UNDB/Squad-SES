import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar.tsx';
import Topbar from './Topbar.tsx';
import AppFooter from './AppFooter.tsx';
import './AppShell.css';

/** Casca da área autenticada: menu do perfil + header + conteúdo da rota + rodapé. */
export default function AppShell() {
  const [menuOpen, setMenuOpen] = useState(false);

  // Esc fecha a gaveta do menu no mobile.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  return (
    <div className="app-shell">
      <a className="app-shell__skip" href="#conteudo">
        Ir para o conteúdo
      </a>
      <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />
      <div className="app-shell__main">
        <Topbar menuOpen={menuOpen} onOpenMenu={() => setMenuOpen(true)} />
        <main id="conteudo" className="app-shell__content">
          <Outlet />
        </main>
        <AppFooter />
      </div>
    </div>
  );
}
