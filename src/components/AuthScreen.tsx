import { useEffect, useRef, useState, type FormEvent } from 'react'
import { MIN_PASSWORD, signIn, signUp, validUsername, type AuthError, type AuthErrorKind } from '../lib/auth'
import { buildQuiz, WIZARD_PROMPT, type WizardQuestion } from '../lib/wizard'
import { Crab } from './Art'

type Mode = 'login' | 'register'

const ERRORS: Record<AuthErrorKind, string> = {
  credenciales: 'Usuario o contraseña incorrectos.',
  existe: 'Ese usuario ya existe. Elige otro nombre o entra con él.',
  red: 'No hay conexión con la hermita. Revisa internet y vuelve a probar.',
  confirmar:
    'Supabase está pidiendo confirmar el email. Hay que desactivar "Confirm email" en Supabase (Authentication → Sign In / Providers → Email).',
  'registro-cerrado': 'El registro está desactivado en Supabase. Hay que activar "Allow new users to sign up" en Authentication → Sign In / Providers.',
  'email-invalido': 'Supabase no acepta el email interno de esta cuenta. Prueba con otro nombre de usuario (solo letras y números).',
  'contrasena-debil': 'Supabase pide una contraseña más segura. Prueba con una más larga, con letras y números.',
  'demasiados-intentos': 'Demasiados intentos seguidos. Espera un minuto y vuelve a probar.',
  desconocido: 'Algo ha fallado al hablar con la hermita.',
}

const describe = (e: AuthError) => ERRORS[e.kind] + (e.kind === 'desconocido' && e.detail ? ` (${e.detail})` : '')

export function AuthScreen() {
  const [mode, setMode] = useState<Mode>('login')
  const [step, setStep] = useState<'form' | 'wizard'>('form')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const userInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (step === 'form') userInput.current?.focus()
  }, [mode, step])

  function switchMode(m: Mode) {
    setMode(m)
    setError(undefined)
    setRepeat('')
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(undefined)
    if (mode === 'login') {
      if (!username.trim() || !password) return setError('Escribe tu usuario y tu contraseña.')
      setBusy(true)
      const err = await signIn(username, password)
      setBusy(false)
      if (err) setError(describe(err))
      return
    }
    if (!validUsername(username)) return setError('El usuario tiene que tener entre 3 y 30 caracteres.')
    if (password.length < MIN_PASSWORD) return setError(`La contraseña tiene que tener al menos ${MIN_PASSWORD} caracteres.`)
    if (password !== repeat) return setError('Las contraseñas no coinciden.')
    setStep('wizard')
  }

  async function finishRegister() {
    const err = await signUp(username, password)
    if (err) {
      setStep('form')
      setError(describe(err))
    }
    // Si va bien, la sesión cambia y la app se abre sola.
  }

  return (
    <main className="auth">
      <div className="auth-beach" aria-hidden="true">
        <Crab color="#FF6A2B" size={54} className="crab-walk" />
        <Crab color="#3FBFAE" size={36} className="crab-walk crab-walk-slow" />
        <Crab color="#F2B44C" size={30} className="crab-walk crab-walk-late" />
      </div>

      {step === 'wizard' ? (
        <WizardTest onPass={finishRegister} onBack={() => setStep('form')} />
      ) : (
        <section className="auth-card" aria-labelledby="auth-title">
          <div className="auth-crabs" aria-hidden="true">
            <Crab color="#FF6A2B" size={64} />
            <Crab color="#E5432F" size={42} />
            <Crab color="#FF8E9E" size={32} />
          </div>
          <h1 id="auth-title" className="auth-title">
            El menú de cookeadas de la hermita
          </h1>

          <div className="segmented auth-tabs" role="tablist" aria-label="Entrar o crear cuenta">
            <button type="button" role="tab" aria-selected={mode === 'login'} className={mode === 'login' ? 'is-on' : ''} onClick={() => switchMode('login')}>
              Entrar
            </button>
            <button type="button" role="tab" aria-selected={mode === 'register'} className={mode === 'register' ? 'is-on' : ''} onClick={() => switchMode('register')}>
              Crear cuenta
            </button>
          </div>

          <form className="auth-form" onSubmit={submit} noValidate>
            <label className="field">
              <span className="field-label">Usuario</span>
              <input
                ref={userInput}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="los hermitaños"
                maxLength={30}
              />
            </label>
            <label className="field">
              <span className="field-label">Contraseña</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              />
            </label>
            {mode === 'register' && (
              <label className="field">
                <span className="field-label">Repite la contraseña</span>
                <input type="password" value={repeat} onChange={(e) => setRepeat(e.target.value)} autoComplete="new-password" />
              </label>
            )}

            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}

            <button type="submit" className="btn btn-primary auth-submit" disabled={busy}>
              {mode === 'login' ? (busy ? 'Entrando…' : 'Entrar') : 'Pasar la prueba del mago'}
            </button>
            {mode === 'register' && <p className="auth-hint">Para terminar el registro, el mago te hará unas preguntas.</p>}
          </form>
        </section>
      )}
    </main>
  )
}

// ───────── La prueba del mago ─────────

function WizardTest({ onPass, onBack }: { onPass: () => Promise<void>; onBack: () => void }) {
  const [quiz, setQuiz] = useState<WizardQuestion[]>(() => buildQuiz())
  const [index, setIndex] = useState(0)
  const [result, setResult] = useState<'playing' | 'failed' | 'passed'>('playing')
  const [failedOn, setFailedOn] = useState<string>()
  const q = quiz[index]

  function answer(yes: boolean) {
    if (result !== 'playing') return
    if (yes !== q.answer) {
      setFailedOn(q.word)
      setResult('failed')
      return
    }
    if (index + 1 < quiz.length) setIndex(index + 1)
    else {
      setResult('passed')
      onPass()
    }
  }

  function retry() {
    setQuiz(buildQuiz())
    setIndex(0)
    setFailedOn(undefined)
    setResult('playing')
  }

  // Atajos de teclado: S = Sí, N = No
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      const k = e.key.toLowerCase()
      if (k === 's') answer(true)
      if (k === 'n') answer(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <section className="auth-card wizard" aria-labelledby="wizard-title" aria-live="polite">
      <div className="wizard-head">
        <WizardCrab mood={result} />
        <h1 id="wizard-title" className="wizard-title">
          La prueba del mago
        </h1>
      </div>

      {result === 'playing' && (
        <>
          <div className="wizard-progress" aria-label={`Pregunta ${index + 1} de ${quiz.length}`}>
            <span className="wizard-progress-bar" style={{ transform: `scaleX(${index / quiz.length})` }} />
          </div>
          <p className="wizard-count tabular">
            {index + 1} de {quiz.length}
          </p>
          <div className="wizard-question" key={index}>
            <h2 className="wizard-prompt">{WIZARD_PROMPT}</h2>
            <p className="wizard-word">{q.word}</p>
          </div>
          <div className="wizard-answers">
            <button type="button" className="wizard-btn wizard-yes" onClick={() => answer(true)}>
              Sí
            </button>
            <button type="button" className="wizard-btn wizard-no" onClick={() => answer(false)}>
              No
            </button>
          </div>
          <button type="button" className="btn btn-ghost wizard-back" onClick={onBack}>
            Volver al registro
          </button>
        </>
      )}

      {result === 'failed' && (
        <div className="wizard-end">
          <h2>El mago te ha pillado</h2>
          <p>Has fallado con «{failedOn}». Para entrar en la hermita tienes que acertarlas todas.</p>
          <div className="wizard-end-actions">
            <button type="button" className="btn btn-ghost" onClick={onBack}>
              Volver al registro
            </button>
            <button type="button" className="btn btn-primary" onClick={retry} autoFocus>
              Volver a intentarlo
            </button>
          </div>
        </div>
      )}

      {result === 'passed' && (
        <div className="wizard-end">
          <h2>El mago te deja pasar</h2>
          <p>Creando tu cuenta…</p>
        </div>
      )}
    </section>
  )
}

function WizardCrab({ mood }: { mood: 'playing' | 'failed' | 'passed' }) {
  return (
    <div className={`wizard-crab is-${mood}`} aria-hidden="true">
      <svg className="wizard-hat" viewBox="0 0 60 50" width="60" height="50">
        <path d="M30 2 L46 40 L14 40 Z" fill="#6B4FD8" stroke="#3F2A93" strokeWidth="2" strokeLinejoin="round" />
        <path d="M30 2 Q38 6 42 14" fill="none" stroke="#9C86FF" strokeWidth="2" strokeLinecap="round" />
        <ellipse cx="30" cy="41" rx="26" ry="6" fill="#6B4FD8" stroke="#3F2A93" strokeWidth="2" />
        <path d="M27 20 l1.4 3 3.2.4-2.4 2.2.6 3.2-2.8-1.6-2.8 1.6.6-3.2-2.4-2.2 3.2-.4z" fill="#F2B44C" />
        <circle cx="35" cy="31" r="1.6" fill="#F2B44C" />
        <circle cx="22" cy="33" r="1.2" fill="#F2B44C" />
      </svg>
      <Crab color="#9C86FF" size={84} />
    </div>
  )
}
