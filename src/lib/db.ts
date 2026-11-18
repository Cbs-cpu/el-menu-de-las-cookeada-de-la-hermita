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
  createdAt: number
  updatedAt: number
}

export interface Media {
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

export const db = new Dexie('hermita') as Dexie & {
  spots: EntityTable<Spot, 'id'>
  media: EntityTable<Media, 'id'>
}

db.version(1).stores({
  spots: 'id, createdAt, rating',
  media: 'id, spotId, createdAt',
})

export const uid = () => crypto.randomUUID()
