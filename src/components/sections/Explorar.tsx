import { useMemo, useState } from 'react'
import { SPOT_TAGS, type Spot, type SpotTag } from '../../lib/db'
import { distanceKm, normalizeText } from '../../lib/geo'
import { useErmita } from '../../lib/store'
import { NoSpots, SectionPage, SpotCard } from './shared'
import { loadZone, useZoneCenter, ZoneChooser, type Zone } from './ZoneChooser'

type Sort = 'renta' | 'valoradas' | 'cerca' | 'resenas' | 'recientes'

const SORTS: { id: Sort; label: string; needsCenter?: boolean }[] = [
  { id: 'renta', label: 'Lo que más renta', needsCenter: true },
  { id: 'valoradas', label: 'Mejor valoradas' },
  { id: 'cerca', label: 'Más cerca', needsCenter: true },
  { id: 'resenas', label: 'Más reseñas' },
  { id: 'recientes', label: 'Más recientes' },
]

const MIN_RATINGS = [0, 3, 4, 4.5]

/**
 * "Lo que más renta": valoración penalizada por la distancia. Una concha de 4,5 a 1 km
 * renta más que una de 5 a 30 km. Las que no tienen valoración cuentan como 2,5.
 */
const renta = (rating: number, km: number) => (rating || 2.5) - 1.5 * Math.log10(1 + km)

interface Props {
  onMenu: () => void
  onOpenSpot: (s: Spot) => void
  onMap: () => void
}

export function Explorar({ onMenu, onOpenSpot, onMap }: Props) {
  const { spots, media } = useErmita()
  const [zone, setZone] = useState<Zone>(() => loadZone({ kind: 'me' }))
  const [radius, setRadius] = useState(15)
  const [sort, setSort] = useState<Sort>('renta')
  const [minRating, setMinRating] = useState(0)
  const [tags, setTags] = useState<SpotTag[]>([])
  const [onlySacred, setOnlySacred] = useState(false)
  const [withPhotos, setWithPhotos] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const center = useZoneCenter(zone)

  const effectiveSort: Sort = !center && SORTS.find((s) => s.id === sort)?.needsCenter ? 'valoradas' : sort
  const activeFilters = (minRating ? 1 : 0) + tags.length + (onlySacred ? 1 : 0) + (withPhotos ? 1 : 0)

  const results = useMemo(() => {
    const photoSpots = new Set(media.filter((m) => m.kind === 'image').map((m) => m.spotId))
    const list = spots
      .map((spot) => ({ spot, km: center ? distanceKm(center, spot) : undefined }))
      .filter(({ spot, km }) => {
        if (zone.kind !== 'world' && !center) return false // aún sin ubicación
        if (center && km !== undefined) {
          const inAddress = !!center.match && !!spot.address && normalizeText(spot.address).includes(center.match)
          if (km > radius && !(zone.kind === 'place' && inAddress)) return false
        }
        if (minRating && spot.rating < minRating) return false
        if (onlySacred && !spot.sacred) return false
        if (withPhotos && !photoSpots.has(spot.id)) return false
        if (tags.length && !tags.every((t) => spot.tags?.includes(t))) return false
        return true
      })
    const by: Record<Sort, (a: (typeof list)[0], b: (typeof list)[0]) => number> = {
      renta: (a, b) => renta(b.spot.rating, b.km ?? 0) - renta(a.spot.rating, a.km ?? 0),
      valoradas: (a, b) => b.spot.rating - a.spot.rating || (b.spot.reviewCount ?? 0) - (a.spot.reviewCount ?? 0) || (a.km ?? 0) - (b.km ?? 0),
      cerca: (a, b) => (a.km ?? 0) - (b.km ?? 0),
      resenas: (a, b) => (b.spot.reviewCount ?? 0) - (a.spot.reviewCount ?? 0) || b.spot.rating - a.spot.rating,
      recientes: (a, b) => b.spot.createdAt - a.spot.createdAt,
    }
    return list.sort(by[effectiveSort])
  }, [spots, media, center, zone.kind, radius, minRating, onlySacred, withPhotos, tags, effectiveSort])

  if (spots.length === 0)
    return (
      <SectionPage title="Explorar conchas" onMenu={onMenu}>
        <NoSpots title="Todavía no hay conchas" text="Pon la primera en el mapa y aparecerá aquí." onMap={onMap} />
      </SectionPage>
    )

  const toggleTag = (t: SpotTag) => setTags((list) => (list.includes(t) ? list.filter((x) => x !== t) : [...list, t]))

  return (
    <SectionPage title="Explorar conchas" onMenu={onMenu}>
      <div className="filter explore-filters">
        <ZoneChooser zone={zone} onZone={setZone} radius={radius} onRadius={setRadius} />

        <div className="explore-row">
          <label className="explore-sort">
            <span>Ordenar por</span>
            <select value={effectiveSort} onChange={(e) => setSort(e.target.value as Sort)}>
              {SORTS.map((s) => (
                <option key={s.id} value={s.id} disabled={s.needsCenter && !center}>
                  {s.label}
                  {s.needsCenter && !center ? ' (elige una zona)' : ''}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className={`chip-btn ${moreOpen || activeFilters ? 'is-on' : ''}`}
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen((o) => !o)}
          >
            Filtros{activeFilters ? ` · ${activeFilters}` : ''}
          </button>
        </div>
        {effectiveSort === 'renta' && <p className="explore-hint">Mezcla la valoración con lo cerca que está: arriba, lo que más merece la pena el paseo.</p>}

        {moreOpen && (
          <div className="explore-more">
            <div className="explore-group">
              <span className="explore-label">Valoración mínima</span>
              <div className="chips" role="group" aria-label="Valoración mínima">
                {MIN_RATINGS.map((r) => (
                  <button key={r} type="button" className={`chip-btn ${minRating === r ? 'is-on' : ''}`} onClick={() => setMinRating(r)}>
                    {r ? `${r.toLocaleString('es-ES')}★ o más` : 'Todas'}
                  </button>
                ))}
              </div>
            </div>
            <div className="explore-group">
              <span className="explore-label">Características</span>
              <div className="chips is-wrap" role="group" aria-label="Características">
                <button
                  type="button"
                  className={`chip-btn is-gold ${onlySacred ? 'is-on' : ''}`}
                  aria-pressed={onlySacred}
                  onClick={() => setOnlySacred((v) => !v)}
                >
                  ★ Sagradas
                </button>
                <button type="button" className={`chip-btn ${withPhotos ? 'is-on' : ''}`} aria-pressed={withPhotos} onClick={() => setWithPhotos((v) => !v)}>
                  Con fotos
                </button>
                {(Object.keys(SPOT_TAGS) as SpotTag[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    className={`chip-btn ${tags.includes(t) ? 'is-on' : ''}`}
                    aria-pressed={tags.includes(t)}
                    onClick={() => toggleTag(t)}
                  >
                    {SPOT_TAGS[t]}
                  </button>
                ))}
              </div>
            </div>
            {activeFilters > 0 && (
              <button
                type="button"
                className="star-clear"
                onClick={() => {
                  setMinRating(0)
                  setTags([])
                  setOnlySacred(false)
                  setWithPhotos(false)
                }}
              >
                Quitar filtros
              </button>
            )}
          </div>
        )}
      </div>

      <p className="section-count" role="status">
        {zone.kind === 'me' && !center
          ? 'Esperando tu ubicación…'
          : results.length === 0
            ? 'Ninguna concha con estos filtros. Prueba a ampliar la distancia o quitar filtros.'
            : `${results.length} ${results.length === 1 ? 'concha' : 'conchas'} para cookear`}
      </p>

      <ul className="card-list">
        {results.map(({ spot, km }) => (
          <li key={spot.id}>
            <SpotCard spot={spot} distance={km} onOpen={onOpenSpot} />
          </li>
        ))}
      </ul>
    </SectionPage>
  )
}
