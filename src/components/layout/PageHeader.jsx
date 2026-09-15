import './PageHeader.css'

/** Cabeçalho padrão das páginas internas: ícone + título + trilha de navegação. */
export default function PageHeader({ icon: Icon, title, breadcrumb }) {
  return (
    <div className="page-header">
      <div className="page-header__title-row">
        {Icon && (
          <span className="page-header__icon">
            <Icon size={20} strokeWidth={2} />
          </span>
        )}
        <h1 className="page-header__title">{title}</h1>
      </div>
      {breadcrumb && <p className="page-header__breadcrumb">{breadcrumb.join('  /  ')}</p>}
    </div>
  )
}
