import './ui.css'

/**
 * Selo de status (ex.: "Em andamento", "Aprovado").
 * `variant` controla a cor: pending | approved | rejected | closed | neutral
 */
export default function Badge({ variant = 'neutral', children }) {
  return <span className={`badge badge--${variant}`}>{children}</span>
}
