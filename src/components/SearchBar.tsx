import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { searchPlaces, type Place } from '../lib/geo'
import { SHELL_COLORS, type Spot } from '../lib/db'
import { Crab, Shell } from './Art'
import { Icon } from './ui'

interface Props {
  spots: Spot[]
  near: () => { lat: number; lng: number; zoom: number }
  onMenu: () => void
  onPickSpot: (s: Spot) => void
  onPickPlace: (p: Place) => void
}

type Result = { type: 'spot'; spot: Spot } | { type: 'place'; place: Place }

export function SearchBar({ spots, near, onMenu, onPickSpot, onPickPlace }: Props) {
  const [q, setQ] = useState('')
  const [places, setPlaces] = useState<Place[]>([])
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const listId = useId()
  const inputRef = useRef<HTMLInputElement>(null)

  const term = q.trim()
  const mine = useMemo(() => {
    if (!term) return []
    const t = norm(term)
    return spots.filter((s) => norm(s.name).includes(t) || norm(s.notes).includes(t) || norm(s.address ?? '').includes(t)).slice(0, 4)
  }, [spots, term])

  useEffect(() => {
    if (term.length < 2) {
      setPlaces([])
      setStatus('idle')
      return
    }
    const ctrl = new AbortController()
    setStatus('loading')
    const t = setTimeout(() => {
      searchPlaces(term, near(), ctrl.signal)
        .then((r) => {
          setPlaces(r)
          setStatus('idle')
        })
        .catch((e) => {
          if (e.name !== 'AbortError') setStatus('error')
        })
    }, 280)
    return () => {
      clearTimeout(t)
      ctrl.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term])

  const results: Result[] = [...mine.map((spot) => ({ type: 'spot' as const, spot })), ...places.map((place) => ({ type: 'place' as const, place }))]
  const showList = open && term.length > 0

  function pick(r: Result) {
    if (r.type === 'spot') onPickSpot(r.spot)
    else onPickPlace(r.place)
    setOpen(false)
    inputRef.current?.blur()
  }

  return (
    <div className={`search ${showList ? 'is-open' : ''}`}>
      <div className="search-bar">
        <button type="button" className="icon-btn search-menu" onClick={onMenu} aria-label="Abrir menú de secciones">
          <Crab size={30} />
        </button>
        <input
          ref={inputRef}
          type="search"
          value={q}
          placeholder="Busca un sitio o una concha"
          aria-label="Buscar"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && results[active] ? `${listId}-${active}` : undefined}
          onChange={(e) => {
            setQ(e.target.value)
            setOpen(true)
            setActive(0)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setActive((a) => Math.min(a + 1, results.length - 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setActive((a) => Math.max(a - 1, 0))
            } else if (e.key === 'Enter' && results[active]) {
              e.preventDefault()
              pick(results[active])
            } else if (e.key === 'Escape') {
              setOpen(false)
            }
          }}
        />
        {q ? (
          <button type="button" className="icon-btn" aria-label="Borrar búsqueda" onClick={() => { setQ(''); inputRef.current?.focus() }}>
            <Icon.Close size={18} />
          </button>
        ) : (
          <span className="search-icon"><Icon.Search size={18} /></span>
        )}
      </div>

      {showList && (
        <ul className="search-results" id={listId} role="listbox">
          {results.map((r, i) => (
            <li
              key={r.type === 'spot' ? r.spot.id : r.place.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={`search-item ${i === active ? 'is-active' : ''}`}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(r)}
            >
              {r.type === 'spot' ? (
                <>
                  <Shell color={SHELL_COLORS[r.spot.shell].hex} size={28} />
                  <span className="search-text">
                    <strong>{r.spot.name}</strong>
                    <small>Tu concha{r.spot.address ? `, ${r.spot.address}` : ''}</small>
                  </span>
                </>
              ) : (
                <>
                  <span className="search-pin"><Icon.Pin size={18} /></span>
                  <span className="search-text">
                    <strong>{r.place.name}</strong>
                    <small>{r.place.detail}</small>
                  </span>
                </>
              )}
            </li>
          ))}
          {results.length === 0 && (
            <li className="search-empty">
              {status === 'loading' ? 'Buscando…' : status === 'error' ? 'No se pudo buscar. Revisa tu conexión y vuelve a probar.' : term.length < 2 ? 'Sigue escribiendo…' : `Nada con “${term}”. Prueba con una ciudad o una calle.`}
            </li>
          )}
        </ul>
      )}
    </div>
  )
}

const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
