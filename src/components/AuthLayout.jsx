import Logo from './Logo.jsx'
import loginBg from '../assets/login-bg.jpg'
import logoSh from '../assets/logo-sh.png'
import logoEspma from '../assets/logo-espma.png'
import './AuthLayout.css'

export default function AuthLayout({ children }) {
  return (
    <div className="auth-layout">
      <div className="auth-layout__form-side">
        <div className="auth-layout__form-wrap">
          <Logo size="lg" className="auth-layout__logo" />
          {children}
        </div>
      </div>

      <div className="auth-layout__media-side" aria-hidden="true">
        <img className="auth-layout__media-img" src={loginBg} alt="" />
        <div className="auth-layout__media-shade" />

        <div className="auth-layout__partners">
          <img className="partner-logo partner-logo--sh" src={logoSh} alt="Software House UNDB" />
          <div className="partner-logo__chip">
            <img className="partner-logo partner-logo--espma" src={logoEspma} alt="ESPMA" />
          </div>
        </div>
      </div>
    </div>
  )
}
