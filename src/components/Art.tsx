// Cangrejos y conchas dibujados a mano en SVG.

export function shade(hex: string, amount = 0.35) {
  const n = parseInt(hex.slice(1), 16)
  const r = Math.round(((n >> 16) & 255) * (1 - amount))
  const g = Math.round(((n >> 8) & 255) * (1 - amount))
  const b = Math.round((n & 255) * (1 - amount))
  return `rgb(${r} ${g} ${b})`
}

interface CrabProps {
  color?: string
  size?: number
  className?: string
  title?: string
}

export function Crab({ color = '#FF6A2B', size = 48, className, title }: CrabProps) {
  const dark = shade(color)
  const legs = (
    <g stroke={dark} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none">
      <path d="M19 31 L10 34 L6 40" />
      <path d="M20 34 L13 39 L11 45" />
      <path d="M23 36 L19 42 L18 47" />
    </g>
  )
  const claw = (
    <g>
      <path d="M19 25 Q11 22 11 15" stroke={dark} strokeWidth="3.5" strokeLinecap="round" fill="none" />
      <path className="crab-pincer" d="M11 16 C4 15.5 2.5 7 7 3.5 C8.4 6.6 10 7.6 13.4 7.4 C14.6 11 13.8 14.6 11 16 Z" fill={color} stroke={dark} strokeWidth="1.4" strokeLinejoin="round" />
    </g>
  )
  return (
    <svg
      viewBox="0 0 64 48"
      width={size}
      height={size * 0.75}
      className={className}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <g className="crab-legs crab-legs-l">{legs}</g>
      <g className="crab-legs crab-legs-r" transform="matrix(-1 0 0 1 64 0)">{legs}</g>
      <g className="crab-claw crab-claw-l">{claw}</g>
      <g className="crab-claw crab-claw-r" transform="matrix(-1 0 0 1 64 0)">{claw}</g>
      <g stroke={dark} strokeWidth="2.4" strokeLinecap="round">
        <line x1="27" y1="20" x2="25.5" y2="12" />
        <line x1="37" y1="20" x2="38.5" y2="12" />
      </g>
      <ellipse cx="32" cy="28.5" rx="15.5" ry="10.5" fill={color} stroke={dark} strokeWidth="1.4" />
      <ellipse cx="27" cy="24.5" rx="6" ry="2.6" fill="#fff" opacity="0.28" />
      <g className="crab-eyes">
        <circle cx="25.5" cy="10.5" r="3.8" fill="#FFF8EE" stroke={dark} strokeWidth="1.2" />
        <circle cx="38.5" cy="10.5" r="3.8" fill="#FFF8EE" stroke={dark} strokeWidth="1.2" />
        <circle cx="26.2" cy="11" r="1.8" fill="#14100E" />
        <circle cx="39.2" cy="11" r="1.8" fill="#14100E" />
      </g>
      <path d="M28.5 31 Q32 34 35.5 31" stroke={dark} strokeWidth="1.6" strokeLinecap="round" fill="none" />
      <circle cx="23.5" cy="30" r="1.8" fill="#fff" opacity="0.18" />
      <circle cx="40.5" cy="30" r="1.8" fill="#fff" opacity="0.18" />
    </svg>
  )
}

/** Concha de ermitaño con el inquilino asomando. Se usa como string para los marcadores del mapa. */
export function shellSvg(color: string, size = 34) {
  const dark = shade(color, 0.42)
  return `
  <svg viewBox="0 0 40 40" width="${size}" height="${size}" aria-hidden="true">
    <path d="M7 27 C4 18 9 6 21 5 C31 4.5 36 12 35 20 C34.2 27.5 28 33 19 33 C13 33 8.6 30.6 7 27 Z" fill="${color}" stroke="${dark}" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M10 26 C9 18 14 10.5 21.5 10.5 C27.5 10.5 30.5 15 30 19.5 C29.5 24 26 27 21.5 27 C17.5 27 15.3 24.2 15.6 21 C15.9 18 18.2 16.2 21 16.4 C23.3 16.6 24.6 18.4 24.3 20.3" fill="none" stroke="${dark}" stroke-width="1.7" stroke-linecap="round"/>
    <path d="M13 9.5 C16 7.8 19 7.2 22 7.4" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="1.6" stroke-linecap="round"/>
    <g class="hermit-eyes">
      <line x1="7.5" y1="28" x2="4.5" y2="22.5" stroke="#3a1d10" stroke-width="1.5" stroke-linecap="round"/>
      <line x1="10" y1="29.5" x2="9" y2="23.5" stroke="#3a1d10" stroke-width="1.5" stroke-linecap="round"/>
      <circle cx="4.3" cy="21.6" r="2.3" fill="#FFF8EE" stroke="#3a1d10" stroke-width=".9"/>
      <circle cx="9" cy="22.6" r="2.3" fill="#FFF8EE" stroke="#3a1d10" stroke-width=".9"/>
      <circle cx="4.6" cy="21.9" r="1" fill="#14100E"/>
      <circle cx="9.3" cy="22.9" r="1" fill="#14100E"/>
    </g>
  </svg>`
}

export function Shell({ color, size = 34 }: { color: string; size?: number }) {
  return <span className="shell-icon" style={{ width: size, height: size }} dangerouslySetInnerHTML={{ __html: shellSvg(color, size) }} />
}

/** El CHEF, dios de las cookeadas: cangrejo rojo con gorro de cocinero. */
export function ChefCrab({ size = 96, className }: { size?: number; className?: string }) {
  const hat = size * 0.62
  return (
    <span className={`hat-crab chef-crab ${className ?? ''}`} style={{ paddingTop: hat * 0.62 }} aria-hidden="true">
      <svg className="hat-crab-hat" viewBox="0 0 60 50" width={hat} height={hat * 0.83}>
        <path
          d="M14 34 C4 34 3 18 14 18 C14 7 28 3 32 11 C38 3 54 7 49 20 C58 22 56 35 46 34 Z"
          fill="#FFF8EE"
          stroke="#B9AFA3"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <rect x="15" y="32" width="31" height="12" rx="2.5" fill="#FFF8EE" stroke="#B9AFA3" strokeWidth="2" />
        <path d="M23 34 v8 M30.5 34 v8 M38 34 v8" stroke="#D9D0C4" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      <Crab color="#E5432F" size={size} />
    </span>
  )
}

/** El mago: cangrejo violeta con sombrero de estrellas. */
export function WizardCrabArt({ size = 84, className }: { size?: number; className?: string }) {
  const hat = size * 0.72
  return (
    <span className={`hat-crab ${className ?? ''}`} style={{ paddingTop: hat * 0.56 }} aria-hidden="true">
      <svg className="hat-crab-hat is-wizard" viewBox="0 0 60 50" width={hat} height={hat * 0.83}>
        <path d="M30 2 L46 40 L14 40 Z" fill="#6B4FD8" stroke="#3F2A93" strokeWidth="2" strokeLinejoin="round" />
        <path d="M30 2 Q38 6 42 14" fill="none" stroke="#9C86FF" strokeWidth="2" strokeLinecap="round" />
        <ellipse cx="30" cy="41" rx="26" ry="6" fill="#6B4FD8" stroke="#3F2A93" strokeWidth="2" />
        <path d="M27 20 l1.4 3 3.2.4-2.4 2.2.6 3.2-2.8-1.6-2.8 1.6.6-3.2-2.4-2.2 3.2-.4z" fill="#F2B44C" />
        <circle cx="35" cy="31" r="1.6" fill="#F2B44C" />
      </svg>
      <Crab color="#9C86FF" size={size} />
    </span>
  )
}
