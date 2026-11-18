import { useEffect } from 'react'
import { toast } from 'sonner'
import type { AppNotification, Spot } from '../lib/db'
import { isAdminSession, useSession } from '../lib/auth'
import { deleteNotification, markNotificationsRead, resolveSacred, useErmita } from '../lib/store'
import { Crab } from './Art'
import { Icon } from './ui'

export function NotificationsButton({ onOpen }: { onOpen: () => void }) {
  const { notifications } = useErmita()
  const unread = notifications.filter((n) => !n.read).length
  return (
    <button type="button" className="chip bell" onClick={onOpen} aria-label={unread ? `Notificaciones, ${unread} sin leer` : 'Notificaciones'}>
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
      {unread > 0 && <span className="bell-count tabular">{unread > 9 ? '9+' : unread}</span>}
    </button>
  )
}

const ago = (t: number) => {
  const m = Math.round((Date.now() - t) / 60000)
  if (m < 1) return 'ahora'
  if (m < 60) return `hace ${m} min`
  const h = Math.round(m / 60)
  if (h < 24) return `hace ${h} h`
  const d = Math.round(h / 24)
  return d === 1 ? 'ayer' : `hace ${d} días`
}

export function NotificationsPanel({ onClose, onOpenSpot }: { onClose: () => void; onOpenSpot: (s: Spot) => void }) {
  const { notifications, spots, requests, votes } = useErmita()
  const admin = isAdminSession(useSession())

  // Al abrir el panel, lo que se ve cuenta como leído
  useEffect(() => {
    const t = setTimeout(() => markNotificationsRead(notifications.filter((n) => !n.read).map((n) => n.id)), 800)
    return () => clearTimeout(t)
  }, [notifications])

  const reviews = notifications.filter((n) => n.kind === 'sacred_review')
  const rest = notifications.filter((n) => n.kind !== 'sacred_review')

  const item = (n: AppNotification) => {
    const spot = spots.find((s) => s.id === n.spotId)
    const request = requests.find((r) => r.id === n.requestId)
    const count = request ? votes.filter((v) => v.requestId === request.id).length : 0
    return (
      <li key={n.id} className={`notif is-${n.kind} ${n.read ? '' : 'is-unread'}`}>
        <div className="notif-head">
          <strong>{n.title}</strong>
          <span className="notif-time">{ago(n.createdAt)}</span>
        </div>
        <p>{n.body}</p>
        {n.kind === 'sacred_review' && request && (
          <p className="notif-votes tabular">
            {count} {count === 1 ? 'voto' : 'votos'} de la ermita
          </p>
        )}
        <div className="notif-actions">
          {spot && (
            <button type="button" className="btn btn-ghost" onClick={() => onOpenSpot(spot)}>
              Ver concha
            </button>
          )}
          {admin && n.kind === 'sacred_review' && request && (
            <>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() =>
                  resolveSacred(request.id, false).then(
                    () => toast('Petición rechazada'),
                    (e) => toast(e.message),
                  )
                }
              >
                Rechazar
              </button>
              <button
                type="button"
                className="btn btn-sacred"
                onClick={() =>
                  resolveSacred(request.id, true).then(
                    () => toast('Ahora es concha sagrada'),
                    (e) => toast(e.message),
                  )
                }
              >
                Hacer sagrada
              </button>
            </>
          )}
          {n.kind !== 'sacred_review' && (
            <button type="button" className="icon-btn notif-delete" aria-label="Borrar notificación" onClick={() => deleteNotification(n.id)}>
              <Icon.Close size={16} />
            </button>
          )}
        </div>
      </li>
    )
  }

  return (
    <div className="panel-body">
      <header className="panel-head">
        <h2>Notificaciones</h2>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Cerrar notificaciones">
          <Icon.Close size={20} />
        </button>
      </header>
      <div className="notif-scroll">
        {notifications.length === 0 ? (
          <div className="empty">
            <Crab color="#F5C542" size={56} />
            <h3>Nada nuevo por ahora</h3>
            <p>
              {admin
                ? 'Aquí llegarán las peticiones de concha sagrada para revisar.'
                : 'Aquí verás las candidatas a concha sagrada y lo que decidan los ermitaños.'}
            </p>
          </div>
        ) : (
          <>
            {admin && reviews.length > 0 && (
              <>
                <h3 className="notif-group">Para revisar</h3>
                <ul className="notif-list">{reviews.map(item)}</ul>
              </>
            )}
            {rest.length > 0 && (
              <>
                {admin && reviews.length > 0 && <h3 className="notif-group">Otras</h3>}
                <ul className="notif-list">{rest.map(item)}</ul>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
