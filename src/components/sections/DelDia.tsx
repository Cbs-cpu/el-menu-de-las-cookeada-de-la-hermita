import { useEffect, useMemo, useState } from 'react'
import type { Spot } from '../../lib/db'
import { usernameOf, useSession } from '../../lib/auth'
import { dayKey, randomInt } from '../../lib/random'
import { useErmita } from '../../lib/store'
import { ChefCrab, WizardCrabArt } from '../Art'
import { NoSpots, SectionPage, SpotCard } from './shared'

/*
 * Concha del día: se sortea al azar la primera vez que se abre cada día y se
 * guarda en este dispositivo, para que la misión no cambie hasta mañana.
 */

const MESSAGES = [
  'Ermitaño {user}. Soy el CHEF. He mirado en los fogones del destino y hoy tu misión es clara: ve a «{spot}» y cookea como si no hubiera mañana.',
  'Escúchame bien, {user}. El CHEF no se equivoca nunca. Hoy tu concha es «{spot}». Ve, cookea y vuelve con historias.',
  '{user}, el aceite ya está caliente. Hoy el CHEF te encomienda «{spot}». Quien no cookea no es de la ermita.',
  'Por orden del CHEF, dios de las cookeadas: hoy, {user}, cookearás en «{spot}». Esta misión no se discute.',
  'El mago me ha dejado hablar contigo, {user}. Tu día cooker empieza en «{spot}». Ve allí y cookea. El CHEF te observa.',
  '{user}, los astros de la sartén se han alineado. «{spot}» te espera. Ve, cookea y honra a la ermita.',
]

interface Mission {
  day: string
  spotId: string
  message: number
  opened: boolean
  accepted: boolean
}

const capitalize = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)

const storageKey = (userId: string) => `concha-del-dia:${userId}`

function load(userId: string): Mission | undefined {
  try {
    const raw = localStorage.getItem(storageKey(userId))
    return raw ? (JSON.parse(raw) as Mission) : undefined
  } catch {
    return undefined
  }
}

function save(userId: string, m: Mission) {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(m))
  } catch {
    /* sin almacenamiento: la misión dura lo que dure la pestaña */
  }
}

interface Props {
  onMenu: () => void
  onOpenSpot: (s: Spot) => void
  onMap: () => void
}

export function DelDia({ onMenu, onOpenSpot, onMap }: Props) {
  const { spots, status } = useErmita()
  const session = useSession()
  const userId = session?.user.id ?? 'anon'
  const user = usernameOf(session)
  const today = dayKey()
  const [mission, setMission] = useState<Mission | undefined>(() => load(userId))

  // Sortear la misión de hoy si no hay, es de otro día o su concha ya no existe
  useEffect(() => {
    if (status !== 'ready' || !spots.length) return
    const valid = mission && mission.day === today && spots.some((s) => s.id === mission.spotId)
    if (valid) return
    const fresh: Mission = { day: today, spotId: spots[randomInt(spots.length)].id, message: randomInt(MESSAGES.length), opened: false, accepted: false }
    save(userId, fresh)
    setMission(fresh)
  }, [status, spots, mission, today, userId])

  const update = (patch: Partial<Mission>) => {
    if (!mission) return
    const next = { ...mission, ...patch }
    save(userId, next)
    setMission(next)
  }

  const spot = useMemo(() => spots.find((s) => s.id === mission?.spotId), [spots, mission])
  const dateLabel = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <SectionPage title="Concha del día" onMenu={onMenu}>
      {status === 'ready' && !spots.length ? (
        <NoSpots title="El CHEF no tiene conchas que darte" text="Pon alguna concha en el mapa y mañana tendrás misión." onMap={onMap} />
      ) : !spot || !mission ? (
        <div className="section-empty">
          <WizardCrabArt size={84} className="crab-float" />
          <p>El mago está abriendo el portal…</p>
        </div>
      ) : !mission.opened ? (
        <div className="decree-sealed">
          <WizardCrabArt size={96} className="crab-float" />
          <p className="decree-date">{dateLabel}</p>
          <h2>El mago trae un mensaje del CHEF para ti</h2>
          <p className="muted">Viene directo del dios de las cookeadas. Solo se abre una vez al día.</p>
          <button type="button" className="decree-seal" onClick={() => update({ opened: true })}>
            <span className="decree-seal-wax" aria-hidden="true">
              C
            </span>
            Romper el sello
          </button>
        </div>
      ) : (
        <div className="decree">
          <div className="decree-scroll">
            <ChefCrab size={92} className="decree-chef" />
            <p className="decree-from">Mensaje directo del CHEF, el dios de las cookeadas</p>
            <blockquote className="decree-text">
              {capitalize(MESSAGES[mission.message % MESSAGES.length].replace('{user}', user).replace('{spot}', spot.name))}
            </blockquote>
            <p className="decree-sign">El CHEF</p>
          </div>

          <h3 className="decree-mission">Tu misión de hoy</h3>
          <SpotCard spot={spot} onOpen={onOpenSpot} big />

          {mission.accepted ? (
            <p className="decree-accepted" role="status">
              Misión aceptada. El CHEF está orgulloso de ti. Mañana habrá otra.
            </p>
          ) : (
            <button type="button" className="btn btn-primary decree-accept" onClick={() => update({ accepted: true })}>
              Acepto la misión
            </button>
          )}
        </div>
      )}
    </SectionPage>
  )
}
