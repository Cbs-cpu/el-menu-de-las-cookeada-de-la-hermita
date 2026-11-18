/** Entero aleatorio uniforme en [0, n) usando el generador criptográfico del navegador. */
export function randomInt(n: number) {
  if (n <= 0) throw new Error('randomInt: n debe ser > 0')
  // Rechazo para evitar el sesgo del módulo
  const max = Math.floor(0x100000000 / n) * n
  const buf = new Uint32Array(1)
  do crypto.getRandomValues(buf)
  while (buf[0] >= max)
  return buf[0] % n
}

export const pickRandom = <T,>(list: T[]): T => list[randomInt(list.length)]

/** Fecha local del día, p. ej. "2026-11-18". */
export function dayKey(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
