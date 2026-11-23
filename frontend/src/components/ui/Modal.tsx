import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import './ui.css';

/** Tempo, depois de abrir, em que o fundo ignora cliques (ver o onMouseDown abaixo). */
const JANELA_DUPLO_CLIQUE_MS = 400;

interface ModalProps {
  title: string;
  subtitle?: string;
  size?: 'md' | 'lg';
  onClose: () => void;
  footer?: ReactNode;
  children: ReactNode;
}

/**
 * Diálogo modal genérico. `size`: 'md' (padrão) | 'lg' (telas com abas/tabela).
 * `footer` recebe os botões de ação; `children` é o conteúdo do corpo.
 */
export default function Modal({
  title,
  subtitle,
  size = 'md',
  onClose,
  footer,
  children,
}: ModalProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const abertoEm = useRef(0);
  // O clique só fecha se o botão desceu E subiu no fundo: arrastar de dentro do diálogo para fora
  // (ex.: selecionando texto) dispara o click no fundo, mas não é "clicar fora".
  const desceuNoFundo = useRef(false);

  useEffect(() => {
    abertoEm.current = Date.now();
    closeButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        // Num duplo clique no botão que abriu o modal, o 2º clique cai no fundo recém-criado e o
        // fecharia na hora. Cliques no fundo logo depois de abrir não são "clicar fora".
        desceuNoFundo.current =
          e.target === e.currentTarget && Date.now() - abertoEm.current > JANELA_DUPLO_CLIQUE_MS;
      }}
      onClick={(e) => {
        const fechar = desceuNoFundo.current && e.target === e.currentTarget;
        desceuNoFundo.current = false;
        if (fechar) onClose();
      }}
    >
      <div className={`modal modal--${size}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal__header">
          <div>
            <h2 className="modal__title">{title}</h2>
            {subtitle && <p className="modal__subtitle">{subtitle}</p>}
          </div>
          <button
            type="button"
            className="modal__close"
            onClick={onClose}
            ref={closeButtonRef}
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </div>

        <div className="modal__body">{children}</div>

        {footer && <div className="modal__footer">{footer}</div>}
      </div>
    </div>
  );
}
