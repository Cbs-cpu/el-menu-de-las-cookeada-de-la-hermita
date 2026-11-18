import { useEffect, useImperativeHandle, useRef, type Ref } from 'react'
import { Map as MLMap, Marker, type StyleSpecification } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { SHELL_COLORS, type Spot } from '../lib/db'
import { shellSvg } from './Art'

export type MapMode = 'mapa' | 'satelite'

export interface MapHandle {
  flyTo: (lat: number, lng: number, zoom?: number) => void
  center: () => { lat: number; lng: number }
  zoomBy: (d: number) => void
  panTo: (lat: number, lng: number) => void
  zoom: () => number
}

const DARK_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'

const SATELLITE_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    sat: {
      type: 'raster',
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      maxzoom: 19,
      attribution: 'Imágenes © Esri, Maxar, Earthstar Geographics',
    },
    labels: {
      type: 'raster',
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      maxzoom: 19,
    },
  },
  layers: [
    { id: 'sat', type: 'raster', source: 'sat', paint: { 'raster-brightness-max': 0.82, 'raster-saturation': -0.15 } },
    { id: 'labels', type: 'raster', source: 'labels' },
  ],
}

/** Tiñe el estilo oscuro de CARTO hacia un azul tinta marina. */
function tintDarkStyle(map: MLMap) {
  const style = map.getStyle()
  for (const layer of style.layers ?? []) {
    try {
      if (layer.type === 'background') map.setPaintProperty(layer.id, 'background-color', '#0F1B24')
      else if (layer.type === 'fill' && /water/.test(layer.id)) map.setPaintProperty(layer.id, 'fill-color', '#06111A')
      else if (layer.type === 'fill' && /park|landcover|wood|grass/.test(layer.id)) map.setPaintProperty(layer.id, 'fill-color', '#12231F')
      else if (layer.type === 'line' && /waterway/.test(layer.id)) map.setPaintProperty(layer.id, 'line-color', '#0A1C29')
      // Nombres en español cuando existan
      if (layer.type === 'symbol') {
        const tf = map.getLayoutProperty(layer.id, 'text-field')
        if (tf && JSON.stringify(tf).includes('name:en')) map.setLayoutProperty(layer.id, 'text-field', JSON.parse(JSON.stringify(tf).replaceAll('"name:en"', '"name:es"')))
      }
    } catch {
      /* capas sin esa propiedad */
    }
  }
}

interface Props {
  ref?: Ref<MapHandle>
  spots: Spot[]
  selectedId?: string
  draft?: { lat: number; lng: number } | null
  mode: MapMode
  userPos?: { lat: number; lng: number } | null
  onMapClick: (lat: number, lng: number) => void
  onSelect: (id: string) => void
  onDraftMove: (lat: number, lng: number) => void
}

export function MapView({ ref, spots, selectedId, draft, mode, userPos, onMapClick, onSelect, onDraftMove }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<MLMap | null>(null)
  const markers = useRef(new Map<string, { marker: Marker; el: HTMLElement; sig: string }>())
  const draftMarker = useRef<Marker | null>(null)
  const userMarker = useRef<Marker | null>(null)
  const cb = useRef({ onMapClick, onSelect, onDraftMove })
  cb.current = { onMapClick, onSelect, onDraftMove }

  useImperativeHandle(ref, () => ({
    flyTo: (lat, lng, zoom) => {
      const m = map.current
      if (!m) return
      const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
      m.flyTo({ center: [lng, lat], zoom: zoom ?? Math.max(m.getZoom(), 15), essential: true, duration: reduce ? 0 : 1400, padding: panelPadding() })
    },
    center: () => {
      const c = map.current!.getCenter()
      return { lat: c.lat, lng: c.lng }
    },
    panTo: (lat, lng) => {
      const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
      map.current?.easeTo({ center: [lng, lat], duration: reduce ? 0 : 450, padding: panelPadding() })
    },
    zoom: () => map.current?.getZoom() ?? 5,
    zoomBy: (d) => map.current?.easeTo({ zoom: map.current.getZoom() + d, duration: 220 }),
  }))

  // Crear el mapa
  useEffect(() => {
    const m = new MLMap({
      container: container.current!,
      style: DARK_STYLE,
      center: [-3.70379, 40.41678],
      zoom: 5.2,
      attributionControl: { compact: true },
      maxPitch: 60,
    })
    map.current = m
    m.on('style.load', () => {
      if (!m.getStyle().sources?.sat) tintDarkStyle(m)
    })
    m.on('click', (e) => cb.current.onMapClick(e.lngLat.lat, e.lngLat.lng))
    return () => {
      m.remove()
      map.current = null
      markers.current.clear()
    }
  }, [])

  // Cambiar entre mapa y satélite
  const firstMode = useRef(true)
  useEffect(() => {
    if (firstMode.current) {
      firstMode.current = false
      return
    }
    map.current?.setStyle(mode === 'mapa' ? DARK_STYLE : SATELLITE_STYLE)
  }, [mode])

  // Sincronizar marcadores de spots
  useEffect(() => {
    const m = map.current
    if (!m) return
    const seen = new Set<string>()
    for (const s of spots) {
      seen.add(s.id)
      const color = SHELL_COLORS[s.shell]?.hex ?? SHELL_COLORS.naranja.hex
      const sig = `${s.name}|${color}|${s.lat}|${s.lng}|${s.rating}`
      const existing = markers.current.get(s.id)
      if (existing && existing.sig === sig) continue
      if (existing) existing.marker.remove()

      const el = document.createElement('button')
      el.type = 'button'
      el.className = 'spot-marker'
      el.setAttribute('aria-label', `Spot ${s.name}`)
      el.innerHTML = `<span class="spot-pin" style="--shell:${color}">${shellSvg(color, 38)}</span><span class="spot-label">${escapeHtml(s.name)}</span>`
      el.addEventListener('click', (ev) => {
        ev.stopPropagation()
        cb.current.onSelect(s.id)
      })
      const marker = new Marker({ element: el, anchor: 'bottom' }).setLngLat([s.lng, s.lat]).addTo(m)
      markers.current.set(s.id, { marker, el, sig })
    }
    for (const [id, { marker }] of markers.current) {
      if (!seen.has(id)) {
        marker.remove()
        markers.current.delete(id)
      }
    }
  }, [spots])

  // Spot seleccionado
  useEffect(() => {
    for (const [id, { el }] of markers.current) el.classList.toggle('is-selected', id === selectedId)
  }, [selectedId, spots])

  // Chincheta provisional (nuevo spot)
  useEffect(() => {
    const m = map.current
    if (!m) return
    if (!draft) {
      draftMarker.current?.remove()
      draftMarker.current = null
      return
    }
    if (!draftMarker.current) {
      const el = document.createElement('div')
      el.className = 'draft-marker'
      el.innerHTML = `<span class="draft-ring"></span><span class="draft-pin">${shellSvg('#FF6A2B', 40)}</span>`
      const mk = new Marker({ element: el, anchor: 'bottom', draggable: true }).setLngLat([draft.lng, draft.lat]).addTo(m)
      mk.on('dragend', () => {
        const p = mk.getLngLat()
        cb.current.onDraftMove(p.lat, p.lng)
      })
      draftMarker.current = mk
    } else {
      draftMarker.current.setLngLat([draft.lng, draft.lat])
    }
  }, [draft])

  // Mi ubicación
  useEffect(() => {
    const m = map.current
    if (!m || !userPos) return
    if (!userMarker.current) {
      const el = document.createElement('div')
      el.className = 'user-dot'
      el.setAttribute('aria-label', 'Tu ubicación')
      userMarker.current = new Marker({ element: el }).setLngLat([userPos.lng, userPos.lat]).addTo(m)
    } else userMarker.current.setLngLat([userPos.lng, userPos.lat])
  }, [userPos])

  return <div ref={container} className="map" />
}

function panelPadding() {
  const wide = matchMedia('(min-width: 760px)').matches
  return wide ? { left: 420, top: 0, right: 0, bottom: 0 } : { left: 0, top: 90, right: 0, bottom: Math.min(window.innerHeight * 0.64, 620) }
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}
