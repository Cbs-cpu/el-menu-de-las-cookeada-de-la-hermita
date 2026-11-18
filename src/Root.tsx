import { useSession } from './lib/auth'
import { AuthScreen } from './components/AuthScreen'
import { Crab } from './components/Art'
import App from './App'

/** Sin sesión: pantalla de entrar/registrarse. Con sesión: la app. */
export default function Root() {
  const session = useSession()
  if (session === undefined)
    return (
      <div className="splash" aria-label="Cargando">
        <Crab size={64} className="crab-walk" />
      </div>
    )
  return session ? <App /> : <AuthScreen />
}
