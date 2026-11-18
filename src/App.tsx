import { useCallback, useEffect, useRef, useState } from 'react'
import { Toaster, toast } from 'sonner'
import { type Spot } from './lib/db'
import { useHermita } from './lib/store'
import { formatCoords, reverseGeocode } from './lib/geo'
import { MapView, type MapHandle, type MapMode } from './components/MapView'
import { SearchBar } from './components/SearchBar'
import { SpotForm } from './components/SpotForm'
import { SpotDetail } from './components/SpotDetail'
import { SpotList } from './components/SpotList'
import { SectionMenu } from './components/SectionMenu'
import { Crab } from './components/Art'
import { Icon } from './components/ui'

type View = { kind: 'none' } | { kind: 'list' } | { kind: 'detail'; id: string } | { kind: 'form'; id?: string }
type Draft = { lat: number; lng: number; name?: string; address?: string }

export default function App() {
  const { spots, status } = useHermita()
  const [view, setView] = useState<View>({ kind: 'none' })
  const [draft, setDraft] = useState<Draft | null>(null)
  const [mode, setMode] = useState<MapMode>('mapa')
  const [menuOpen, setMenuOpen] = useState(false)
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null)
  const [locating, setLocating] = useState(false)
  const map = useRef<MapHandle>(null)
  const geoCtrl = useRef<AbortController | null>(null)

  const selected = view.kind === 'detail' || view.kind === 'form' ? spots.find((s) => s.id === (view as { id?: string }).id) : undefined

  const placeDraft = useCallback((d: Draft, lookup = true) => {
    setDraft(d)
    if (!lookup) return
    geoCtrl.current?.abort()
    const ctrl = new AbortController()
    geoCtrl.current = ctrl
    reverseGeocode(d.lat, d.lng, ctrl.signal).then((address) => {
      if (!ctrl.signal.aborted && address) setDraft((cur) => (cur && cur.lat === d.lat && cur.lng === d.lng ? { ...cur, address } : cur))
    })
  }, [])

  const openSpot = useCallback((s: Spot) => {
    setDraft(null)
    setView({ kind: 'detail', id: s.id })
    map.current?.flyTo(s.lat, s.lng)
  }, [])

  function newAtCenter() {
    const c = map.current!.center()
    placeDraft({ lat: c.lat, lng: c.lng })
    setView({ kind: 'form' })
  }

  function locate() {
    if (!navigator.geolocation) return toast('Este navegador no puede darte la ubicación')
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLocating(false)
        const pos = { lat: p.coords.latitude, lng: p.coords.longitude }
        setUserPos(pos)
        map.current?.flyTo(pos.lat, pos.lng, 15)
      },
      () => {
        setLocating(false)
        toast('No hay permiso para ver tu ubicación', { description: 'Actívalo en los ajustes del navegador para centrar el mapa en ti.' })
      },
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  // Al abrir el formulario, que la concha quede a la vista y no debajo del panel
  const formOpen = view.kind === 'form'
  useEffect(() => {
    if (formOpen && draft) map.current?.panTo(draft.lat, draft.lng)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formOpen])

  // Si el spot seleccionado desaparece, cerrar el panel
  useEffect(() => {
    if (view.kind === 'detail' && spots.length && !spots.find((s) => s.id === view.id)) setView({ kind: 'none' })
  }, [spots, view])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || menuOpen || document.querySelector('.lightbox')) return
      if (view.kind === 'form' && !view.id) setDraft(null)
      if (view.kind !== 'none') setView({ kind: 'none' })
      else setDraft(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [view, menuOpen])

  const panelOpen = view.kind !== 'none'
  const formDraft: Draft | null = view.kind === 'form' ? (draft ?? (selected ? { lat: selected.lat, lng: selected.lng, address: selected.address } : null)) : null

  return (
    <div className="app">
      <MapView
        ref={map}
        spots={spots}
        selectedId={view.kind === 'detail' ? view.id : undefined}
        draft={draft}
        mode={mode}
        userPos={userPos}
        onSelect={(id) => {
          const s = spots.find((x) => x.id === id)
          if (s) openSpot(s)
        }}
        onMapClick={(lat, lng) => {
          if (menuOpen) return
          if (view.kind === 'form') return placeDraft({ ...formDraft!, lat, lng, address: undefined })
          if (view.kind === 'detail') setView({ kind: 'none' })
          placeDraft({ lat, lng })
        }}
        onDraftMove={(lat, lng) => placeDraft({ ...(draft ?? {}), lat, lng, address: undefined })}
      />

      <div className="top-left">
        <SearchBar
          spots={spots}
          near={() => ({ ...(map.current?.center() ?? { lat: 40.4, lng: -3.7 }), zoom: map.current?.zoom() ?? 5 })}
          onMenu={() => setMenuOpen(true)}
          onPickSpot={openSpot}
          onPickPlace={(p) => {
            if (view.kind !== 'form') setView({ kind: 'none' })
            placeDraft({ lat: p.lat, lng: p.lng, name: p.name, address: p.detail ? `${p.name}, ${p.detail}` : p.name }, false)
            map.current?.flyTo(p.lat, p.lng, 16)
          }}
        />
        {!panelOpen && (
          <button type="button" className="chip" onClick={() => setView({ kind: 'list' })}>
            <Icon.List size={16} /> Conchas <span className="chip-count tabular">{spots.length}</span>
          </button>
        )}
        {status !== 'ready' && (
          <p className={`sync-note ${status === 'loading' ? '' : 'is-problem'}`} role="status">
            {status === 'loading' && 'Cargando las conchas de la hermita…'}
            {status === 'error' && 'No se pudieron cargar las conchas. Revisa la conexión y recarga la página.'}
            {status === 'unconfigured' && 'Falta conectar la base de datos: añade VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.'}
          </p>
        )}
      </div>

      <aside className={`panel ${panelOpen ? 'is-open' : ''}`} aria-label="Panel de conchas" inert={!panelOpen}>
        {view.kind === 'list' && <SpotList spots={spots} onPick={openSpot} onClose={() => setView({ kind: 'none' })} onNew={newAtCenter} />}
        {view.kind === 'detail' && selected && (
          <SpotDetail
            key={selected.id}
            spot={selected}
            onBack={() => setView({ kind: 'list' })}
            onEdit={() => {
              setDraft({ lat: selected.lat, lng: selected.lng, address: selected.address })
              setView({ kind: 'form', id: selected.id })
            }}
            onDeleted={() => setView({ kind: 'list' })}
          />
        )}
        {view.kind === 'form' && formDraft && (
          <SpotForm
            key={view.id ?? 'new'}
            spot={selected}
            draft={formDraft}
            onCancel={() => {
              setDraft(null)
              setView(view.id ? { kind: 'detail', id: view.id } : { kind: 'none' })
            }}
            onSaved={(id, isNew) => {
              setDraft(null)
              setView({ kind: 'detail', id })
              toast(isNew ? 'Concha guardada' : 'Cambios guardados', { icon: <Crab size={22} /> })
            }}
          />
        )}
      </aside>

      {draft && view.kind !== 'form' && (
        <div className="draft-card" role="dialog" aria-label="Nueva concha en este punto">
          <Crab size={44} className="draft-card-crab" />
          <div className="draft-card-text">
            <strong>{draft.name ?? '¿Una concha aquí?'}</strong>
            <small>{draft.address ?? formatCoords(draft.lat, draft.lng)}</small>
          </div>
          <button type="button" className="btn btn-primary" onClick={() => setView({ kind: 'form' })}>
            Guardar aquí
          </button>
          <button type="button" className="icon-btn" aria-label="Descartar punto" onClick={() => setDraft(null)}>
            <Icon.Close size={18} />
          </button>
        </div>
      )}

      <div className="controls">
        <button
          type="button"
          className={`layer-btn ${mode === 'satelite' ? 'is-sat' : ''}`}
          onClick={() => setMode((m) => (m === 'mapa' ? 'satelite' : 'mapa'))}
          aria-label={mode === 'mapa' ? 'Ver satélite' : 'Ver mapa'}
        >
          <Icon.Layers size={18} />
          <span>{mode === 'mapa' ? 'Satélite' : 'Mapa'}</span>
        </button>
        <div className="control-stack">
          <button type="button" className="ctrl" onClick={locate} aria-label="Ir a mi ubicación" aria-busy={locating}>
            <Icon.Locate size={20} className={locating ? 'spin' : undefined} />
          </button>
        </div>
        <div className="control-stack">
          <button type="button" className="ctrl" onClick={() => map.current?.zoomBy(1)} aria-label="Acercar">
            <Icon.Plus size={20} />
          </button>
          <button type="button" className="ctrl" onClick={() => map.current?.zoomBy(-1)} aria-label="Alejar">
            <Icon.Minus size={20} />
          </button>
        </div>
      </div>

      {!(draft && view.kind !== 'form') && view.kind !== 'form' && (
        <button type="button" className="fab" onClick={newAtCenter}>
          <Icon.Plus size={20} />
          Nueva concha
        </button>
      )}

      <SectionMenu open={menuOpen} onClose={() => setMenuOpen(false)} count={spots.length} />

      <Toaster
        position="bottom-center"
        theme="dark"
        toastOptions={{ className: 'toast' }}
        offset={24}
      />
    </div>
  )
}
