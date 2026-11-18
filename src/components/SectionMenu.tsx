import { useEffect, useRef } from 'react'
import { Crab } from './Art'
import { Icon } from './ui'
import { signOut, usernameOf, useSession } from '../lib/auth'

export type SectionId = 'conchas' | 'explorar' | 'aleatoria' | 'del-dia' | 'retos' | 'ranking'

export const SECTIONS: { id: SectionId; name: string; desc: string; color: string }[] = [
  { id: 'conchas', name: 'Conchas para ermitaños', desc: 'El mapa de spots de la ermita', color: '#FF6A2B' },
  { id: 'explorar', name: 'Explorar conchas', desc: 'Filtra por zona, valoración y características', color: '#3FBFAE' },
  { id: 'aleatoria', name: 'Concha aleatoria', desc: 'Una concha al azar de la zona que elijas', color: '#F2B44C' },
  { id: 'del-dia', name: 'Concha del día', desc: 'Tu misión de hoy, por orden del CHEF', color: '#E5432F' },
  { id: 'retos', name: 'Retos diarios', desc: 'Dos conchas al día para ganar puntos', color: '#FF8E9E' },
  { id: 'ranking', name: 'Ranking de cookeadores', desc: 'Quién va en cabeza y se lleva el descuento', color: '#F5C542' },
]

interface Props {
  open: boolean
  onClose: () => void
  count: number
  current: SectionId
  onSelect: (id: SectionId) => void
}

export function SectionMenu({ open, onClose, count, current, onSelect }: Props) {
  const session = useSession()
  const closeBtn = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open) return
    closeBtn.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <div className={`menu-layer ${open ? 'is-open' : ''}`} aria-hidden={!open} inert={!open}>
      <div className="menu-scrim" onClick={onClose} />
      <nav className="menu" aria-label="Secciones">
        <header className="menu-head">
          <div className="menu-crabs" aria-hidden="true">
            <Crab color="#FF6A2B" size={56} />
            <Crab color="#E5432F" size={38} />
            <Crab color="#F2B44C" size={30} />
          </div>
          <button ref={closeBtn} type="button" className="icon-btn" onClick={onClose} aria-label="Cerrar menú">
            <Icon.Close size={20} />
          </button>
        </header>
        <h1 className="menu-title">El menú de cookeadas de la ermita</h1>

        <ul className="menu-list">
          {SECTIONS.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                className={`menu-item ${s.id === current ? 'is-current' : ''}`}
                aria-current={s.id === current ? 'page' : undefined}
                onClick={() => {
                  onSelect(s.id)
                  onClose()
                }}
              >
                <Crab color={s.color} size={34} />
                <span>
                  <strong>{s.name}</strong>
                  <small>{s.id === 'conchas' ? `${s.desc}, ${count} ${count === 1 ? 'concha' : 'conchas'}` : s.desc}</small>
                </span>
              </button>
            </li>
          ))}
          <li className="menu-soon">
            <Crab color="#9C86FF" size={34} />
            <span>
              <strong>Más secciones</strong>
              <small>Los cangrejos están cocinando las siguientes</small>
            </span>
          </li>
        </ul>
        <div className="menu-user">
          <span>
            <small>Has entrado como</small>
            <strong>{usernameOf(session)}</strong>
          </span>
          <button type="button" className="btn btn-ghost" onClick={signOut}>
            Cerrar sesión
          </button>
        </div>
      </nav>
    </div>
  )
}
