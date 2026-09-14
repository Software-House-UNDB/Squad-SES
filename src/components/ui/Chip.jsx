import './ui.css'

/** Chip de filtro (ex.: "Todos", "Aprovado"). `active` destaca a seleção atual. */
export default function Chip({ active = false, onClick, children }) {
  return (
    <button type="button" className={`chip ${active ? 'chip--active' : ''}`} onClick={onClick}>
      {children}
    </button>
  )
}
