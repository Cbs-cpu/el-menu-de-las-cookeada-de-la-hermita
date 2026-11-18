import { useSyncExternalStore } from 'react'
import * as tus from 'tus-js-client'
import { supabase, SUPABASE_KEY, SUPABASE_URL } from './supabase'
import { currentUsername, isAdmin } from './auth'
import { db, uid, type AppNotification, type Challenge, type RankingRow, type Review, type SpotTag, type Media, type NotificationKind, type SacredRequest, type SacredVote, type ShellColor, type Spot } from './db'

/*
 * Datos globales de la ermita en Supabase.
 * - Tabla `spots` y tabla `media` (ver supabase/schema.sql).
 * - Fotos y vídeos en el bucket público `media` de Storage.
 * - Realtime: cualquier cambio de otro dispositivo se refleja al momento.
 */

export const isConfigured = true

const BUCKET = 'media'

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
  author_id?: string | null
  sacred?: boolean
  tags?: string[] | null
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
  rating: Number(r.rating) || 0,
  notes: r.notes,
  address: r.address ?? undefined,
  shell: r.shell as ShellColor,
  author: r.author ?? undefined,
  authorId: r.author_id ?? undefined,
  sacred: r.sacred ?? false,
  tags: (r.tags ?? []) as SpotTag[],
  createdAt: Date.parse(r.created_at),
  updatedAt: Date.parse(r.updated_at),
})

/** `withSacred`: solo los ermitaños envían el campo "sagrada" (la base de datos rechaza al resto). */
const toRow = (s: Spot, withSacred = false): SpotRow => ({
  ...(withSacred ? { sacred: !!s.sacred } : {}),
  id: s.id,
  name: s.name,
  lat: s.lat,
  lng: s.lng,
  rating: s.rating,
  notes: s.notes,
  address: s.address ?? null,
  shell: s.shell,
  tags: s.tags ?? [],
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

/** Valoración de cada concha = media de sus reseñas (redondeada a media estrella). */
function withReviewStats(spots: Spot[], reviews: Review[]): Spot[] {
  const by = new Map<string, number[]>()
  for (const r of reviews) by.set(r.spotId, [...(by.get(r.spotId) ?? []), r.rating])
  return spots.map((s) => {
    const list = by.get(s.id)
    if (!list?.length) return { ...s, reviewCount: 0 }
    const avg = list.reduce((a, b) => a + b, 0) / list.length
    return { ...s, rating: Math.round(avg * 10) / 10, reviewCount: list.length }
  })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const toChallenge = (c: any): Challenge => ({
  id: c.id,
  userId: c.user_id,
  username: c.username,
  spotId: c.spot_id,
  day: c.day,
  slot: c.slot,
  status: c.status,
  videoPath: c.video_path ?? undefined,
  videoUrl: c.video_path ? publicUrl(c.video_path) : undefined,
  recordedAt: c.recorded_at ? Date.parse(c.recorded_at) : undefined,
  submittedAt: c.submitted_at ? Date.parse(c.submitted_at) : undefined,
  lat: c.lat ?? undefined,
  lng: c.lng ?? undefined,
  accuracyM: c.accuracy_m ?? undefined,
  distanceM: c.distance_m ?? undefined,
  reviewedAt: c.reviewed_at ? Date.parse(c.reviewed_at) : undefined,
  points: c.points ?? 0,
})

// ───────── Store en memoria compartido por toda la app ─────────

export type Status = 'loading' | 'ready' | 'error' | 'unconfigured' | 'no-schema'

interface State {
  status: Status
  spots: Spot[]
  media: Media[]
  requests: SacredRequest[] // peticiones abiertas de concha sagrada
  votes: SacredVote[]
  notifications: AppNotification[]
  reviews: Review[]
  challenges: Challenge[] // los míos (o todos, para los ermitaños)
}

const EMPTY = { spots: [], media: [], requests: [], votes: [], notifications: [], reviews: [], challenges: [] }
let state: State = { status: isConfigured ? 'loading' : 'unconfigured', ...EMPTY }
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
  // Conchas sagradas y notificaciones: si aún no se ha ejecutado supabase/sacred.sql,
  // la app sigue funcionando sin ellas.
  const [requests, votes, notifications, reviews, challenges] = await Promise.all([
    supabase.from('sacred_requests').select('id, spot_id, requested_by, requester, created_at').eq('status', 'pending'),
    supabase.from('sacred_votes').select('request_id, user_id'),
    supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(50),
    supabase.from('reviews').select('*').order('created_at', { ascending: false }),
    supabase.from('challenges').select('*').order('created_at', { ascending: false }).limit(200),
  ])
  for (const r of [requests, votes, notifications, reviews, challenges]) if (r.error) console.warn('Conchas sagradas no disponibles:', r.error.message)

  const reviewList: Review[] = (reviews.data ?? []).map((r) => ({
    id: r.id,
    spotId: r.spot_id,
    userId: r.user_id,
    username: r.username,
    rating: Number(r.rating),
    body: r.body,
    createdAt: Date.parse(r.created_at),
    updatedAt: Date.parse(r.updated_at),
  }))

  set({
    status: 'ready',
    reviews: reviewList,
    challenges: (challenges.data ?? []).map(toChallenge),
    spots: withReviewStats((spots.data as SpotRow[]).map(toSpot), reviewList),
    media: (media.data as MediaRow[]).map(toMedia),
    requests: (requests.data ?? []).map((r) => ({
      id: r.id,
      spotId: r.spot_id,
      requestedBy: r.requested_by,
      requester: r.requester,
      createdAt: Date.parse(r.created_at),
    })),
    votes: (votes.data ?? []).map((v) => ({ requestId: v.request_id, userId: v.user_id })),
    notifications: (notifications.data ?? []).map((n) => ({
      id: n.id,
      kind: n.kind as NotificationKind,
      title: n.title,
      body: n.body,
      spotId: n.spot_id ?? undefined,
      requestId: n.request_id ?? undefined,
      challengeId: n.challenge_id ?? undefined,
      read: !!n.read_at,
      createdAt: Date.parse(n.created_at),
    })),
  })
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
    .on('postgres_changes', { event: '*', schema: 'public', table: 'sacred_requests' }, scheduleRefresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'sacred_votes' }, scheduleRefresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, scheduleRefresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'reviews' }, scheduleRefresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'challenges' }, scheduleRefresh)
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
  set({ status: 'loading', ...EMPTY })
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  start()
  return () => listeners.delete(cb)
}

export function useErmita() {
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

/** Guarda los datos de la concha y borra los archivos quitados. Las fotos y vídeos nuevos se suben aparte. */
export async function saveSpotRecord(spot: Spot, removed: Media[]) {
  const { error } = await supabase.from('spots').upsert(toRow({ ...spot, author: spot.author ?? currentUsername() }, isAdmin()))
  if (error) throw error
  if (removed.length) {
    await supabase.from('media').delete().in('id', removed.map((m) => m.id))
    await supabase.storage.from(BUCKET).remove(removed.map((m) => m.path))
  }
}

/**
 * Sube una foto o vídeo con subida reanudable (TUS, trozos de 6 MB): si se corta la
 * conexión, reintenta y sigue por donde iba en vez de empezar de cero.
 */
/**
 * Subida reanudable (TUS, trozos de 6 MB) al almacén de Supabase: si se corta la
 * conexión, reintenta y sigue por donde iba en vez de empezar de cero.
 */
async function uploadResumable(path: string, blob: Blob, contentType: string, onProgress: (fraction: number) => void, signal?: AbortSignal) {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token ?? SUPABASE_KEY
  await new Promise<void>((resolve, reject) => {
    // Cancelar solo mientras la subida está en curso (después ya no hay nada que cancelar)
    const onAbort = () => {
      upload.abort(true)
      reject(new DOMException('Cancelado', 'AbortError'))
    }
    const finish = (fn: () => void) => {
      signal?.removeEventListener('abort', onAbort)
      fn()
    }
    const upload = new tus.Upload(blob, {
      endpoint: `${SUPABASE_URL}/storage/v1/upload/resumable`,
      retryDelays: [0, 1000, 3000, 5000, 10000, 20000],
      headers: { authorization: `Bearer ${token}`, apikey: SUPABASE_KEY, 'x-upsert': 'false' },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      metadata: { bucketName: BUCKET, objectName: path, contentType, cacheControl: '3600' },
      chunkSize: 6 * 1024 * 1024, // Supabase exige trozos de 6 MB
      onProgress: (sent, total) => onProgress(total ? sent / total : 0),
      onError: (err) => finish(() => reject(err)),
      onSuccess: () => finish(resolve),
    })
    if (signal?.aborted) return reject(new DOMException('Cancelado', 'AbortError'))
    signal?.addEventListener('abort', onAbort)
    upload.findPreviousUploads().then((prev) => {
      if (prev.length) upload.resumeFromPreviousUpload(prev[0])
      upload.start()
    })
  })
}

/** Sube una foto o vídeo de una concha y lo registra. */
export async function uploadSpotFile(
  spotId: string,
  file: { blob: Blob; name: string; kind: 'image' | 'video' },
  onProgress: (fraction: number) => void,
  signal?: AbortSignal,
) {
  const id = uid()
  const path = `${spotId}/${id}.${extOf(file.name, file.blob.type, file.kind)}`
  const contentType = file.blob.type || (file.kind === 'video' ? 'video/mp4' : 'image/jpeg')
  await uploadResumable(path, file.blob, contentType, onProgress, signal)
  const { error } = await supabase
    .from('media')
    .insert({ id, spot_id: spotId, path, kind: file.kind, name: file.name, created_at: new Date().toISOString() })
  if (error) throw error
}

export const refreshNow = () => refresh()

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

// ───────── Conchas sagradas ─────────

/** Mensaje legible a partir de un error de Supabase (los de las funciones SQL ya vienen en español). */
const fail = (error: { message: string } | null) => {
  if (error) throw new Error(error.message)
}

export async function requestSacred(spotId: string) {
  fail((await supabase.rpc('request_sacred', { p_spot: spotId })).error)
  await refresh()
}

export async function withdrawSacred(requestId: string) {
  fail((await supabase.rpc('withdraw_sacred', { p_request: requestId })).error)
  await refresh()
}

export async function resolveSacred(requestId: string, approve: boolean) {
  fail((await supabase.rpc('resolve_sacred', { p_request: requestId, p_approve: approve })).error)
  await refresh()
}

/** Los ermitaños marcan o quitan "sagrada" directamente. */
export async function setSacred(spotId: string, sacred: boolean) {
  fail((await supabase.from('spots').update({ sacred }).eq('id', spotId)).error)
  await refresh()
}

export async function vote(requestId: string, on: boolean) {
  const { data } = await supabase.auth.getSession()
  const userId = data.session?.user.id
  if (!userId) return
  const res = on
    ? await supabase.from('sacred_votes').insert({ request_id: requestId, user_id: userId })
    : await supabase.from('sacred_votes').delete().eq('request_id', requestId).eq('user_id', userId)
  fail(res.error)
  await refresh()
}

// ───────── Notificaciones ─────────

export async function markNotificationsRead(ids: string[]) {
  if (!ids.length) return
  set({ notifications: state.notifications.map((n) => (ids.includes(n.id) ? { ...n, read: true } : n)) })
  await supabase.from('notifications').update({ read_at: new Date().toISOString() }).in('id', ids)
}

export async function deleteNotification(id: string) {
  set({ notifications: state.notifications.filter((n) => n.id !== id) })
  await supabase.from('notifications').delete().eq('id', id)
}

// ───────── Reseñas ─────────

/** Crea o actualiza mi reseña de una concha. */
export async function saveReview(spotId: string, rating: number, body: string) {
  const { data } = await supabase.auth.getSession()
  const user = data.session?.user
  if (!user) throw new Error('Hace falta iniciar sesión')
  const { error } = await supabase.from('reviews').upsert(
    {
      spot_id: spotId,
      user_id: user.id,
      username: (user.user_metadata?.username as string | undefined) ?? '',
      rating,
      body: body.trim(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'spot_id,user_id' },
  )
  fail(error)
  await refresh()
}

export async function deleteReview(id: string) {
  fail((await supabase.from('reviews').delete().eq('id', id)).error)
  await refresh()
}

// ───────── Retos diarios ─────────

/** Pide (o recupera) los 2 retos de hoy: el servidor los sortea entre las conchas cercanas. */
export async function assignChallenges(lat: number, lng: number, radiusKm = 15) {
  fail((await supabase.rpc('assign_daily_challenges', { p_lat: lat, p_lng: lng, p_radius_km: radiusKm })).error)
  await refresh()
}

/** Sube el vídeo del reto y lo envía a revisión con la ubicación de ese momento. */
export async function submitChallenge(
  challenge: Challenge,
  video: { blob: Blob; name: string },
  where: { lat: number; lng: number; accuracy?: number } | null,
  recordedAt: number | undefined,
  onProgress: (fraction: number) => void,
  signal?: AbortSignal,
) {
  const path = `retos/${challenge.userId}/${challenge.id}-${uid().slice(0, 8)}.${extOf(video.name, video.blob.type, 'video')}`
  await uploadResumable(path, video.blob, video.blob.type || 'video/mp4', onProgress, signal)
  const { error } = await supabase.rpc('submit_challenge', {
    p_id: challenge.id,
    p_video_path: path,
    p_lat: where?.lat ?? null,
    p_lng: where?.lng ?? null,
    p_accuracy: where?.accuracy ?? null,
    p_recorded_at: recordedAt ? new Date(recordedAt).toISOString() : null,
  })
  fail(error)
  await refresh()
}

export async function resolveChallenge(id: string, ok: boolean) {
  fail((await supabase.rpc('resolve_challenge', { p_id: id, p_ok: ok })).error)
  await refresh()
}

export async function fetchRanking(since?: Date): Promise<RankingRow[]> {
  const { data, error } = await supabase.rpc('ranking', { p_since: since ? since.toISOString() : null })
  fail(error)
  return ((data ?? []) as { user_id: string; username: string; points: number; retos: number }[]).map((r) => ({
    userId: r.user_id,
    username: r.username,
    points: Number(r.points),
    retos: Number(r.retos),
  }))
}
