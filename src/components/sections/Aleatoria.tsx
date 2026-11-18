import { useEffect, useMemo, useRef, useState } from 'react'
import type { Spot } from '../../lib/db'
import { distanceKm, normalizeText } from '../../lib/geo'
import { useMyLocation } from '../../lib/location'
import { pickRandom } from '../../lib/random'
import { useErmita } from '../../lib/store'
import { Crab } from '../Art'
import { LocationGate, NoSpots, SectionPage, SpotCard } from './shared'

/** Una concha es "de tu ciudad" si su dirección es de esa ciudad o está a menos de esto. */
const CITY_RADIUS_KM = 10

interface Props {
  onMenu: () => void
  onOpenSpot: (s: Spot) => void
  onMap: () => void
}

export function Aleatoria({ onMenu, onOpenSpot, onMap }: Props) {
  return (
    <SectionPage title="Concha aleatoria" onMenu={onMenu}>
      <LocationGate why="La concha aleatoria sale de tu ciudad, así que primero hay que saber dónde estás.">
        <Ruleta onOpenSpot={onOpenSpot} onMap={onMap} />
      </LocationGate>
    </SectionPage>
  )
}

function Ruleta({ onOpenSpot, onMap }: Omit<Props, 'onMenu'>) {
  const { spots } = useErmita()
  const { pos, city, cityStatus } = useMyLocation()
  const [picked, setPicked] = useState<Spot>()
  const [round, setRound] = useState(0) // para re-animar cada sorteo
  const [rolling, setRolling] = useState<string>() // nombre que pasa durante el sorteo
  const timer = useRef<ReturnType<typeof setInterval>>(undefined)

  useEffect(() => () => clearInterval(timer.current), [])

  const candidates = useMemo(() => {
    const c = city ? normalizeText(city) : undefined
    return spots.filter((s) => (c && s.address && normalizeText(s.address).includes(c)) || distanceKm(pos!, s) <= CITY_RADIUS_KM)
  }, [spots, pos, city])

  const place = city ?? 'tu zona'

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

  if (cityStatus === 'loading')
    return (
      <div className="section-empty">
        <Crab size={64} className="crab-walk" />
        <p>Mirando en qué ciudad estás…</p>
      </div>
    )

  if (!candidates.length)
    return <NoSpots title={`No hay conchas en ${place}`} text="Pon alguna en el mapa y el cangrejo podrá sortearla." onMap={onMap} />

  return (
    <div className="ruleta">
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
          <SpotCard spot={picked} distance={distanceKm(pos!, picked)} onOpen={onOpenSpot} big />
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
    </div>
  )
}
