import { useSyncExternalStore } from 'react'
import { supabase } from './supabase'
import { currentUsername } from './auth'
import { db, uid, type Media, type ShellColor, type Spot } from './db'

/*
 * Datos globales de la hermita en Supabase.
 * - Tabla `spots` y tabla `media` (ver supabase/schema.sql).
 * - Fotos y vídeos en el bucket público `media` de Storage.
 * - Realtime: cualquier cambio de otro dispositivo se refleja al momento.
 */

export const isConfigured = true

const BUCKET = 'media'
export const MAX_UPLOAD_MB = 50

interface SpotRow {
  id: string
  name: string
  lat: number
  lng: number
  rating: number
  notes: string
  address: string | null
  shell: string
  author: string | null
  created_at: string
  updated_at: string
}

interface MediaRow {
  id: string
  spot_id: string
  path: string
  kind: 'image' | 'video'
  name: string
  created_at: string
}

const toSpot = (r: SpotRow): Spot => ({
  id: r.id,
  name: r.name,
  lat: r.lat,
  lng: r.lng,
  rating: r.rating,
  notes: r.notes,
  address: r.address ?? undefined,
  shell: r.shell as ShellColor,
  author: r.author ?? undefined,
  createdAt: Date.parse(r.created_at),
  updatedAt: Date.parse(r.updated_at),
})

const toRow = (s: Spot): SpotRow => ({
  id: s.id,
  name: s.name,
  lat: s.lat,
  lng: s.lng,
  rating: s.rating,
  notes: s.notes,
  address: s.address ?? null,
  shell: s.shell,
  author: s.author ?? null,
  created_at: new Date(s.createdAt).toISOString(),
  updated_at: new Date(s.updatedAt).toISOString(),
})

const publicUrl = (path: string) => supabase!.storage.from(BUCKET).getPublicUrl(path).data.publicUrl

const toMedia = (r: MediaRow): Media => ({
  id: r.id,
  spotId: r.spot_id,
  path: r.path,
  url: publicUrl(r.path),
  kind: r.kind,
  name: r.name,
  createdAt: Date.parse(r.created_at),
})

// ───────── Store en memoria compartido por toda la app ─────────

export type Status = 'loading' | 'ready' | 'error' | 'unconfigured' | 'no-schema'

interface State {
  status: Status
  spots: Spot[]
  media: Media[]
}

let state: State = { status: isConfigured ? 'loading' : 'unconfigured', spots: [], media: [] }
const listeners = new Set<() => void>()

function set(patch: Partial<State>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

let started = false
let refreshTimer: ReturnType<typeof setTimeout> | undefined

async function refresh() {
  if (!supabase) return
  const [spots, media] = await Promise.all([
    supabase.from('spots').select('*').order('created_at', { ascending: false }),
    supabase.from('media').select('*').order('created_at', { ascending: true }),
  ])
  if (spots.error || media.error) {
    const err = spots.error ?? media.error
    console.error(err)
    // PGRST205 / 42P01: la tabla no existe → falta ejecutar supabase/schema.sql
    const missing = err?.code === 'PGRST205' || err?.code === '42P01'
    if (state.status === 'loading' || missing) set({ status: missing ? 'no-schema' : 'error' })
    return
  }
  set({ status: 'ready', spots: (spots.data as SpotRow[]).map(toSpot), media: (media.data as MediaRow[]).map(toMedia) })
}

/** Agrupa varias notificaciones de realtime en una sola recarga. */
function scheduleRefresh() {
  clearTimeout(refreshTimer)
  refreshTimer = setTimeout(refresh, 150)
}

let visibilityHooked = false
let channel: ReturnType<NonNullable<typeof supabase>['channel']> | null = null

function start() {
  if (started || !supabase) return
  started = true
  refresh().then(migrateLocal)
  channel = supabase
    .channel('hermita')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'spots' }, scheduleRefresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'media' }, scheduleRefresh)
    .subscribe()
  // Al volver a la pestaña (p. ej. el móvil se despierta), ponerse al día.
  if (visibilityHooked) return
  visibilityHooked = true
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && scheduleRefresh())
}

/** Al cerrar sesión: olvidar los datos y dejar de escuchar cambios. */
export function resetStore() {
  if (channel) supabase.removeChannel(channel)
  channel = null
  started = false
  set({ status: 'loading', spots: [], media: [] })
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  start()
  return () => listeners.delete(cb)
}

export function useHermita() {
  return useSyncExternalStore(subscribe, () => state)
}

export const mediaFor = (all: Media[], spotId: string) => all.filter((m) => m.spotId === spotId)

// ───────── Escrituras ─────────

function extOf(name: string, type: string, kind: 'image' | 'video') {
  const dot = name.lastIndexOf('.')
  const fromName = dot > 0 ? name.slice(dot + 1) : ''
  if (/^[a-z0-9]{1,5}$/i.test(fromName)) return fromName.toLowerCase()
  return type.split('/')[1]?.replace(/[^a-z0-9]/gi, '') || (kind === 'video' ? 'mp4' : 'jpg')
}

async function uploadMedia(spotId: string, files: { blob: Blob; name: string; kind: 'image' | 'video' }[]) {
  const rows: MediaRow[] = []
  const now = Date.now()
  for (const [i, f] of files.entries()) {
    const id = uid()
    const path = `${spotId}/${id}.${extOf(f.name, f.blob.type, f.kind)}`
    const { error } = await supabase!.storage.from(BUCKET).upload(path, f.blob, { contentType: f.blob.type || undefined, upsert: false })
    if (error) throw error
    rows.push({ id, spot_id: spotId, path, kind: f.kind, name: f.name, created_at: new Date(now + i).toISOString() })
  }
  if (rows.length) {
    const { error } = await supabase!.from('media').insert(rows)
    if (error) throw error
  }
}

export async function saveSpot(spot: Spot, newFiles: { file: File; kind: 'image' | 'video' }[], removed: Media[]) {
  if (!supabase) throw new Error('Supabase sin configurar')
  const { error } = await supabase.from('spots').upsert(toRow({ ...spot, author: spot.author ?? currentUsername() }))
  if (error) throw error
  if (removed.length) {
    await supabase.from('media').delete().in('id', removed.map((m) => m.id))
    await supabase.storage.from(BUCKET).remove(removed.map((m) => m.path))
  }
  await uploadMedia(spot.id, newFiles.map((f) => ({ blob: f.file, name: f.file.name, kind: f.kind })))
  await refresh()
}

export async function deleteSpot(spot: Spot) {
  if (!supabase) throw new Error('Supabase sin configurar')
  const paths = mediaFor(state.media, spot.id).map((m) => m.path)
  const { error } = await supabase.from('spots').delete().eq('id', spot.id) // la media se borra en cascada
  if (error) throw error
  if (paths.length) await supabase.storage.from(BUCKET).remove(paths)
  await refresh()
}

// ───────── Migración: conchas guardadas antes solo en este navegador ─────────

let migrating = false
async function migrateLocal() {
  if (!supabase || migrating) return
  migrating = true
  try {
    const local = await db.spots.toArray()
    if (!local.length) return
    const known = new Set(state.spots.map((s) => s.id))
    for (const s of local) {
      if (!known.has(s.id)) {
        const { error } = await supabase.from('spots').upsert(toRow(s))
        if (error) throw error
        const files = await db.media.where('spotId').equals(s.id).sortBy('createdAt')
        await uploadMedia(s.id, files.map((m) => ({ blob: m.blob, name: m.name, kind: m.kind })))
      }
      await db.transaction('rw', db.spots, db.media, async () => {
        await db.media.where('spotId').equals(s.id).delete()
        await db.spots.delete(s.id)
      })
    }
    await refresh()
  } catch (e) {
    console.error('No se pudieron subir las conchas locales', e)
  } finally {
    migrating = false
  }
}
