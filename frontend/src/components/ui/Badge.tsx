import type { ReactNode } from 'react';
import './ui.css';

export type BadgeVariant =
  'pending' | 'approved' | 'rejected' | 'closed' | 'neutral' | 'info' | 'warning';

/**
 * Selo de status (ex.: "Em andamento", "Aprovado").
 * `variant` controla a cor: pending | approved | rejected | closed | neutral | info | warning
 */
export default function Badge({
  variant = 'neutral',
  children,
}: {
  variant?: BadgeVariant;
  children: ReactNode;
}) {
  return <span className={`badge badge--${variant}`}>{children}</span>;
}
