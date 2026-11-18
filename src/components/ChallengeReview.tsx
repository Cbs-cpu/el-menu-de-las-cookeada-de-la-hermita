import { useState } from 'react'
import { toast } from 'sonner'
import type { Challenge } from '../lib/db'
import { formatDistance } from '../lib/geo'
import { resolveChallenge, useErmita } from '../lib/store'
import { Shell } from './Art'
import { SHELL_COLORS } from '../lib/db'

const hora = (t?: number) =>
  t ? new Date(t).toLocaleString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'desconocida'

/** Tarjeta para que los ermitaños revisen el vídeo de un reto: vídeo y foto de la concha juntos, ubicación y horas. */
export function ChallengeReview({ challenge, onOpenSpot }: { challenge: Challenge; onOpenSpot?: (spotId: string) => void }) {
  const { spots, media } = useErmita()
  const spot = spots.find((s) => s.id === challenge.spotId)
  const photo = media.find((m) => m.spotId === challenge.spotId && m.kind === 'image')
  const [busy, setBusy] = useState(false)
  const points = spot?.sacred ? 20 : 10

  async function decide(ok: boolean) {
    setBusy(true)
    try {
      await resolveChallenge(challenge.id, ok)
      toast(ok ? `Reto cumplido: +${points} puntos para ${challenge.username}` : 'Reto marcado como no cumplido')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo guardar. Vuelve a probar.')
      setBusy(false)
    }
  }

  const distance = challenge.distanceM
  const far = distance !== undefined && distance > 150
  const gap = challenge.recordedAt && challenge.submittedAt ? (challenge.submittedAt - challenge.recordedAt) / 60000 : undefined

  return (
    <article className="creview">
      <header className="creview-head">
        <strong>{challenge.username || 'Alguien'}</strong>
        <span>
          en{' '}
          <button type="button" className="link" onClick={() => spot && onOpenSpot?.(spot.id)} disabled={!spot || !onOpenSpot}>
            «{spot?.name ?? 'concha borrada'}»
          </button>
        </span>
      </header>

      <div className="creview-compare">
        <figure>
          {challenge.videoUrl ? <video src={challenge.videoUrl} controls playsInline preload="metadata" /> : <div className="creview-missing">Sin vídeo</div>}
          <figcaption>Su vídeo</figcaption>
        </figure>
        <figure>
          {photo ? (
            <img src={photo.url} alt={`Foto de la concha ${spot?.name ?? ''}`} />
          ) : (
            <div className="creview-missing">
              <Shell color={SHELL_COLORS[spot?.shell ?? 'naranja']?.hex ?? '#FF6A2B'} size={40} />
              La concha no tiene foto
            </div>
          )}
          <figcaption>Foto de la concha</figcaption>
        </figure>
      </div>

      <dl className="creview-facts">
        <div>
          <dt>Ubicación al enviar</dt>
          <dd className={far ? 'is-warn' : distance !== undefined ? 'is-ok' : ''}>
            {distance === undefined ? (
              'No compartió la ubicación'
            ) : (
              <>
                A {formatDistance(distance / 1000)} de la concha
                {challenge.accuracyM ? ` (precisión ±${Math.round(challenge.accuracyM)} m)` : ''}
                {challenge.lat !== undefined && challenge.lng !== undefined && (
                  <>
                    {' · '}
                    <a href={`https://www.google.com/maps?q=${challenge.lat},${challenge.lng}`} target="_blank" rel="noreferrer">
                      ver en el mapa
                    </a>
                  </>
                )}
              </>
            )}
          </dd>
        </div>
        <div>
          <dt>Enviado</dt>
          <dd>{hora(challenge.submittedAt)}</dd>
        </div>
        <div>
          <dt>Grabado</dt>
          <dd className={gap !== undefined && gap > 180 ? 'is-warn' : ''}>
            {hora(challenge.recordedAt)}
            {gap !== undefined && gap > 180 ? ` (${Math.round(gap / 60)} h antes de enviarlo)` : ''}
          </dd>
        </div>
        <div>
          <dt>Reto del día</dt>
          <dd>{new Date(challenge.day + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}</dd>
        </div>
      </dl>

      <div className="creview-actions">
        <button type="button" className="btn btn-ghost creview-no" disabled={busy} onClick={() => decide(false)}>
          No lo ha cumplido
        </button>
        <button type="button" className="btn btn-primary creview-yes" disabled={busy} onClick={() => decide(true)}>
          Sí, cumplido · +{points}
        </button>
      </div>
    </article>
  )
}
