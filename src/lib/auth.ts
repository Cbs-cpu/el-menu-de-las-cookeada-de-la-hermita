import { useSyncExternalStore } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { resetStore } from './store'

/*
 * Cuentas por nombre de usuario. Supabase Auth trabaja con emails, así que cada
 * usuario se guarda con un email interno: "los hermitaños" → los-hermitanos@hermita.app.
 * Nadie tiene que usar ese email; solo el nombre de usuario y la contraseña.
 */

const EMAIL_DOMAIN = 'hermita.app'

export function usernameToEmail(username: string) {
  const slug = username
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `${slug}@${EMAIL_DOMAIN}`
}

export function validUsername(username: string) {
  const u = username.trim()
  return u.length >= 3 && u.length <= 30 && /[a-z0-9]/i.test(u)
}

export const MIN_PASSWORD = 6

// ───────── Sesión ─────────
// undefined = todavía comprobando, null = sin sesión
let session: Session | null | undefined = undefined
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

supabase.auth.getSession().then(({ data }) => {
  session = data.session
  emit()
})
supabase.auth.onAuthStateChange((_event, s) => {
  session = s
  emit()
})

export function useSession() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => session,
  )
}

export const usernameOf = (s: Session | null | undefined) =>
  (s?.user.user_metadata?.username as string | undefined) ?? s?.user.email?.split('@')[0] ?? 'ermitaño'

/** Cuenta de administración: por ahora solo "los hermitaños" (la base de datos lo comprueba igual). */
export const ADMIN_EMAIL = 'los-hermitanos@hermita.app'
export const isAdminSession = (s: Session | null | undefined) => s?.user.email === ADMIN_EMAIL
export const isAdmin = () => isAdminSession(session)
export const currentUserId = () => session?.user.id

export function currentUsername() {
  return session ? usernameOf(session) : undefined
}

// ───────── Acciones ─────────

export type AuthErrorKind =
  | 'credenciales'
  | 'existe'
  | 'red'
  | 'confirmar' // Supabase sigue pidiendo confirmar el email
  | 'registro-cerrado'
  | 'email-invalido'
  | 'contrasena-debil'
  | 'demasiados-intentos'
  | 'desconocido'

/** Error para mostrar: tipo + el texto original de Supabase para poder diagnosticar. */
export interface AuthError {
  kind: AuthErrorKind
  detail?: string
}

function classify(error: { message: string; status?: number; code?: string }): AuthError {
  const m = error.message.toLowerCase()
  const code = error.code ?? ''
  const detail = [code, error.message].filter(Boolean).join(': ')
  let kind: AuthErrorKind = 'desconocido'
  if (code === 'invalid_credentials' || m.includes('invalid login') || m.includes('invalid credentials')) kind = 'credenciales'
  else if (code === 'user_already_exists' || code === 'email_exists' || m.includes('already registered')) kind = 'existe'
  else if (code === 'email_not_confirmed' || m.includes('not confirmed') || m.includes('confirmation email')) kind = 'confirmar'
  else if (code === 'signup_disabled' || code === 'email_provider_disabled' || m.includes('signups not allowed')) kind = 'registro-cerrado'
  else if (code === 'email_address_invalid' || m.includes('email address') && m.includes('invalid')) kind = 'email-invalido'
  else if (code === 'weak_password' || m.includes('password should')) kind = 'contrasena-debil'
  else if (code.startsWith('over_') || error.status === 429) kind = 'demasiados-intentos'
  else if (m.includes('fetch') || m.includes('network') || error.status === 0) kind = 'red'
  console.error('Supabase auth:', detail)
  return { kind, detail }
}

export async function signIn(username: string, password: string): Promise<AuthError | null> {
  const { error } = await supabase.auth.signInWithPassword({ email: usernameToEmail(username), password })
  return error ? classify(error) : null
}

export async function signUp(username: string, password: string): Promise<AuthError | null> {
  const { data, error } = await supabase.auth.signUp({
    email: usernameToEmail(username),
    password,
    options: { data: { username: username.trim() } },
  })
  if (error) return classify(error)
  // Sin sesión = Supabase quiere que se confirme el email (que es interno y nadie puede confirmar).
  if (!data.session) return { kind: 'confirmar', detail: 'signUp sin sesión: Confirm email está activado' }
  return null
}

export async function signOut() {
  await supabase.auth.signOut()
  resetStore()
}
