import type { LucideIcon } from 'lucide-react';
import './ui.css';

interface IconButtonProps {
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
  variant?: 'default' | 'primary' | 'danger';
  size?: number;
  disabled?: boolean;
}

/** Botão só-ícone, usado nas ações de linha da tabela e nos cabeçalhos de modal. */
export default function IconButton({
  icon: Icon,
  label,
  onClick,
  variant = 'default',
  size = 16,
  disabled = false,
}: IconButtonProps) {
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
  );
}
