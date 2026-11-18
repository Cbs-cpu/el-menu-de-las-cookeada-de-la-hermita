import { useEffect, useRef } from 'react'
import { Crab } from './Art'
import { Icon } from './ui'

const SECTIONS = [{ id: 'conchas', name: 'Conchas para hermitaños', desc: 'El mapa de spots de la hermita', color: '#FF6A2B', ready: true }]

export function SectionMenu({ open, onClose, count }: { open: boolean; onClose: () => void; count: number }) {
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
        <h1 className="menu-title">El menú de cookeadas de la hermita</h1>

        <ul className="menu-list">
          {SECTIONS.map((s) => (
            <li key={s.id}>
              <button type="button" className="menu-item is-current" aria-current="page" onClick={onClose}>
                <Crab color={s.color} size={34} />
                <span>
                  <strong>{s.name}</strong>
                  <small>
                    {s.desc}, {count} {count === 1 ? 'concha' : 'conchas'}
                  </small>
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
        <p className="menu-foot muted">Las conchas, fotos y vídeos se comparten con toda la hermita.</p>
      </nav>
    </div>
  )
}
