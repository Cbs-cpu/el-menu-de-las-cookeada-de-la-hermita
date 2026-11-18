import Dexie, { type EntityTable } from 'dexie'

export interface Spot {
  id: string
  name: string
  lat: number
  lng: number
  rating: number // 0–5, 0 = sin valorar
  notes: string
  address?: string
  shell: ShellColor
  author?: string // nombre de usuario de quien la puso
  authorId?: string // id de usuario de quien la puso
  sacred?: boolean // concha sagrada (solo la pueden marcar los ermitaños)
  createdAt: number
  updatedAt: number
}

/** Archivo guardado en el navegador (versión antigua, solo para migrar). */
export interface LocalMedia {
  id: string
  spotId: string
  blob: Blob
  kind: 'image' | 'video'
  name: string
  createdAt: number
}

export const SHELL_COLORS = {
  naranja: { label: 'Naranja crustáceo', hex: '#FF6A2B' },
  rojo: { label: 'Rojo nécora', hex: '#E5432F' },
  arena: { label: 'Arena', hex: '#F2B44C' },
  langostino: { label: 'Rosa langostino', hex: '#FF8E9E' },
  alga: { label: 'Verde alga', hex: '#3FBFAE' },
  percebe: { label: 'Violeta percebe', hex: '#9C86FF' },
} as const

export type ShellColor = keyof typeof SHELL_COLORS

/** Base de datos local antigua: solo se usa para subir a Supabase las conchas creadas antes. */
export const db = new Dexie('hermita') as Dexie & {
  spots: EntityTable<Spot, 'id'>
  media: EntityTable<LocalMedia, 'id'>
}

db.version(1).stores({
  spots: 'id, createdAt, rating',
  media: 'id, spotId, createdAt',
})

export const uid = () => crypto.randomUUID()

/** Foto o vídeo guardado en Supabase Storage. */
export interface Media {
  id: string
  spotId: string
  path: string
  url: string
  kind: 'image' | 'video'
  name: string
  createdAt: number
}

/** Petición abierta para que una concha sea sagrada. */
export interface SacredRequest {
  id: string
  spotId: string
  requestedBy: string
  requester: string
  createdAt: number
}

export interface SacredVote {
  requestId: string
  userId: string
}

export type NotificationKind = 'sacred_review' | 'sacred_vote' | 'sacred_approved' | 'sacred_rejected'

export interface AppNotification {
  id: string
  kind: NotificationKind
  title: string
  body: string
  spotId?: string
  requestId?: string
  read: boolean
  createdAt: number
}
