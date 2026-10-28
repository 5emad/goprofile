/** The "gp" mark with the accent dot at its top right. */
export function Logo({ size = 36, withText = false }: { size?: number; withText?: boolean }) {
  return (
    <span className="logo">
      <svg width={size} height={size} viewBox="0 0 128 128" aria-label="گوپروفایل">
        <rect width="128" height="128" rx="30" className="logo-bg" />
        <g fill="none" className="logo-ink" strokeWidth="11" strokeLinecap="round">
          <circle cx="42" cy="60" r="17" />
          <path d="M59 46v34c0 14-9 22-21 22-6 0-11-2-14-6" />
          <circle cx="84" cy="60" r="17" />
          <path d="M67 46v58" />
        </g>
        <circle cx="106" cy="26" r="9" className="logo-dot" />
      </svg>
      {withText && <span className="logo-text">goprofile</span>}
    </span>
  )
}
