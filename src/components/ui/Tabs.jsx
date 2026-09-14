import './ui.css'

/**
 * Abas simples controladas pelo componente pai.
 * `items`: [{ value, label, icon: Component }]
 */
export default function Tabs({ items, value, onChange }) {
  return (
    <div className="tabs" role="tablist">
      {items.map((item) => {
        const isSelected = item.value === value
        const Icon = item.icon
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={isSelected}
            className={`tabs__item ${isSelected ? 'tabs__item--active' : ''}`}
            onClick={() => onChange(item.value)}
          >
            {Icon && <Icon size={16} strokeWidth={2} />}
            {item.label}
          </button>
        )
      })}
    </div>
  )
}
