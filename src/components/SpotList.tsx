import { useMemo, useState } from 'react'
import { SHELL_COLORS, type Spot } from '../lib/db'
import { useErmita } from '../lib/store'
import { Crab, Shell } from './Art'
import { Icon, Stars } from './ui'
import { SacredBadge } from './Sacred'

interface Props {
  spots: Spot[]
  onPick: (s: Spot) => void
  onClose: () => void
  onNew: () => void
}

type Sort = 'recientes' | 'valoradas'

export function SpotList({ spots, onPick, onClose, onNew }: Props) {
  const [sort, setSort] = useState<Sort>('recientes')
  const sorted = useMemo(
    () => [...spots].sort((a, b) => (sort === 'recientes' ? b.createdAt - a.createdAt : b.rating - a.rating || b.createdAt - a.createdAt)),
    [spots, sort],
  )

  return (
    <div className="panel-body">
      <header className="panel-head">
        <h2>
          Conchas de la ermita <span className="muted tabular">{spots.length}</span>
        </h2>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Cerrar lista">
          <Icon.Close size={20} />
        </button>
      </header>

      {spots.length > 0 ? (
        <>
          <div className="segmented" role="tablist" aria-label="Ordenar">
            {(['recientes', 'valoradas'] as Sort[]).map((s) => (
              <button key={s} type="button" role="tab" aria-selected={sort === s} className={sort === s ? 'is-on' : ''} onClick={() => setSort(s)}>
                {s === 'recientes' ? 'Más recientes' : 'Mejor valoradas'}
              </button>
            ))}
          </div>
          <ul className="spot-list">
            {sorted.map((s) => (
              <li key={s.id}>
                <SpotRow spot={s} onClick={() => onPick(s)} />
              </li>
            ))}
          </ul>
        </>
      ) : (
        <div className="empty">
          <div className="empty-beach" aria-hidden="true">
            <Crab color="#FF6A2B" size={64} className="crab-walk" />
            <Crab color="#3FBFAE" size={40} className="crab-walk crab-walk-slow" />
          </div>
          <h3>Todavía no hay conchas</h3>
          <p>Toca cualquier punto del mapa para guardar tu primer spot, con su reseña, sus estrellas y sus fotos.</p>
          <button type="button" className="btn btn-primary" onClick={onNew}>
            <Icon.Plus size={18} /> Nueva concha aquí
          </button>
        </div>
      )}
    </div>
  )
}

function SpotRow({ spot, onClick }: { spot: Spot; onClick: () => void }) {
  const { media } = useErmita()
  const url = media.find((m) => m.spotId === spot.id && m.kind === 'image')?.url
  const color = SHELL_COLORS[spot.shell].hex
  return (
    <button type="button" className="spot-row" onClick={onClick}>
      <span className="spot-row-text">
        {spot.sacred && <SacredBadge small />}
        <strong>{spot.name}</strong>
        <span className="spot-row-rating">
          {spot.rating ? (
            <>
              <span className="tabular">{spot.rating.toFixed(1)}</span> <Stars value={spot.rating} size={13} />
            </>
          ) : (
            <span className="muted">Sin valorar</span>
          )}
        </span>
        {spot.address && <small>{spot.address}</small>}
        {spot.notes && <span className="spot-row-notes">{spot.notes}</span>}
      </span>
      <span className="spot-row-cover" style={{ '--shell': color } as React.CSSProperties}>
        {url ? <img src={url} alt="" /> : <Shell color={color} size={40} />}
      </span>
    </button>
  )
}
