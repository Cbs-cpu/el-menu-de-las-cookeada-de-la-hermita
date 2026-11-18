import { useSyncExternalStore } from 'react'
import { reverseCity } from './geo'

/*
 * Ubicación del usuario compartida por todas las secciones: se pide una vez
 * y se reutiliza (y se refresca si se vuelve a pedir).
 */

export type LocationStatus = 'idle' | 'asking' | 'ok' | 'denied' | 'unavailable'

interface LocationState {
  status: LocationStatus
  pos?: { lat: number; lng: number }
  city?: string
  cityStatus: 'idle' | 'loading' | 'ok' | 'unknown'
}

let state: LocationState = { status: 'idle', cityStatus: 'idle' }
const listeners = new Set<() => void>()
const set = (patch: Partial<LocationState>) => {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

export function requestLocation() {
  if (!navigator.geolocation) return set({ status: 'unavailable' })
  if (state.status !== 'ok') set({ status: 'asking' })
  navigator.geolocation.getCurrentPosition(
    (p) => {
      const pos = { lat: p.coords.latitude, lng: p.coords.longitude }
      set({ status: 'ok', pos })
      set({ cityStatus: 'loading' })
      reverseCity(pos.lat, pos.lng).then((city) => set({ city, cityStatus: city ? 'ok' : 'unknown' }))
    },
    (err) => set({ status: err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable' }),
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
  )
}

export function useMyLocation() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => state,
  )
}
