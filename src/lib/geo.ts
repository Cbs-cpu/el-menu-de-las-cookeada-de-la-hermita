export interface Place {
  id: string
  name: string
  detail: string
  lat: number
  lng: number
}

interface PhotonFeature {
  geometry: { coordinates: [number, number] }
  properties: {
    osm_id?: number
    name?: string
    street?: string
    housenumber?: string
    city?: string
    state?: string
    country?: string
  }
}

function describe(p: PhotonFeature['properties']) {
  const street = [p.street, p.housenumber].filter(Boolean).join(' ')
  return [street, p.city, p.state, p.country].filter((x, i, a) => x && a.indexOf(x) === i).join(', ')
}

export async function searchPlaces(q: string, near?: { lat: number; lng: number; zoom: number }, signal?: AbortSignal): Promise<Place[]> {
  const url = new URL('https://photon.komoot.io/api/')
  url.searchParams.set('q', q)
  url.searchParams.set('limit', '6')
  if (near) {
    url.searchParams.set('lat', String(near.lat))
    url.searchParams.set('lon', String(near.lng))
    url.searchParams.set('zoom', String(Math.round(Math.max(near.zoom, 6))))
    url.searchParams.set('location_bias_scale', '0.5')
  }
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error('search failed')
  const data: { features: PhotonFeature[] } = await res.json()
  return data.features.map((f, i) => {
    const [lng, lat] = f.geometry.coordinates
    const p = f.properties
    return {
      id: `${p.osm_id ?? i}-${lat}-${lng}`,
      name: p.name || [p.street, p.housenumber].filter(Boolean).join(' ') || p.city || 'Lugar sin nombre',
      detail: describe(p),
      lat,
      lng,
    }
  })
}

export async function reverseGeocode(lat: number, lng: number, signal?: AbortSignal): Promise<string | undefined> {
  try {
    const res = await fetch(`https://photon.komoot.io/reverse?lat=${lat}&lon=${lng}`, { signal })
    if (!res.ok) return undefined
    const data: { features: PhotonFeature[] } = await res.json()
    const f = data.features[0]
    if (!f) return undefined
    const p = f.properties
    return [p.name, describe(p)].filter(Boolean).join(', ') || undefined
  } catch {
    return undefined
  }
}

export const formatCoords = (lat: number, lng: number) => `${lat.toFixed(5)}, ${lng.toFixed(5)}`

/** Ciudad (o pueblo) de un punto, para "conchas de tu ciudad". */
export async function reverseCity(lat: number, lng: number): Promise<string | undefined> {
  try {
    const res = await fetch(`https://photon.komoot.io/reverse?lat=${lat}&lon=${lng}`)
    if (!res.ok) return undefined
    const data: { features: PhotonFeature[] } = await res.json()
    const p = data.features[0]?.properties
    return p?.city ?? p?.name ?? undefined
  } catch {
    return undefined
  }
}

/** Distancia en km entre dos puntos (fórmula del haversine). */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371
  const rad = (d: number) => (d * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

export function formatDistance(km: number) {
  if (km < 1) return `${Math.max(10, Math.round((km * 1000) / 10) * 10)} m`
  if (km < 10) return `${km.toLocaleString('es-ES', { maximumFractionDigits: 1 })} km`
  return `${Math.round(km).toLocaleString('es-ES')} km`
}

export const normalizeText = (s: string) =>
  s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim()
