import './Logo.css'

export default function Logo({ size = 'md', className = '' }) {
  return (
    <div className={`logo logo--${size} ${className}`}>
      <svg
        className="logo__icon"
        viewBox="0 0 48 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path
          d="M4 8c0-3.3 2.7-6 6-6h19c5.2 0 5.2 8 0 8H15c-4.2 0-4.2 8 0 8h16.5c5.2 0 5.2 8 0 8H13"
          stroke="currentColor"
          strokeWidth="4.4"
          strokeLinecap="round"
        />
        <circle cx="41.5" cy="26" r="2.6" fill="currentColor" />
        <circle cx="36" cy="32.5" r="2.6" fill="currentColor" />
        <circle cx="27.5" cy="37" r="2.6" fill="currentColor" />
      </svg>
      <span className="logo__text">SAGES</span>
    </div>
  )
}
