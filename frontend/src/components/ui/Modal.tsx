import { useEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'
import './ui.css'

interface ModalProps {
  title: string
  subtitle?: string
  size?: 'md' | 'lg'
  onClose: () => void
  footer?: ReactNode
  children: ReactNode
}

/**
 * Diálogo modal genérico. `size`: 'md' (padrão) | 'lg' (telas com abas/tabela).
 * `footer` recebe os botões de ação; `children` é o conteúdo do corpo.
 */
export default function Modal({ title, subtitle, size = 'md', onClose, footer, children }: ModalProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    closeButtonRef.current?.focus()

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
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
  )
}
