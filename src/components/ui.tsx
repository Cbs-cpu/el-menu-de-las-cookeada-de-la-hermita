import { useEffect, useRef, useState, type SVGProps } from 'react'

const STAR = 'M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z'

/** Número de estrellas en español: 3,5 */
export const formatRating = (v: number) => v.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

/** Estrellas de solo lectura, con medias estrellas. */
export function Stars({ value, size = 16 }: { value: number; size?: number }) {
  const v = Math.round(value * 2) / 2
  return (
    <span className="stars" role="img" aria-label={value ? `${formatRating(value)} de 5 estrellas` : 'Sin valorar'}>
      {[1, 2, 3, 4, 5].map((i) => {
        const fill = Math.max(0, Math.min(1, v - (i - 1))) // 0, 0.5 o 1
        return (
          <span key={i} className="star" style={{ width: size, height: size }}>
            <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
              <path d={STAR} className="star-off" />
            </svg>
            {fill > 0 && (
              <span className="star-fill" style={{ width: `${fill * 100}%` }}>
                <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
                  <path d={STAR} className="star-on" />
                </svg>
              </span>
            )}
          </span>
        )
      })}
    </span>
  )
}

const LABELS: [number, string][] = [
  [0, 'Sin valorar'],
  [1, 'Ni para un ermitaño'],
  [2, 'Flojita'],
  [3, 'Se puede vivir'],
  [4, 'Buena concha'],
  [4.5, 'Concha de lujo'],
  [5, 'La concha definitiva'],
]
const labelFor = (v: number) => LABELS.find(([max]) => v <= max)?.[1] ?? ''

/**
 * Valoración con medias estrellas: se toca o arrastra sobre las estrellas (la mitad
 * izquierda de cada una es media estrella) o se usan las flechas del teclado.
 */
export function StarInput({ value, onChange, size = 32 }: { value: number; onChange: (v: number) => void; size?: number }) {
  const [hover, setHover] = useState<number | null>(null)
  const row = useRef<HTMLDivElement>(null)
  const shown = hover ?? value

  const valueAt = (clientX: number) => {
    const r = row.current!.getBoundingClientRect()
    const x = Math.min(Math.max(clientX - r.left, 0), r.width)
    return Math.max(0.5, Math.ceil((x / r.width) * 10) / 2)
  }

  return (
    <div className="star-input">
      <div
        ref={row}
        className="star-input-row"
        role="slider"
        tabIndex={0}
        aria-label="Valoración"
        aria-valuemin={0}
        aria-valuemax={5}
        aria-valuenow={value}
        aria-valuetext={value ? `${formatRating(value)} estrellas, ${labelFor(value)}` : 'Sin valorar'}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          onChange(valueAt(e.clientX))
        }}
        onPointerMove={(e) => {
          const v = valueAt(e.clientX)
          if (e.buttons) onChange(v)
          else if (e.pointerType === 'mouse') setHover(v)
        }}
        onPointerLeave={() => setHover(null)}
        onKeyDown={(e) => {
          const step = { ArrowRight: 0.5, ArrowUp: 0.5, ArrowLeft: -0.5, ArrowDown: -0.5 }[e.key]
          if (step !== undefined) {
            e.preventDefault()
            onChange(Math.min(5, Math.max(0, value + step)))
          } else if (e.key === 'Home' || e.key === 'Delete' || e.key === 'Backspace') {
            e.preventDefault()
            onChange(0)
          } else if (e.key === 'End') {
            e.preventDefault()
            onChange(5)
          }
        }}
      >
        <Stars value={shown} size={size} />
      </div>
      <span className="star-caption">
        {shown ? <strong className="tabular">{formatRating(shown)}</strong> : null} {labelFor(shown)}
      </span>
      {value > 0 && (
        <button type="button" className="star-clear" onClick={() => onChange(0)}>
          Quitar
        </button>
      )}
    </div>
  )
}

export function useObjectUrl(blob?: Blob) {
  const [url, setUrl] = useState<string>()
  useEffect(() => {
    if (!blob) return
    const u = URL.createObjectURL(blob)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [blob])
  return url
}

type IconProps = SVGProps<SVGSVGElement> & { size?: number }
const base = (size = 20): SVGProps<SVGSVGElement> => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
})

export const Icon = {
  Search: ({ size, ...p }: IconProps) => (
    <svg {...base(size)} {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
  ),
  Close: ({ size, ...p }: IconProps) => (
    <svg {...base(size)} {...p}><path d="M18 6 6 18M6 6l12 12" /></svg>
  ),
  Plus: ({ size, ...p }: IconProps) => (
    <svg {...base(size)} {...p}><path d="M12 5v14M5 12h14" /></svg>
  ),
  Minus: ({ size, ...p }: IconProps) => (
    <svg {...base(size)} {...p}><path d="M5 12h14" /></svg>
  ),
  Locate: ({ size, ...p }: IconProps) => (
    <svg {...base(size)} {...p}><circle cx="12" cy="12" r="3.5" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /><circle cx="12" cy="12" r="7.5" /></svg>
  ),
  List: ({ size, ...p }: IconProps) => (
    <svg {...base(size)} {...p}><path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" /></svg>
  ),
  Back: ({ size, ...p }: IconProps) => (
    <svg {...base(size)} {...p}><path d="M15 18 9 12l6-6" /></svg>
  ),
  Pin: ({ size, ...p }: IconProps) => (
    <svg {...base(size)} {...p}><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21Z" /><circle cx="12" cy="9.5" r="2.5" /></svg>
  ),
  Route: ({ size, ...p }: IconProps) => (
    <svg {...base(size)} {...p}><path d="m3 11 18-8-8 18-2-8-8-2Z" /></svg>
  ),
  Edit: ({ size, ...p }: IconProps) => (
    <svg {...base(size)} {...p}><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z" /></svg>
  ),
  Trash: ({ size, ...p }: IconProps) => (
    <svg {...base(size)} {...p}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>
  ),
  Image: ({ size, ...p }: IconProps) => (
    <svg {...base(size)} {...p}><rect x="3" y="4" width="18" height="16" rx="3" /><circle cx="9" cy="10" r="2" /><path d="m21 16-5-5-9 9" /></svg>
  ),
  Play: ({ size, ...p }: IconProps) => (
    <svg {...base(size)} {...p} fill="currentColor" stroke="none"><path d="M8 5.5v13l11-6.5z" /></svg>
  ),
  Layers: ({ size, ...p }: IconProps) => (
    <svg {...base(size)} {...p}><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 13 9 5 9-5" /></svg>
  ),
  Chevron: ({ size, ...p }: IconProps) => (
    <svg {...base(size)} {...p}><path d="m9 6 6 6-6 6" /></svg>
  ),
  Copy: ({ size, ...p }: IconProps) => (
    <svg {...base(size)} {...p}><rect x="9" y="9" width="12" height="12" rx="2.5" /><path d="M5 15V5a2 2 0 0 1 2-2h8" /></svg>
  ),
}
