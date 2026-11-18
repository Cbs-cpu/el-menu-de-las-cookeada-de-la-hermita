import { useEffect, useMemo, useRef, useState } from 'react'
import type { Spot } from '../../lib/db'
import { distanceKm, normalizeText } from '../../lib/geo'
import { useMyLocation } from '../../lib/location'
import { pickRandom } from '../../lib/random'
import { useErmita } from '../../lib/store'
import { Crab } from '../Art'
import { NoSpots, SectionPage, SpotCard } from './shared'
import { loadZone, useZoneCenter, ZoneChooser, type Zone } from './ZoneChooser'

interface Props {
  onMenu: () => void
  onOpenSpot: (s: Spot) => void
  onMap: () => void
}

export function Aleatoria({ onMenu, onOpenSpot, onMap }: Props) {
  return (
    <SectionPage title="Concha aleatoria" onMenu={onMenu}>
      <Ruleta onOpenSpot={onOpenSpot} onMap={onMap} />
    </SectionPage>
  )
}

function Ruleta({ onOpenSpot, onMap }: Omit<Props, 'onMenu'>) {
  const { spots } = useErmita()
  const { cityStatus, status: locStatus } = useMyLocation()
  // Antes de sortear se elige de dónde: así no sale una concha de otro país
  const [zone, setZone] = useState<Zone>(() => loadZone({ kind: 'me' }))
  const [radius, setRadius] = useState(15)
  const center = useZoneCenter(zone)
  const [picked, setPicked] = useState<Spot>()
  const [round, setRound] = useState(0) // para re-animar cada sorteo
  const [rolling, setRolling] = useState<string>() // nombre que pasa durante el sorteo
  const timer = useRef<ReturnType<typeof setInterval>>(undefined)

  useEffect(() => () => clearInterval(timer.current), [])

  const candidates = useMemo(() => {
    if (zone.kind === 'world') return spots
    if (!center) return []
    return spots.filter(
      (s) => distanceKm(center, s) <= radius || (zone.kind === 'place' && !!center.match && !!s.address && normalizeText(s.address).includes(center.match)),
    )
  }, [spots, zone.kind, center, radius])

  const place = zone.kind === 'world' ? 'todo el mundo' : (center?.label ?? 'tu zona')
  // Si cambia la zona, la concha sorteada antes ya no vale
  useEffect(() => setPicked(undefined), [zone, radius])

  function roll() {
    if (!candidates.length) return
    const winner = pickRandom(candidates) // completamente aleatoria: uniforme entre todas
    setRound((r) => r + 1)
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce || candidates.length === 1) {
      setPicked(winner)
      return
    }
    // Un momento de suspense: pasan nombres al azar y se para en la elegida
    setPicked(undefined)
    let ticks = 0
    clearInterval(timer.current)
    timer.current = setInterval(() => {
      ticks++
      setRolling(pickRandom(candidates).name)
      if (ticks >= 12) {
        clearInterval(timer.current)
        setRolling(undefined)
        setPicked(winner)
      }
    }, 70)
  }

  const noLocation = zone.kind === 'me' && !center && (locStatus === 'denied' || locStatus === 'unavailable')
  const waiting = zone.kind === 'me' && !noLocation && (!center || cityStatus === 'loading')

  return (
    <div className="ruleta">
      <div className="filter">
        <ZoneChooser title="¿De dónde quieres la concha?" zone={zone} onZone={setZone} radius={radius} onRadius={setRadius} />
      </div>

      {noLocation ? (
        <p className="section-count">Sin tu ubicación, elige arriba «Otra zona» y busca tu ciudad.</p>
      ) : waiting ? (
        <div className="ruleta-idle">
          <Crab size={64} className="crab-walk" />
          <p>Mirando dónde estás…</p>
        </div>
      ) : !candidates.length ? (
        <NoSpots title={`No hay conchas en ${place}`} text="Amplía la distancia, elige otra zona o pon alguna concha en el mapa." onMap={onMap} />
      ) : (
        <>
          <p className="ruleta-where">
            {candidates.length} {candidates.length === 1 ? 'concha' : 'conchas'} en {place}
          </p>

          {rolling ? (
            <div className="ruleta-rolling" aria-hidden="true">
              <Crab size={56} className="crab-shake" />
              <span>{rolling}</span>
            </div>
          ) : picked ? (
            <div className="ruleta-result" key={round}>
              <SpotCard spot={picked} distance={center ? distanceKm(center, picked) : undefined} onOpen={onOpenSpot} big />
            </div>
          ) : (
            <div className="ruleta-idle">
              <Crab size={88} />
              <p>El cangrejo tiene todas las conchas de {place} en la pinza.</p>
            </div>
          )}

          <button type="button" className="btn btn-primary ruleta-btn" onClick={roll} disabled={!!rolling}>
            {picked ? 'Soltar otra concha' : 'Soltar una concha'}
          </button>
        </>
      )}
    </div>
  )
}
