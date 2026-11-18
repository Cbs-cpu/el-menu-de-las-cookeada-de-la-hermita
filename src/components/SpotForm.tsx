import { useEffect, useRef, useState, type FormEvent } from 'react'
import { SHELL_COLORS, uid, type ShellColor, type Spot } from '../lib/db'
import { mediaFor, refreshNow, saveSpotRecord, uploadSpotFile, useErmita } from '../lib/store'
import { formatMB, PrepareError, prepareImage, prepareVideo, type Prepared } from '../lib/media'
import { formatCoords } from '../lib/geo'
import { Shell } from './Art'
import { Icon, StarInput, useObjectUrl } from './ui'

interface Props {
  spot?: Spot // si existe, estamos editando
  draft: { lat: number; lng: number; name?: string; address?: string }
  onCancel: () => void
  onSaved: (id: string, isNew: boolean) => void
}

type Stage = 'preparing' | 'ready' | 'uploading' | 'done' | 'failed' | 'rejected'

/** Archivo nuevo: se prepara (comprime) al elegirlo y se sube al guardar. */
interface Pending {
  key: string
  file: File
  kind: 'image' | 'video'
  stage: Stage
  progress: number // 0–1 de la fase actual
  prepared?: Prepared
  estimate?: number // bytes aproximados tras comprimir
  message?: string // motivo si se rechaza
  ctrl: AbortController
}

const pct = (f: number) => `${Math.round(f * 100)} %`

/** Texto de estado de cada archivo, para que se sepa siempre qué está pasando. */
function describe(p: Pending) {
  switch (p.stage) {
    case 'preparing':
      if (p.kind === 'image') return 'Preparando la foto…'
      return p.estimate !== undefined
        ? `Comprimiendo… ${pct(p.progress)} · ${formatMB(p.file.size)} → unos ${formatMB(p.estimate)}`
        : `Revisando el vídeo (${formatMB(p.file.size)})…`
    case 'ready':
      return p.prepared!.compressed
        ? `Listo para subir: ${formatMB(p.prepared!.originalSize)} → ${formatMB(p.prepared!.blob.size)}`
        : `Listo para subir: ${formatMB(p.prepared!.blob.size)}`
    case 'uploading':
      return `Subiendo… ${pct(p.progress)} de ${formatMB(p.prepared!.blob.size)}`
    case 'done':
      return 'Subido'
    case 'failed':
      return 'No se pudo subir. Pulsa «Guardar» otra vez y seguirá por donde iba.'
    case 'rejected':
      return p.message ?? 'No se puede subir este archivo.'
  }
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
  const [id] = useState(() => spot?.id ?? uid()) // fijo: si falla una subida, reintentar usa la misma concha
  const [createdAt] = useState(() => spot?.createdAt ?? Date.now())
  const fileInput = useRef<HTMLInputElement>(null)
  const nameInput = useRef<HTMLInputElement>(null)

  const { media: allMedia } = useErmita()
  const existing = spot ? mediaFor(allMedia, spot.id) : []
  const kept = existing.filter((m) => !removed.has(m.id))

  useEffect(() => {
    if (!spot) nameInput.current?.focus({ preventScroll: true })
  }, [spot])

  // Avisar si se intenta cerrar la página con una subida a medias
  useEffect(() => {
    if (!saving) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [saving])

  // Al salir del formulario, cancelar compresiones y subidas en curso
  const pendingRef = useRef(pending)
  pendingRef.current = pending
  useEffect(() => () => pendingRef.current.forEach((p) => p.ctrl.abort()), [])

  const patch = (key: string, change: Partial<Pending>) => setPending((list) => list.map((p) => (p.key === key ? { ...p, ...change } : p)))

  function addFiles(files: FileList | File[]) {
    let skipped = 0
    for (const file of Array.from(files)) {
      const kind = file.type.startsWith('video/') ? 'video' : file.type.startsWith('image/') ? 'image' : null
      if (!kind) {
        skipped++
        continue
      }
      const item: Pending = { key: uid(), file, kind, stage: 'preparing', progress: 0, ctrl: new AbortController() }
      setPending((list) => [...list, item])
      const job =
        kind === 'video'
          ? prepareVideo(file, (progress) => patch(item.key, { progress }), item.ctrl.signal, ({ estimatedBytes }) => patch(item.key, { estimate: estimatedBytes }))
          : prepareImage(file)
      job
        .then((prepared) => patch(item.key, { stage: 'ready', prepared, progress: 1 }))
        .catch((e) => {
          if (item.ctrl.signal.aborted) return
          if (!(e instanceof PrepareError)) console.error(e)
          patch(item.key, { stage: 'rejected', message: e instanceof PrepareError ? e.message : 'No se ha podido preparar este archivo.' })
        })
    }
    setError(skipped ? `${skipped} archivo${skipped > 1 ? 's' : ''} no se añadió: solo se pueden subir fotos y vídeos.` : undefined)
  }

  function removePending(p: Pending) {
    p.ctrl.abort()
    setPending((list) => list.filter((x) => x.key !== p.key))
  }

  async function submit(e?: FormEvent) {
    e?.preventDefault()
    if (!name.trim()) {
      setError('Ponle un nombre a la concha.')
      nameInput.current?.focus()
      return
    }
    if (pending.some((p) => p.stage === 'preparing')) {
      setError('Espera a que terminen de prepararse las fotos y vídeos.')
      return
    }
    setSaving(true)
    setError(undefined)
    const record: Spot = {
      id,
      name: name.trim(),
      rating,
      notes: notes.trim(),
      shell,
      lat: draft.lat,
      lng: draft.lng,
      address: draft.address ?? spot?.address,
      author: spot?.author,
      createdAt,
      updatedAt: Date.now(),
    }
    try {
      await saveSpotRecord(record, existing.filter((m) => removed.has(m.id)))
    } catch (err) {
      console.error(err)
      setError('No se pudo guardar la concha. Revisa la conexión y vuelve a probar.')
      setSaving(false)
      return
    }

    // Subir uno a uno lo que esté listo (o lo que falló antes)
    let failed = 0
    for (const p of pendingRef.current.filter((x) => x.stage === 'ready' || x.stage === 'failed')) {
      if (p.ctrl.signal.aborted) continue
      patch(p.key, { stage: 'uploading', progress: 0 })
      try {
        await uploadSpotFile(id, { blob: p.prepared!.blob, name: p.prepared!.name, kind: p.kind }, (progress) => patch(p.key, { progress }), p.ctrl.signal)
        patch(p.key, { stage: 'done', progress: 1 })
      } catch (err) {
        if (p.ctrl.signal.aborted) continue
        console.error(err)
        failed++
        patch(p.key, { stage: 'failed' })
      }
    }
    await refreshNow()

    if (failed) {
      setError(
        `La concha está guardada, pero ${failed === 1 ? 'un archivo no se pudo subir' : `${failed} archivos no se pudieron subir`}. Revisa la conexión y pulsa «Guardar» otra vez: seguirá por donde iba.`,
      )
      setSaving(false)
      return
    }
    onSaved(id, !spot)
  }

  const preparing = pending.some((p) => p.stage === 'preparing')
  const uploads = pending.filter((p) => p.stage === 'uploading' || p.stage === 'done')
  const uploadProgress = uploads.length ? uploads.reduce((a, p) => a + p.progress, 0) / uploads.length : 0
  const mediaNotes = pending.filter((p) => p.kind === 'video' || p.stage === 'rejected' || p.stage === 'failed' || p.stage === 'uploading')

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
                <Thumb key={p.key} blob={p.prepared?.blob ?? p.file} kind={p.kind} pending={p} onRemove={() => removePending(p)} />
              ))}
              <button type="button" className="thumb-add" onClick={() => fileInput.current?.click()}>
                <Icon.Image size={22} />
                <span>Añadir</span>
              </button>
            </div>
            {mediaNotes.length > 0 && (
              <ul className="media-notes" aria-live="polite">
                {mediaNotes.map((p) => (
                  <li key={p.key} className={`media-note is-${p.stage}`}>
                    <span className="media-note-name">{p.prepared?.name ?? p.file.name}</span>
                    <span className="media-note-text">{describe(p)}</span>
                    {(p.stage === 'uploading' || (p.stage === 'preparing' && p.estimate !== undefined)) && (
                      <span className="media-note-bar" aria-hidden="true">
                        <span style={{ transform: `scaleX(${p.progress})` }} />
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <p className="media-hint">Los vídeos se comprimen en tu móvil antes de subirse (máximo 3 minutos).</p>
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
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => {
            pending.forEach((p) => p.ctrl.abort())
            onCancel()
          }}
        >
          Cancelar
        </button>
        <button type="submit" className="btn btn-primary" disabled={saving || preparing}>
          {saving
            ? uploads.length
              ? `Subiendo… ${pct(uploadProgress)}`
              : 'Guardando…'
            : preparing
              ? 'Preparando archivos…'
              : spot
                ? 'Guardar cambios'
                : 'Guardar concha'}
        </button>
      </footer>
    </form>
  )
}

function Thumb({ blob, src, kind, pending, onRemove }: { blob?: Blob; src?: string; kind: 'image' | 'video'; pending?: Pending; onRemove: () => void }) {
  const local = useObjectUrl(blob)
  const url = src ?? local
  const stage = pending?.stage
  const busy = stage === 'preparing' || stage === 'uploading'
  return (
    <div className={`thumb ${stage ? `is-${stage}` : ''}`}>
      {url && (kind === 'image' ? <img src={url} alt="" /> : <video src={url} muted playsInline preload="metadata" />)}
      {kind === 'video' && !busy && stage !== 'rejected' && stage !== 'failed' && (
        <span className="thumb-play">
          <Icon.Play size={14} />
        </span>
      )}
      {busy && (
        <span className="thumb-overlay" aria-hidden="true">
          <span className="thumb-pct tabular">{stage === 'preparing' && kind === 'image' ? '…' : pct(pending!.progress)}</span>
        </span>
      )}
      {(stage === 'rejected' || stage === 'failed') && (
        <span className="thumb-overlay is-bad" aria-hidden="true">
          !
        </span>
      )}
      <button type="button" className="thumb-remove" onClick={onRemove} aria-label="Quitar archivo">
        <Icon.Close size={14} />
      </button>
    </div>
  )
}
