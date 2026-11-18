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
