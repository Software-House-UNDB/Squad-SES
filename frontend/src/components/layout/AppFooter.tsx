import './AppFooter.css'

export default function AppFooter() {
  return (
    <footer className="app-footer">
      Sistema desenvolvido pela Software House - UNDB © {new Date().getFullYear()} Todos os direitos reservados.
    </footer>
  )
}
