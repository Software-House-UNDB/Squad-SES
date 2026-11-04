import { useEffect } from 'react'
import { CircleCheck, CircleX, X } from 'lucide-react'
import './ui.css'

const ICON = {
  approved: CircleCheck,
  rejected: CircleX,
}

/** Notificação flutuante com opção de desfazer a ação. Some sozinha após `duration` ms. */
export default function Toast({ variant, title, message, onUndo, onClose, duration = 6000 }) {
  useEffect(() => {
    const timer = setTimeout(onClose, duration)
    return () => clearTimeout(timer)
  }, [onClose, duration])

  const Icon = ICON[variant] ?? CircleCheck

  return (
    <div className={`toast toast--${variant}`} role="status">
      <Icon size={20} className="toast__icon" />
      <div className="toast__text">
        <p className="toast__title">{title}</p>
        <p className="toast__message">{message}</p>
      </div>
      {onUndo && (
        <button type="button" className="toast__undo" onClick={onUndo}>
          Desfazer
        </button>
      )}
      <button type="button" className="toast__close" onClick={onClose} aria-label="Fechar notificação">
        <X size={16} />
      </button>
    </div>
  )
}
