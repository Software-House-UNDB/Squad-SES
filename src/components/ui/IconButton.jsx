import './ui.css'

/** Botão só-ícone, usado nas ações de linha da tabela e nos cabeçalhos de modal. */
export default function IconButton({ icon: Icon, label, onClick, variant = 'default', size = 16, disabled = false }) {
  return (
    <button
      type="button"
      className={`icon-button icon-button--${variant}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={disabled ? `${label} (em breve)` : label}
      title={disabled ? `${label} — em breve` : label}
    >
      <Icon size={size} strokeWidth={2} />
    </button>
  )
}
