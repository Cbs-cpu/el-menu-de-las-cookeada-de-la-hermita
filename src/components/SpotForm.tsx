import { useEffect, useRef, useState, type FormEvent } from 'react'
import { SHELL_COLORS, uid, type ShellColor, type Spot } from '../lib/db'
import { MAX_UPLOAD_MB, mediaFor, saveSpot, useHermita } from '../lib/store'
import { formatCoords } from '../lib/geo'
import { Shell } from './Art'
import { Icon, StarInput, useObjectUrl } from './ui'

interface Props {
  spot?: Spot // si existe, estamos editando
  draft: { lat: number; lng: number; name?: string; address?: string }
  onCancel: () => void
  onSaved: (id: string, isNew: boolean) => void
}

interface Pending {
  key: string
  file: File
  kind: 'image' | 'video'
}


export function SpotForm({ spot, draft, onCancel, onSaved }: Props) {
  const [name, setName] = useState(spot?.name ?? draft.name ?? '')
  const [rating, setRating] = useState(spot?.rating ?? 0)
  const [notes, setNotes] = useState(spot?.notes ?? '')
  const [shell, setShell] = useState<ShellColor>(spot?.shell ?? 'naranja')
  const [pending, setPending] = useState<Pending[]>([])
  const [removed, setRemoved] = useState<Set<string>>(new Set())
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string>()
  const [saving, setSaving] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const nameInput = useRef<HTMLInputElement>(null)

  const { media: allMedia } = useHermita()
  const existing = spot ? mediaFor(allMedia, spot.id) : []
  const kept = existing.filter((m) => !removed.has(m.id))

  useEffect(() => {
    if (!spot) nameInput.current?.focus({ preventScroll: true })
  }, [spot])

  function addFiles(files: FileList | File[]) {
    const next: Pending[] = []
    let skipped = 0
    for (const file of Array.from(files)) {
      const kind = file.type.startsWith('video/') ? 'video' : file.type.startsWith('image/') ? 'image' : null
      if (!kind || file.size > MAX_UPLOAD_MB * 1024 * 1024) {
        skipped++
        continue
      }
      next.push({ key: uid(), file, kind })
    }
    setPending((p) => [...p, ...next])
    setError(skipped ? `${skipped} archivo${skipped > 1 ? 's' : ''} no se añadió: solo fotos o vídeos de hasta ${MAX_UPLOAD_MB} MB.` : undefined)
  }

  async function submit(e?: FormEvent) {
    e?.preventDefault()
    if (!name.trim()) {
      setError('Ponle un nombre a la concha.')
      nameInput.current?.focus()
      return
    }
    setSaving(true)
    const now = Date.now()
    const id = spot?.id ?? uid()
    const record: Spot = {
      id,
      name: name.trim(),
      rating,
      notes: notes.trim(),
      shell,
      lat: draft.lat,
      lng: draft.lng,
      address: draft.address ?? spot?.address,
      createdAt: spot?.createdAt ?? now,
      updatedAt: now,
    }
    try {
      await saveSpot(record, pending, existing.filter((m) => removed.has(m.id)))
      onSaved(id, !spot)
    } catch (err) {
      console.error(err)
      setError('No se pudo guardar. Revisa la conexión y vuelve a probar.')
      setSaving(false)
    }
  }

  return (
    <form
      className="panel-body form"
      onSubmit={submit}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit()
      }}
    >
      <header className="panel-head">
        <button type="button" className="icon-btn" onClick={onCancel} aria-label="Cancelar">
          <Icon.Close size={20} />
        </button>
        <h2>{spot ? 'Editar concha' : 'Nueva concha'}</h2>
      </header>

      <div className="form-scroll">
        <p className="form-place">
          <Icon.Pin size={16} />
          <span>
            {draft.address ?? 'Ubicación elegida en el mapa'}
            <small>{formatCoords(draft.lat, draft.lng)}. Arrastra la concha del mapa para moverla.</small>
          </span>
        </p>

        <label className="field">
          <span className="field-label">Nombre</span>
          <input ref={nameInput} value={name} onChange={(e) => setName(e.target.value)} placeholder="El chiringuito de Paco" maxLength={80} autoComplete="off" />
        </label>

        <div className="field">
          <span className="field-label">Valoración</span>
          <StarInput value={rating} onChange={setRating} />
        </div>

        <label className="field">
          <span className="field-label">Reseña y notas</span>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={5} placeholder="Qué se come, con quién ir, a qué hora hay sitio…" />
        </label>

        <div className="field">
          <span className="field-label">Fotos y vídeos</span>
          <div
            className={`dropzone ${dragging ? 'is-dragging' : ''}`}
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              addFiles(e.dataTransfer.files)
            }}
          >
            <div className="thumbs">
              {kept.map((m) => (
                <Thumb key={m.id} src={m.url} kind={m.kind} onRemove={() => setRemoved((r) => new Set(r).add(m.id))} />
              ))}
              {pending.map((p) => (
                <Thumb key={p.key} blob={p.file} kind={p.kind} onRemove={() => setPending((list) => list.filter((x) => x.key !== p.key))} />
              ))}
              <button type="button" className="thumb-add" onClick={() => fileInput.current?.click()}>
                <Icon.Image size={22} />
                <span>Añadir</span>
              </button>
            </div>
            <input
              ref={fileInput}
              type="file"
              accept="image/*,video/*"
              multiple
              hidden
              onChange={(e) => {
                if (e.target.files) addFiles(e.target.files)
                e.target.value = ''
              }}
            />
          </div>
        </div>

        <fieldset className="field">
          <legend className="field-label">Color de la concha</legend>
          <div className="swatches">
            {(Object.keys(SHELL_COLORS) as ShellColor[]).map((k) => (
              <label key={k} className={`swatch ${shell === k ? 'is-on' : ''}`} title={SHELL_COLORS[k].label}>
                <input type="radio" name="shell" value={k} checked={shell === k} onChange={() => setShell(k)} aria-label={SHELL_COLORS[k].label} />
                <Shell color={SHELL_COLORS[k].hex} size={30} />
              </label>
            ))}
          </div>
        </fieldset>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </div>

      <footer className="panel-foot">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancelar
        </button>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? (pending.length ? 'Subiendo…' : 'Guardando…') : spot ? 'Guardar cambios' : 'Guardar concha'}
        </button>
      </footer>
    </form>
  )
}

function Thumb({ blob, src, kind, onRemove }: { blob?: Blob; src?: string; kind: 'image' | 'video'; onRemove: () => void }) {
  const local = useObjectUrl(blob)
  const url = src ?? local
  return (
    <div className="thumb">
      {url && (kind === 'image' ? <img src={url} alt="" /> : <video src={url} muted playsInline preload="metadata" />)}
      {kind === 'video' && (
        <span className="thumb-play">
          <Icon.Play size={14} />
        </span>
      )}
      <button type="button" className="thumb-remove" onClick={onRemove} aria-label="Quitar archivo">
        <Icon.Close size={14} />
      </button>
    </div>
  )
}
