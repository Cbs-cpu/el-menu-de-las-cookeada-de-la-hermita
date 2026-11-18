import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { Spot } from '../lib/db'
import { currentUserId, isAdminSession, useSession } from '../lib/auth'
import { requestSacred, resolveSacred, setSacred, useErmita, vote, withdrawSacred } from '../lib/store'

export const SACRED_GOLD = '#F5C542'

export function SacredBadge({ small = false }: { small?: boolean }) {
  return (
    <span className={`sacred-badge ${small ? 'is-small' : ''}`}>
      <svg viewBox="0 0 24 24" width={small ? 12 : 14} height={small ? 12 : 14} aria-hidden="true">
        <path d="M12 2l2.4 6.2L21 9l-5 4.6L17.5 21 12 17.6 6.5 21 8 13.6 3 9l6.6-.8z" fill="currentColor" />
      </svg>
      Concha sagrada
    </span>
  )
}

/** Estado de la concha respecto a "sagrada" para quien la está mirando. */
export function useSacredState(spot: Spot) {
  const session = useSession()
  const { requests, votes } = useErmita()
  const me = session?.user.id
  const admin = isAdminSession(session)
  const request = requests.find((r) => r.spotId === spot.id)
  const voteCount = request ? votes.filter((v) => v.requestId === request.id).length : 0
  const voted = !!request && votes.some((v) => v.requestId === request.id && v.userId === me)
  const isOwner = !!me && spot.authorId === me
  const isRequester = !!request && request.requestedBy === me
  return { admin, request, voteCount, voted, isOwner, isRequester }
}

async function run(action: () => Promise<void>, ok: string) {
  try {
    await action()
    toast(ok)
  } catch (e) {
    toast(e instanceof Error ? e.message : 'No se pudo hacer. Vuelve a probar.')
  }
}

/** Menú de los tres puntos de una concha. */
export function SpotMenu({ spot }: { spot: Spot }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const { admin, request, voted, isOwner, isRequester } = useSacredState(spot)

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && (e.stopPropagation(), setOpen(false))
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [open])

  const items: { label: string; action: () => void; danger?: boolean }[] = []
  if (admin) {
    if (request) {
      items.push({ label: 'Aprobar: hacer concha sagrada', action: () => run(() => resolveSacred(request.id, true), 'Ahora es concha sagrada') })
      items.push({ label: 'Rechazar la petición', action: () => run(() => resolveSacred(request.id, false), 'Petición rechazada'), danger: true })
    } else if (spot.sacred) {
      items.push({ label: 'Quitar concha sagrada', action: () => run(() => setSacred(spot.id, false), 'Ya no es concha sagrada'), danger: true })
    } else {
      items.push({ label: 'Hacer concha sagrada', action: () => run(() => setSacred(spot.id, true), 'Ahora es concha sagrada') })
    }
  } else if (!spot.sacred) {
    if (request && isRequester)
      items.push({ label: 'Retirar la petición', action: () => run(() => withdrawSacred(request.id), 'Petición retirada'), danger: true })
    else if (request)
      items.push({
        label: voted ? 'Quitar mi voto' : 'Votar para que sea sagrada',
        action: () => run(() => vote(request.id, !voted), voted ? 'Voto quitado' : 'Voto enviado'),
      })
    else if (isOwner) items.push({ label: 'Pedir que sea concha sagrada', action: () => run(() => requestSacred(spot.id), 'Petición enviada a los ermitaños') })
  }

  const note = !admin && !items.length ? (spot.sacred ? 'Esta concha ya es sagrada.' : 'Solo quien puso la concha puede pedir que sea sagrada.') : undefined

  return (
    <div className="spot-menu" ref={root}>
      <button
        type="button"
        className="icon-btn icon-btn-float spot-menu-btn"
        aria-label="Más opciones"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="5" cy="12" r="2" fill="currentColor" />
          <circle cx="12" cy="12" r="2" fill="currentColor" />
          <circle cx="19" cy="12" r="2" fill="currentColor" />
        </svg>
      </button>
      {open && (
        <div className="spot-menu-list" role="menu">
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              className={`spot-menu-item ${it.danger ? 'is-danger' : ''}`}
              onClick={() => {
                setOpen(false)
                it.action()
              }}
            >
              {it.label}
            </button>
          ))}
          {note && <p className="spot-menu-note">{note}</p>}
        </div>
      )}
    </div>
  )
}

/** Tarjeta de "candidata a concha sagrada" dentro de la ficha. */
export function CandidateCard({ spot }: { spot: Spot }) {
  const { admin, request, voteCount, voted, isRequester } = useSacredState(spot)
  if (!request || spot.sacred) return null
  const me = currentUserId()
  return (
    <section className="candidate" aria-label="Candidata a concha sagrada">
      <div className="candidate-text">
        <strong>Candidata a concha sagrada</strong>
        <span>
          La ha pedido {request.requester || 'su dueño'}.{' '}
          <span className="tabular">
            {voteCount} {voteCount === 1 ? 'voto' : 'votos'}
          </span>
        </span>
      </div>
      {admin ? (
        <div className="candidate-actions">
          <button type="button" className="btn btn-ghost" onClick={() => run(() => resolveSacred(request.id, false), 'Petición rechazada')}>
            Rechazar
          </button>
          <button type="button" className="btn btn-sacred" onClick={() => run(() => resolveSacred(request.id, true), 'Ahora es concha sagrada')}>
            Hacer sagrada
          </button>
        </div>
      ) : isRequester || !me ? (
        <p className="candidate-wait">Los ermitaños la revisarán.</p>
      ) : (
        <button
          type="button"
          className={`btn ${voted ? 'btn-ghost' : 'btn-sacred'}`}
          aria-pressed={voted}
          onClick={() => run(() => vote(request.id, !voted), voted ? 'Voto quitado' : 'Voto enviado')}
        >
          {voted ? 'Quitar mi voto' : 'Votar'}
        </button>
      )}
    </section>
  )
}
