import { useEffect, useState } from 'react'
import { normalizeText, searchPlaces, type Place } from '../../lib/geo'
import { requestLocation, useMyLocation } from '../../lib/location'
import { Icon } from '../ui'

/** Zona sobre la que buscar conchas. */
export type Zone = { kind: 'me' } | { kind: 'place'; name: string; detail: string; lat: number; lng: number } | { kind: 'world' }

export interface ZoneCenter {
  lat: number
  lng: number
  label: string
  /** Para "otra zona": nombre de la ciudad, para incluir también las conchas cuya dirección la mencione. */
  match?: string
}

/** Centro de la zona elegida (o null si es "todo el mundo" o aún no sabemos dónde estás). */
export function useZoneCenter(zone: Zone): ZoneCenter | null {
  const loc = useMyLocation()
  if (zone.kind === 'world') return null
  if (zone.kind === 'place') return { lat: zone.lat, lng: zone.lng, label: zone.name, match: normalizeText(zone.name) }
  return loc.pos ? { ...loc.pos, label: loc.city ?? 'tu zona', match: loc.city ? normalizeText(loc.city) : undefined } : null
}

const RADII = [2, 5, 15, 50, 100]

const STORAGE = 'zona-elegida'
export function loadZone(fallback: Zone): Zone {
  try {
    const z = JSON.parse(localStorage.getItem(STORAGE) ?? 'null') as Zone | null
    return z && ['me', 'place', 'world'].includes(z.kind) ? z : fallback
  } catch {
    return fallback
  }
}
function saveZone(z: Zone) {
  try {
    localStorage.setItem(STORAGE, JSON.stringify(z))
  } catch {
    /* sin almacenamiento */
  }
}

interface Props {
  zone: Zone
  onZone: (z: Zone) => void
  radius: number
  onRadius: (km: number) => void
  allowWorld?: boolean
  title?: string
}

export function ZoneChooser({ zone, onZone, radius, onRadius, allowWorld = true, title = '¿Dónde?' }: Props) {
  const loc = useMyLocation()
  const [editing, setEditing] = useState(false)
  const set = (z: Zone) => {
    saveZone(z)
    onZone(z)
  }

  // Al elegir "cerca de mí", pedir la ubicación si aún no la tenemos
  useEffect(() => {
    if (zone.kind === 'me' && loc.status === 'idle') requestLocation()
  }, [zone.kind, loc.status])

  return (
    <div className="zone">
      <p className="zone-title">{title}</p>
      <div className="segmented zone-modes" role="tablist" aria-label="Zona">
        <button type="button" role="tab" aria-selected={zone.kind === 'me'} className={zone.kind === 'me' ? 'is-on' : ''} onClick={() => set({ kind: 'me' })}>
          Cerca de mí
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={zone.kind === 'place'}
          className={zone.kind === 'place' ? 'is-on' : ''}
          onClick={() => setEditing(true)}
        >
          {zone.kind === 'place' ? zone.name : 'Otra zona'}
        </button>
        {allowWorld && (
          <button
            type="button"
            role="tab"
            aria-selected={zone.kind === 'world'}
            className={zone.kind === 'world' ? 'is-on' : ''}
            onClick={() => set({ kind: 'world' })}
          >
            Todo el mundo
          </button>
        )}
      </div>

      {editing && (
        <PlaceSearch
          onPick={(p) => {
            set({ kind: 'place', name: p.name, detail: p.detail, lat: p.lat, lng: p.lng })
            setEditing(false)
          }}
          onCancel={() => setEditing(false)}
        />
      )}

      {zone.kind === 'me' && loc.status !== 'ok' && (
        <div className="zone-status">
          {loc.status === 'asking' && <span>Buscando dónde estás…</span>}
          {loc.status === 'denied' && <span>No hay permiso para ver tu ubicación. Actívalo en el navegador o elige otra zona.</span>}
          {loc.status === 'unavailable' && <span>No se pudo saber dónde estás. Enciende la ubicación o elige otra zona.</span>}
          {loc.status !== 'asking' && (
            <button type="button" className="btn btn-ghost" onClick={requestLocation}>
              <Icon.Locate size={16} /> Usar mi ubicación
            </button>
          )}
        </div>
      )}

      {zone.kind !== 'world' && (
        <div className="zone-radius">
          <span className="zone-radius-label">
            {zone.kind === 'me' ? (loc.city ? `En ${loc.city} y alrededores,` : 'A tu alrededor,') : `En ${zone.name} y alrededores,`} hasta
          </span>
          <div className="chips" role="group" aria-label="Distancia">
            {RADII.map((km) => (
              <button key={km} type="button" className={`chip-btn ${radius === km ? 'is-on' : ''}`} onClick={() => onRadius(km)}>
                {km} km
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function PlaceSearch({ onPick, onCancel }: { onPick: (p: Place) => void; onCancel: () => void }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Place[]>([])
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')

  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) {
      setResults([])
      return
    }
    const ctrl = new AbortController()
    setStatus('loading')
    const t = setTimeout(() => {
      searchPlaces(term, undefined, ctrl.signal)
        .then((r) => {
          setResults(r)
          setStatus('idle')
        })
        .catch((e) => e.name !== 'AbortError' && setStatus('error'))
    }, 280)
    return () => {
      clearTimeout(t)
      ctrl.abort()
    }
  }, [q])

  return (
    <div className="place-search">
      <div className="place-search-bar">
        <Icon.Search size={18} />
        <input
          autoFocus
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ciudad, barrio o país"
          aria-label="Buscar zona"
          onKeyDown={(e) => {
            if (e.key === 'Escape') onCancel()
            if (e.key === 'Enter' && results[0]) onPick(results[0])
          }}
        />
        <button type="button" className="icon-btn" aria-label="Cancelar" onClick={onCancel}>
          <Icon.Close size={18} />
        </button>
      </div>
      {q.trim().length >= 2 && (
        <ul className="place-results">
          {results.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => onPick(p)}>
                <strong>{p.name}</strong>
                <small>{p.detail}</small>
              </button>
            </li>
          ))}
          {!results.length && (
            <li className="place-empty">
              {status === 'loading' ? 'Buscando…' : status === 'error' ? 'No se pudo buscar. Revisa la conexión.' : 'Sin resultados.'}
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
