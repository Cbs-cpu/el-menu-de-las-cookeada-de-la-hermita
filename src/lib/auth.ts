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
  (s?.user.user_metadata?.username as string | undefined) ?? s?.user.email?.split('@')[0] ?? 'hermitaño'

export function currentUsername() {
  return session ? usernameOf(session) : undefined
}

// ───────── Acciones ─────────

export type AuthError = 'credenciales' | 'existe' | 'red' | 'desconocido'

function classify(message: string, status?: number): AuthError {
  const m = message.toLowerCase()
  if (m.includes('invalid login') || m.includes('invalid credentials')) return 'credenciales'
  if (m.includes('already registered') || m.includes('already exists')) return 'existe'
  if (m.includes('fetch') || m.includes('network') || status === 0) return 'red'
  return 'desconocido'
}

export async function signIn(username: string, password: string): Promise<AuthError | null> {
  const { error } = await supabase.auth.signInWithPassword({ email: usernameToEmail(username), password })
  return error ? classify(error.message, error.status) : null
}

export async function signUp(username: string, password: string): Promise<AuthError | null> {
  const { data, error } = await supabase.auth.signUp({
    email: usernameToEmail(username),
    password,
    options: { data: { username: username.trim() } },
  })
  if (error) return classify(error.message, error.status)
  // Si Supabase pide confirmar el email no hay sesión: con emails internos eso no puede pasar.
  if (!data.session) {
    console.error('Supabase pide confirmar el email: desactiva "Confirm email" en Authentication → Providers → Email')
    return 'desconocido'
  }
  return null
}

export async function signOut() {
  await supabase.auth.signOut()
  resetStore()
}
