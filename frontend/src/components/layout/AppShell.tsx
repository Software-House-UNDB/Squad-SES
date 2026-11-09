import { useCallback, useEffect, useRef, useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar.tsx';
import Topbar from './Topbar.tsx';
import AppFooter from './AppFooter.tsx';
import './AppShell.css';

const FOCUSABLE_NO_MENU = '#menu-principal a[href], #menu-principal button:not([disabled])';

/** Casca da área autenticada: menu do perfil + header + conteúdo da rota + rodapé. */
export default function AppShell() {
  const [menuOpen, setMenuOpen] = useState(false);
  const opener = useRef<HTMLElement | null>(null);

  const openMenu = useCallback(() => {
    opener.current = document.activeElement as HTMLElement | null;
    setMenuOpen(true);
  }, []);

  // Ao fechar, o foco volta para o botão que abriu a gaveta.
  const closeMenu = useCallback(() => {
    setMenuOpen(false);
    opener.current?.focus();
    opener.current = null;
  }, []);

  // Com a gaveta aberta: Esc fecha e Tab fica preso dentro do menu.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return closeMenu();
      if (e.key !== 'Tab') return;

      const items = document.querySelectorAll<HTMLElement>(FOCUSABLE_NO_MENU);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;

      if (!document.getElementById('menu-principal')?.contains(active)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [menuOpen, closeMenu]);

  // Se a janela passa a ser larga, o menu volta a ser fixo: encerra o estado de gaveta.
  useEffect(() => {
    const query = window.matchMedia?.('(min-width: 901px)');
    if (!query) return;
    const onChange = () => query.matches && setMenuOpen(false);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  return (
    <div className="app-shell">
      <a className="app-shell__skip" href="#conteudo">
        Ir para o conteúdo
      </a>
      <Sidebar open={menuOpen} onClose={closeMenu} />
      <div className="app-shell__main">
        <Topbar menuOpen={menuOpen} onOpenMenu={openMenu} />
        <main id="conteudo" className="app-shell__content">
          <Outlet />
        </main>
        <AppFooter />
      </div>
    </div>
  );
}
