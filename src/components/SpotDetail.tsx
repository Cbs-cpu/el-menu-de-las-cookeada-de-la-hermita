import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { SHELL_COLORS, type Media, type Spot } from '../lib/db'
import { deleteSpot, mediaFor, useErmita } from '../lib/store'
import { formatCoords } from '../lib/geo'
import { Crab } from './Art'
import { Icon, Stars } from './ui'

interface Props {
  spot: Spot
  onBack: () => void
  onEdit: () => void
  onDeleted: () => void
}

export function SpotDetail({ spot, onBack, onEdit, onDeleted }: Props) {
  const media = mediaFor(useErmita().media, spot.id)
  const [viewer, setViewer] = useState<number | null>(null)
  const [confirming, setConfirming] = useState(false)
  const color = SHELL_COLORS[spot.shell].hex
  const hero = media.find((m) => m.kind === 'image') ?? media[0]

  useEffect(() => {
    if (!confirming) return
    const t = setTimeout(() => setConfirming(false), 4000)
    return () => clearTimeout(t)
  }, [confirming])

  async function remove() {
    if (!confirming) return setConfirming(true)
    try {
      await deleteSpot(spot)
    } catch (err) {
      console.error(err)
      toast('No se pudo eliminar. Revisa la conexión y vuelve a probar.')
      return
    }
    toast('Concha eliminada')
    onDeleted()
  }

  const coords = formatCoords(spot.lat, spot.lng)

  return (
    <div className="panel-body detail">
      <div className="detail-hero" style={{ '--shell': color } as React.CSSProperties}>
        {hero ? <HeroMedia media={hero} onOpen={() => setViewer(media.indexOf(hero))} /> : <Crab color={color} size={120} className="detail-hero-crab" />}
        <button type="button" className="icon-btn icon-btn-float" onClick={onBack} aria-label="Volver a la lista">
          <Icon.Back size={20} />
        </button>
      </div>

      <div className="detail-scroll">
        <h2 className="detail-title">{spot.name}</h2>
        <div className="detail-rating">
          {spot.rating ? (
            <>
              <span className="detail-score">{spot.rating.toFixed(1)}</span>
              <Stars value={spot.rating} size={18} />
            </>
          ) : (
            <span className="muted">Sin valorar todavía</span>
          )}
        </div>

        <div className="detail-actions">
          <a className="action" href={`https://www.google.com/maps/dir/?api=1&destination=${spot.lat},${spot.lng}`} target="_blank" rel="noreferrer">
            <span className="action-icon action-icon-primary"><Icon.Route size={20} /></span>
            Cómo llegar
          </a>
          <button type="button" className="action" onClick={onEdit}>
            <span className="action-icon"><Icon.Edit size={20} /></span>
            Editar
          </button>
          <button
            type="button"
            className="action"
            onClick={async () => {
              await navigator.clipboard?.writeText(coords)
              toast('Coordenadas copiadas')
            }}
          >
            <span className="action-icon"><Icon.Copy size={20} /></span>
            Copiar
          </button>
          <button type="button" className={`action ${confirming ? 'is-danger' : ''}`} onClick={remove}>
            <span className="action-icon"><Icon.Trash size={20} /></span>
            {confirming ? '¿Seguro?' : 'Eliminar'}
          </button>
        </div>

        <ul className="detail-meta">
          <li>
            <Icon.Pin size={18} />
            <span>
              {spot.address ?? 'Sin dirección'}
              <small>{coords}</small>
            </span>
          </li>
        </ul>

        {spot.notes && (
          <section className="detail-section">
            <h3>Reseña</h3>
            <p className="detail-notes">{spot.notes}</p>
          </section>
        )}

        {media.length > 0 && (
          <section className="detail-section">
            <h3>Fotos y vídeos <span className="muted">{media.length}</span></h3>
            <div className="gallery">
              {media.map((m, i) => (
                <GalleryItem key={m.id} media={m} onOpen={() => setViewer(i)} />
              ))}
            </div>
          </section>
        )}

        <p className="detail-stamp muted">
          {spot.author ? `Puesta por ${spot.author} el ` : 'Guardada el '}{new Date(spot.createdAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {viewer !== null && media[viewer] && <Lightbox media={media} index={viewer} onIndex={setViewer} onClose={() => setViewer(null)} />}
    </div>
  )
}

function HeroMedia({ media, onOpen }: { media: Media; onOpen: () => void }) {
  const url = media.url
  return (
    <button type="button" className="detail-hero-media" onClick={onOpen} aria-label="Ver a pantalla completa">
      {url && (media.kind === 'image' ? <img src={url} alt="" /> : <video src={url} muted playsInline preload="metadata" />)}
    </button>
  )
}

function GalleryItem({ media, onOpen }: { media: Media; onOpen: () => void }) {
  const url = media.url
  return (
    <button type="button" className="gallery-item" onClick={onOpen} aria-label={media.kind === 'video' ? 'Ver vídeo' : 'Ver foto'}>
      {url && (media.kind === 'image' ? <img src={url} alt="" loading="lazy" /> : <video src={url} muted playsInline preload="metadata" />)}
      {media.kind === 'video' && (
        <span className="thumb-play">
          <Icon.Play size={16} />
        </span>
      )}
    </button>
  )
}

function Lightbox({ media, index, onIndex, onClose }: { media: Media[]; index: number; onIndex: (i: number) => void; onClose: () => void }) {
  const m = media[index]
  const url = m.url
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') onIndex((index + 1) % media.length)
      if (e.key === 'ArrowLeft') onIndex((index - 1 + media.length) % media.length)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, media.length, onClose, onIndex])

  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label="Visor de fotos y vídeos" onClick={onClose}>
      <div className="lightbox-stage" onClick={(e) => e.stopPropagation()}>
        {url && (m.kind === 'image' ? <img key={m.id} src={url} alt="" /> : <video key={m.id} src={url} controls autoPlay playsInline />)}
      </div>
      <button type="button" className="icon-btn lightbox-close" onClick={onClose} aria-label="Cerrar visor" autoFocus>
        <Icon.Close size={22} />
      </button>
      {media.length > 1 && (
        <>
          <button type="button" className="icon-btn lightbox-nav lightbox-prev" aria-label="Anterior" onClick={(e) => { e.stopPropagation(); onIndex((index - 1 + media.length) % media.length) }}>
            <Icon.Back size={24} />
          </button>
          <button type="button" className="icon-btn lightbox-nav lightbox-next" aria-label="Siguiente" onClick={(e) => { e.stopPropagation(); onIndex((index + 1) % media.length) }}>
            <Icon.Chevron size={24} />
          </button>
          <span className="lightbox-count">{index + 1} / {media.length}</span>
        </>
      )}
    </div>
  )
}
