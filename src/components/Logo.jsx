import logoSages from '../assets/logo-sages.png'
import './Logo.css'

export default function Logo({ size = 'md', className = '' }) {
  return (
    <div className={`logo logo--${size} ${className}`}>
      <img className="logo__icon" src={logoSages} alt="SAGES" />
    </div>
  )
}
