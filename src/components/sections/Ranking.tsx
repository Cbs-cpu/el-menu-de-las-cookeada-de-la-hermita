import { useEffect, useState } from 'react'
import type { RankingRow } from '../../lib/db'
import { useSession } from '../../lib/auth'
import { fetchRanking, useErmita } from '../../lib/store'
import { Crab } from '../Art'
import { SectionPage } from './shared'

type Period = 'mes' | 'siempre'

const MEDALS = ['#F5C542', '#C9D3DB', '#D9894A'] // oro, plata, bronce

/** Primer instante del mes actual, en la hora del móvil. */
const startOfMonth = () => {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

export function Ranking({ onMenu, onRetos }: { onMenu: () => void; onRetos: () => void }) {
  const me = useSession()?.user.id
  const { challenges } = useErmita() // se recarga cuando cambian los retos (en tiempo real)
  const [period, setPeriod] = useState<Period>('mes')
  const [rows, setRows] = useState<RankingRow[] | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let alive = true
    setError(false)
    fetchRanking(period === 'mes' ? startOfMonth() : undefined).then(
      (r) => alive && setRows(r),
      () => alive && setError(true),
    )
    return () => {
      alive = false
    }
  }, [period, challenges])

  const month = new Date().toLocaleDateString('es-ES', { month: 'long' })

  return (
    <SectionPage title="Ranking de cookeadores" onMenu={onMenu}>
      <div className="prize">
        <Crab color="#F5C542" size={56} />
        <p>
          <strong>Quien más puntos tenga se llevará un descuento</strong> para futuras compras en la app. Los puntos se ganan cumpliendo los retos diarios.
        </p>
      </div>

      <div className="segmented section-sort" role="tablist" aria-label="Periodo">
        <button type="button" role="tab" aria-selected={period === 'mes'} className={period === 'mes' ? 'is-on' : ''} onClick={() => setPeriod('mes')}>
          Este mes ({month})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={period === 'siempre'}
          className={period === 'siempre' ? 'is-on' : ''}
          onClick={() => setPeriod('siempre')}
        >
          Desde siempre
        </button>
      </div>

      {error ? (
        <p className="section-count">No se pudo cargar el ranking. Revisa la conexión y vuelve a entrar.</p>
      ) : rows === null ? (
        <p className="section-count">Cargando el ranking…</p>
      ) : rows.length === 0 ? (
        <div className="section-empty">
          <Crab size={72} />
          <h2>Nadie ha puntuado todavía</h2>
          <p>{period === 'mes' ? 'Este mes aún no hay retos cumplidos.' : 'Aún no hay retos cumplidos.'} El primero que cumpla uno se pone en cabeza.</p>
          <button type="button" className="btn btn-primary" onClick={onRetos}>
            Ir a mis retos
          </button>
        </div>
      ) : (
        <ol className="ranking">
          {rows.map((r, i) => (
            <li key={r.userId} className={`${r.userId === me ? 'is-me' : ''} ${i < 3 ? 'is-podium' : ''}`}>
              <span className="ranking-pos tabular" style={i < 3 ? ({ '--medal': MEDALS[i] } as React.CSSProperties) : undefined}>
                {i + 1}
              </span>
              <span className="ranking-who">
                <strong>
                  {r.username || 'Alguien'}
                  {r.userId === me && <span className="review-you"> tú</span>}
                </strong>
                <small>
                  {r.retos} {r.retos === 1 ? 'reto cumplido' : 'retos cumplidos'}
                </small>
              </span>
              <span className="ranking-points tabular">
                {r.points}
                <small>pts</small>
              </span>
            </li>
          ))}
        </ol>
      )}
    </SectionPage>
  )
}
