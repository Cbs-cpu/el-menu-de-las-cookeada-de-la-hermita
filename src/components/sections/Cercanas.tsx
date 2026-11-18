import { useMemo, useState } from 'react'
import type { Spot } from '../../lib/db'
import { distanceKm, formatDistance } from '../../lib/geo'
import { useMyLocation } from '../../lib/location'
import { useErmita } from '../../lib/store'
import { LocationGate, NoSpots, SectionPage, SpotCard } from './shared'

const PRESETS = [1, 5, 10, 25, 50]
type Sort = 'valoracion' | 'distancia'

interface Props {
  onMenu: () => void
  onOpenSpot: (s: Spot) => void
  onMap: () => void
}

export function Cercanas({ onMenu, onOpenSpot, onMap }: Props) {
  return (
    <SectionPage title="Conchas más cercanas" onMenu={onMenu}>
      <LocationGate why="Para encontrar las conchas que tienes cerca, el mapa necesita saber dónde estás.">
        <CercanasList onOpenSpot={onOpenSpot} onMap={onMap} />
      </LocationGate>
    </SectionPage>
  )
}

function CercanasList({ onOpenSpot, onMap }: Omit<Props, 'onMenu'>) {
  const { spots } = useErmita()
  const { pos } = useMyLocation()
  const [radius, setRadius] = useState(5)
  const [sort, setSort] = useState<Sort>('valoracion')

  const withDistance = useMemo(() => spots.map((spot) => ({ spot, km: distanceKm(pos!, spot) })), [spots, pos])
  const results = useMemo(() => {
    const inside = withDistance.filter((x) => x.km <= radius)
    return inside.sort((a, b) =>
      sort === 'valoracion' ? b.spot.rating - a.spot.rating || a.km - b.km : a.km - b.km || b.spot.rating - a.spot.rating,
    )
  }, [withDistance, radius, sort])

  const nearestOutside = useMemo(() => withDistance.filter((x) => x.km > radius).sort((a, b) => a.km - b.km)[0], [withDistance, radius])

  if (spots.length === 0) return <NoSpots title="Todavía no hay conchas" text="Pon la primera en el mapa y aparecerá aquí." onMap={onMap} />

  return (
    <>
      <div className="filter">
        <label className="filter-label" htmlFor="radius">
          Hasta <strong className="tabular">{formatDistance(radius)}</strong> de ti
        </label>
        <input
          id="radius"
          type="range"
          min={0.5}
          max={100}
          step={0.5}
          value={radius}
          onChange={(e) => setRadius(Number(e.target.value))}
          style={{ '--fill': `${((radius - 0.5) / 99.5) * 100}%` } as React.CSSProperties}
        />
        <div className="filter-row">
          <div className="chips" role="group" aria-label="Distancias rápidas">
            {PRESETS.map((km) => (
              <button key={km} type="button" className={`chip-btn ${radius === km ? 'is-on' : ''}`} onClick={() => setRadius(km)}>
                {km} km
              </button>
            ))}
          </div>
          <label className="filter-custom">
            <span className="sr-only">Distancia en km</span>
            <input
              type="number"
              inputMode="decimal"
              min={0.1}
              max={20000}
              step={0.1}
              value={radius}
              onChange={(e) => {
                const v = Number(e.target.value)
                if (v > 0) setRadius(v)
              }}
            />
            <span>km</span>
          </label>
        </div>
      </div>

      <div className="segmented section-sort" role="tablist" aria-label="Ordenar">
        <button type="button" role="tab" aria-selected={sort === 'valoracion'} className={sort === 'valoracion' ? 'is-on' : ''} onClick={() => setSort('valoracion')}>
          Mejor valoradas
        </button>
        <button type="button" role="tab" aria-selected={sort === 'distancia'} className={sort === 'distancia' ? 'is-on' : ''} onClick={() => setSort('distancia')}>
          Más cerca
        </button>
      </div>

      <p className="section-count" role="status">
        {results.length === 0
          ? 'Ninguna concha a esa distancia.'
          : `${results.length} ${results.length === 1 ? 'concha' : 'conchas'} para cookear`}
      </p>

      {results.length === 0 && nearestOutside && (
        <button type="button" className="btn btn-ghost section-widen" onClick={() => setRadius(Math.ceil(nearestOutside.km))}>
          La más cercana está a {formatDistance(nearestOutside.km)}: ampliar hasta ahí
        </button>
      )}

      <ul className="card-list">
        {results.map(({ spot, km }) => (
          <li key={spot.id}>
            <SpotCard spot={spot} distance={km} onOpen={onOpenSpot} />
          </li>
        ))}
      </ul>
    </>
  )
}
