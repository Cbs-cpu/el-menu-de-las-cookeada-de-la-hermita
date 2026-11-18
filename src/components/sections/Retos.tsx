import { useEffect, useRef, useState } from 'react'
import type { Challenge, Spot } from '../../lib/db'
import { SHELL_COLORS } from '../../lib/db'
import { isAdminSession, useSession } from '../../lib/auth'
import { distanceKm, formatDistance } from '../../lib/geo'
import { requestLocation, useMyLocation } from '../../lib/location'
import { PrepareError, prepareVideo } from '../../lib/media'
import { assignChallenges, submitChallenge, useErmita } from '../../lib/store'
import { ChallengeReview } from '../ChallengeReview'
import { Crab, Shell } from '../Art'
import { Icon } from '../ui'
import { SacredBadge } from '../Sacred'
import { SectionPage } from './shared'

/** Radio para "tu ciudad" al repartir retos. */
const RETO_RADIUS_KM = 15

/** Fecha de hoy en Madrid (los retos cambian a medianoche de España). */
export const todayMadrid = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date())

interface Props {
  onMenu: () => void
  onOpenSpot: (s: Spot) => void
  onRanking: () => void
}

export function Retos({ onMenu, onOpenSpot, onRanking }: Props) {
  const session = useSession()
  const me = session?.user.id
  const admin = isAdminSession(session)
  const { challenges, spots, status } = useErmita()
  const loc = useMyLocation()
  const [assigning, setAssigning] = useState<'idle' | 'busy' | 'error'>('idle')
  const asked = useRef<string>('')

  const today = todayMadrid()
  const mine = challenges.filter((c) => c.userId === me)
  const todays = mine.filter((c) => c.day === today).sort((a, b) => a.slot - b.slot)
  const past = mine.filter((c) => c.day !== today && c.status !== 'assigned').slice(0, 10)
  const points = mine.reduce((sum, c) => sum + (c.status === 'approved' ? c.points : 0), 0)
  const toReview = admin ? challenges.filter((c) => c.status === 'submitted').sort((a, b) => (a.submittedAt ?? 0) - (b.submittedAt ?? 0)) : []

  // Pedir la ubicación y, con ella, los retos de hoy (una vez por día y sesión)
  useEffect(() => {
    if (loc.status === 'idle') requestLocation()
  }, [loc.status])
  useEffect(() => {
    if (status !== 'ready' || !loc.pos || todays.length >= 2 || asked.current === today) return
    asked.current = today
    setAssigning('busy')
    assignChallenges(loc.pos.lat, loc.pos.lng, RETO_RADIUS_KM).then(
      () => setAssigning('idle'),
      (e) => {
        console.error(e)
        setAssigning('error')
      },
    )
  }, [status, loc.pos, todays.length, today])

  const openSpot = (id: string) => {
    const s = spots.find((x) => x.id === id)
    if (s) onOpenSpot(s)
  }

  return (
    <SectionPage title="Retos diarios" onMenu={onMenu}>
      <div className="retos-score">
        <div>
          <span className="retos-points tabular">{points}</span>
          <span className="retos-points-label">{points === 1 ? 'punto' : 'puntos'}</span>
        </div>
        <button type="button" className="btn btn-ghost" onClick={onRanking}>
          Ver ranking
        </button>
      </div>

      {admin && (
        <section className="retos-block">
          <h2 className="retos-h">
            Vídeos por revisar <span className="muted tabular">{toReview.length}</span>
          </h2>
          {toReview.length ? (
            <div className="creview-list">
              {toReview.map((c) => (
                <ChallengeReview key={c.id} challenge={c} onOpenSpot={openSpot} />
              ))}
            </div>
          ) : (
            <p className="muted">No hay vídeos pendientes. Cuando alguien envíe uno, te llegará también a la campana.</p>
          )}
        </section>
      )}

      <section className="retos-block">
        <h2 className="retos-h">Tus retos de hoy</h2>
        <ol className="retos-how">
          <li>Ve a la concha que te ha tocado.</li>
          <li>Graba un vídeo cookeando y enfocando lo mismo que se ve en la foto.</li>
          <li>Envíalo desde aquí con la ubicación activada.</li>
        </ol>
        <p className="retos-rules">
          Los ermitaños lo revisan y, si está bien, te llevas 10 puntos (20 en conchas sagradas). Los retos cambian cada día a medianoche.
        </p>

        {todays.length ? (
          <ul className="card-list">
            {todays.map((c) => (
              <li key={c.id}>
                <RetoCard challenge={c} onOpenSpot={openSpot} />
              </li>
            ))}
          </ul>
        ) : loc.status === 'denied' || loc.status === 'unavailable' ? (
          <div className="section-empty">
            <Crab color="#3FBFAE" size={64} />
            <h2>Hace falta tu ubicación</h2>
            <p>Los retos se reparten entre las conchas de tu ciudad. Activa la ubicación del navegador para este sitio.</p>
            <button type="button" className="btn btn-primary" onClick={requestLocation}>
              <Icon.Locate size={18} /> Usar mi ubicación
            </button>
          </div>
        ) : assigning === 'busy' || !loc.pos || status !== 'ready' ? (
          <div className="section-empty">
            <Crab size={64} className="crab-walk" />
            <p>El cangrejo está eligiendo tus conchas…</p>
          </div>
        ) : assigning === 'error' ? (
          <div className="section-empty">
            <Crab color="#E5432F" size={64} />
            <h2>No se pudieron repartir los retos</h2>
            <p>Revisa la conexión y vuelve a probar.</p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                asked.current = ''
                setAssigning('idle')
              }}
            >
              Reintentar
            </button>
          </div>
        ) : (
          <div className="section-empty">
            <Crab color="#F2B44C" size={64} />
            <h2>No hay conchas cerca</h2>
            <p>No hay ninguna concha a menos de {RETO_RADIUS_KM} km de ti. Pon alguna en el mapa y mañana tendrás retos.</p>
          </div>
        )}
      </section>

      {past.length > 0 && (
        <section className="retos-block">
          <h2 className="retos-h">Retos anteriores</h2>
          <ul className="retos-history">
            {past.map((c) => {
              const s = spots.find((x) => x.id === c.spotId)
              return (
                <li key={c.id} className={`is-${c.status}`}>
                  <span>
                    <strong>{s?.name ?? 'Concha borrada'}</strong>
                    <small>{new Date(c.day + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}</small>
                  </span>
                  <span className="retos-history-state">
                    {c.status === 'approved' ? `+${c.points}` : c.status === 'rejected' ? 'No cumplido' : 'En revisión'}
                  </span>
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </SectionPage>
  )
}

type Phase =
  | { kind: 'idle' }
  | { kind: 'compressing'; progress: number }
  | { kind: 'locating' }
  | { kind: 'uploading'; progress: number }
  | { kind: 'error'; message: string }

function RetoCard({ challenge, onOpenSpot }: { challenge: Challenge; onOpenSpot: (id: string) => void }) {
  const { spots, media } = useErmita()
  const loc = useMyLocation()
  const spot = spots.find((s) => s.id === challenge.spotId)
  const photo = media.find((m) => m.spotId === challenge.spotId && m.kind === 'image')
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const input = useRef<HTMLInputElement>(null)
  const ctrl = useRef<AbortController | null>(null)
  useEffect(() => () => ctrl.current?.abort(), [])

  if (!spot) return null
  const color = spot.sacred ? '#F5C542' : (SHELL_COLORS[spot.shell]?.hex ?? '#FF6A2B')
  const points = spot.sacred ? 20 : 10
  const km = loc.pos ? distanceKm(loc.pos, spot) : undefined

  async function send(file: File) {
    ctrl.current?.abort()
    const c = new AbortController()
    ctrl.current = c
    try {
      setPhase({ kind: 'compressing', progress: 0 })
      const video = await prepareVideo(file, (progress) => setPhase({ kind: 'compressing', progress }), c.signal)
      setPhase({ kind: 'locating' })
      const where = await currentPosition()
      setPhase({ kind: 'uploading', progress: 0 })
      await submitChallenge(challenge, video, where, file.lastModified || undefined, (progress) => setPhase({ kind: 'uploading', progress }), c.signal)
      setPhase({ kind: 'idle' })
    } catch (e) {
      if (c.signal.aborted) return
      console.error(e)
      setPhase({
        kind: 'error',
        message:
          e instanceof PrepareError ? e.message : e instanceof Error && e.message ? e.message : 'No se pudo enviar. Revisa la conexión y vuelve a probar.',
      })
    }
  }

  const busy = phase.kind === 'compressing' || phase.kind === 'locating' || phase.kind === 'uploading'

  return (
    <article className={`reto is-${challenge.status}`} style={{ '--shell': color } as React.CSSProperties}>
      <div className="reto-photo">
        {photo ? <img src={photo.url} alt={`Lo que tienes que enfocar en ${spot.name}`} /> : <Shell color={color} size={64} />}
        <span className="reto-photo-label">{photo ? 'Enfoca esto en tu vídeo' : 'Esta concha aún no tiene foto'}</span>
        <span className="reto-slot">Reto {challenge.slot}</span>
      </div>
      <div className="reto-body">
        {spot.sacred && <SacredBadge small />}
        <h3>{spot.name}</h3>
        <p className="reto-meta">
          {km !== undefined && <span className="spot-card-distance tabular">a {formatDistance(km)}</span>}
          <span>+{points} puntos</span>
        </p>
        {spot.address && <p className="spot-card-address">{spot.address}</p>}

        {challenge.status === 'assigned' && (
          <>
            {phase.kind === 'idle' && (
              <div className="spot-card-actions">
                <a
                  className="btn btn-ghost"
                  href={`https://www.google.com/maps/dir/?api=1&destination=${spot.lat},${spot.lng}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Icon.Route size={16} /> Cómo llegar
                </a>
                <button type="button" className="btn btn-primary" onClick={() => input.current?.click()}>
                  Grabar y enviar vídeo
                </button>
              </div>
            )}
            {busy && (
              <div className="reto-progress" role="status">
                <span>
                  {phase.kind === 'compressing'
                    ? `Comprimiendo el vídeo… ${Math.round(phase.progress * 100)} %`
                    : phase.kind === 'locating'
                      ? 'Comprobando dónde estás…'
                      : `Enviando a los ermitaños… ${Math.round(phase.progress * 100)} %`}
                </span>
                <span className="media-note-bar">
                  <span style={{ transform: `scaleX(${phase.kind === 'locating' ? 1 : phase.progress})` }} />
                </span>
              </div>
            )}
            {phase.kind === 'error' && (
              <div className="reto-error" role="alert">
                <p>{phase.message}</p>
                <button type="button" className="btn btn-primary" onClick={() => input.current?.click()}>
                  Elegir el vídeo otra vez
                </button>
              </div>
            )}
            <input
              ref={input}
              type="file"
              accept="video/*"
              capture="environment"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (f) send(f)
              }}
            />
            <button type="button" className="link reto-see" onClick={() => onOpenSpot(spot.id)}>
              Ver la concha en el mapa
            </button>
          </>
        )}
        {challenge.status === 'submitted' && (
          <p className="reto-state is-wait">
            Enviado
            {challenge.submittedAt ? ` a las ${new Date(challenge.submittedAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}` : ''}. Los
            ermitaños lo revisarán; te llegará el resultado a la campana.
          </p>
        )}
        {challenge.status === 'approved' && <p className="reto-state is-ok">¡Cumplido! +{challenge.points} puntos</p>}
        {challenge.status === 'rejected' && <p className="reto-state is-bad">Los ermitaños no lo han dado por cumplido.</p>}
      </div>
    </article>
  )
}

/** Ubicación precisa en este momento (o null si no se puede). */
function currentPosition(): Promise<{ lat: number; lng: number; accuracy: number } | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null)
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    )
  })
}
