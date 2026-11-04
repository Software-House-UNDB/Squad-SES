import PageHeader from '../components/layout/PageHeader.jsx'
import './Placeholder.css'

/** Tela reservada para seções do menu que ainda não têm fluxo implementado. */
export default function Placeholder({ icon, title, breadcrumb }) {
  return (
    <>
      <PageHeader icon={icon} title={title} breadcrumb={breadcrumb} />
      <div className="placeholder-card">
        <p>Esta seção ainda não foi implementada.</p>
      </div>
    </>
  )
}
