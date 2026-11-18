import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import type { Review, Spot } from '../lib/db'
import { isAdminSession, useSession } from '../lib/auth'
import { deleteReview, saveReview, useErmita } from '../lib/store'
import { formatRating, StarInput, Stars } from './ui'

type Filter = 'todas' | 'buenas' | 'malas'
type Sort = 'recientes' | 'mejores' | 'peores'

/** Buenas: 3,5 o más. Malas: 2,5 o menos. */
const isGood = (r: Review) => r.rating >= 3.5
const isBad = (r: Review) => r.rating <= 2.5

const fecha = (t: number) => new Date(t).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })

/** Reseñas de una concha: ocultas hasta que se pulsa, con filtro y para escribir la mía. */
export function Reviews({ spot }: { spot: Spot }) {
  const session = useSession()
  const me = session?.user.id
  const admin = isAdminSession(session)
  const { reviews } = useErmita()
  const all = useMemo(() => reviews.filter((r) => r.spotId === spot.id), [reviews, spot.id])
  const mine = all.find((r) => r.userId === me)

  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState<Filter>('todas')
  const [sort, setSort] = useState<Sort>('recientes')
  const [writing, setWriting] = useState(false)

  const good = all.filter(isGood).length
  const bad = all.filter(isBad).length
  const shown = all
    .filter((r) => (filter === 'buenas' ? isGood(r) : filter === 'malas' ? isBad(r) : true))
    .sort((a, b) => (sort === 'mejores' ? b.rating - a.rating : sort === 'peores' ? a.rating - b.rating : 0) || b.updatedAt - a.updatedAt)

  return (
    <section className="detail-section reviews">
      <button type="button" className="reviews-toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span>
          <strong>Reseñas</strong> <span className="muted tabular">{all.length}</span>
        </span>
        <span className="reviews-toggle-hint">{open ? 'Ocultar' : all.length ? 'Ver reseñas' : 'Escribir la primera'}</span>
      </button>

      {open && (
        <div className="reviews-body">
          {all.length > 0 && (
            <div className="reviews-controls">
              <div className="segmented reviews-filter" role="tablist" aria-label="Filtrar reseñas">
                {(
                  [
                    ['todas', `Todas ${all.length}`],
                    ['buenas', `Buenas ${good}`],
                    ['malas', `Malas ${bad}`],
                  ] as [Filter, string][]
                ).map(([f, label]) => (
                  <button key={f} type="button" role="tab" aria-selected={filter === f} className={filter === f ? 'is-on' : ''} onClick={() => setFilter(f)}>
                    {label}
                  </button>
                ))}
              </div>
              <label className="reviews-sort">
                <span className="sr-only">Ordenar reseñas</span>
                <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                  <option value="recientes">Más recientes</option>
                  <option value="mejores">Mejor valoradas</option>
                  <option value="peores">Peor valoradas</option>
                </select>
              </label>
            </div>
          )}

          {writing || (!mine && all.length === 0) ? (
            <ReviewEditor spotId={spot.id} initial={mine} onDone={() => setWriting(false)} />
          ) : (
            <button type="button" className="btn btn-ghost reviews-write" onClick={() => setWriting(true)}>
              {mine ? 'Editar mi reseña' : 'Escribir mi reseña'}
            </button>
          )}

          <ul className="review-list">
            {shown.map((r) => (
              <li key={r.id} className={`review ${r.userId === me ? 'is-mine' : ''}`}>
                <div className="review-head">
                  <span className="review-avatar" aria-hidden="true">
                    {(r.username || '?').charAt(0).toUpperCase()}
                  </span>
                  <span className="review-who">
                    <strong>{r.username || 'Alguien'}</strong>
                    {r.userId === me && <span className="review-you">tú</span>}
                    <small>{fecha(r.updatedAt)}</small>
                  </span>
                  <span className="review-score">
                    <span className="tabular">{formatRating(r.rating)}</span>
                    <Stars value={r.rating} size={13} />
                  </span>
                </div>
                {r.body && <p className="review-text">{r.body}</p>}
                {(r.userId === me || admin) && (
                  <button
                    type="button"
                    className="review-delete"
                    onClick={() =>
                      deleteReview(r.id).then(
                        () => toast('Reseña borrada'),
                        (e) => toast(e.message),
                      )
                    }
                  >
                    Borrar
                  </button>
                )}
              </li>
            ))}
          </ul>
          {all.length > 0 && shown.length === 0 && (
            <p className="muted reviews-empty">{filter === 'buenas' ? 'Todavía no hay reseñas buenas.' : 'Ninguna reseña mala por ahora.'}</p>
          )}
        </div>
      )}
    </section>
  )
}

function ReviewEditor({ spotId, initial, onDone }: { spotId: string; initial?: Review; onDone: () => void }) {
  const [rating, setRating] = useState(initial?.rating ?? 0)
  const [body, setBody] = useState(initial?.body ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()

  async function save() {
    if (!rating) return setError('Ponle estrellas a la concha.')
    setSaving(true)
    try {
      await saveReview(spotId, rating, body)
      toast(initial ? 'Reseña actualizada' : 'Reseña publicada')
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar. Vuelve a probar.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="review-editor">
      <StarInput value={rating} onChange={setRating} size={28} />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        maxLength={3000}
        placeholder="Qué tal se cookea aquí: ambiente, vistas, gente, a qué hora ir…"
        onKeyDown={(e) => e.key === 'Enter' && (e.metaKey || e.ctrlKey) && save()}
      />
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="review-editor-actions">
        <button type="button" className="btn btn-ghost" onClick={onDone}>
          Cancelar
        </button>
        <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? 'Publicando…' : initial ? 'Guardar reseña' : 'Publicar reseña'}
        </button>
      </div>
    </div>
  )
}
