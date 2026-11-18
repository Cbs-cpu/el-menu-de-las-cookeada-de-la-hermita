// mediabunny (~600 KB) se carga solo al elegir un vídeo, para no hacer más lenta la app.
const loadMediabunny = () => import('mediabunny')

/*
 * Preparar fotos y vídeos en el propio móvil antes de subirlos:
 * - Vídeos: se recomprimen a 720p (~2 Mbps) con el codificador del navegador (WebCodecs).
 *   30 s de vídeo del móvil (~60–100 MB) quedan en ~8 MB.
 * - Fotos: se reducen a 2048 px de lado en JPEG (~300–600 KB).
 * Todo gratis y sin servidor: el límite de Supabase gratis es 50 MB por archivo.
 */

export const MAX_UPLOAD_MB = 50
export const MAX_VIDEO_SECONDS = 180
const MB = 1024 * 1024
const COMPRESS_VIDEO_OVER_MB = 15 // por debajo de esto se sube tal cual
const VIDEO_LONG_SIDE = 1280 // 720p
const VIDEO_BITRATE = 2_000_000
const AUDIO_BITRATE_ESTIMATE = 128_000
const IMAGE_LONG_SIDE = 2048
const IMAGE_QUALITY = 0.82

export type PrepareErrorKind = 'muy-largo' | 'muy-grande' | 'no-se-puede-comprimir' | 'formato' | 'cancelado'

export class PrepareError extends Error {
  kind: PrepareErrorKind
  constructor(kind: PrepareErrorKind, message: string) {
    super(message)
    this.kind = kind
  }
}

export interface Prepared {
  blob: Blob
  name: string
  originalSize: number
  compressed: boolean
  duration?: number
}

export const formatMB = (bytes: number) => {
  const mb = bytes / MB
  return mb < 1 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${mb.toLocaleString('es-ES', { maximumFractionDigits: mb < 10 ? 1 : 0 })} MB`
}

export const formatDuration = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`

/** Tamaño aproximado que tendrá un vídeo de `seconds` una vez comprimido. */
export const estimateVideoBytes = (seconds: number) => (seconds * (VIDEO_BITRATE + AUDIO_BITRATE_ESTIMATE)) / 8

const baseName = (name: string) => name.replace(/\.[^.]+$/, '') || 'video'
const even = (n: number) => Math.max(2, Math.round(n / 2) * 2)

export async function prepareVideo(
  file: File,
  onProgress: (fraction: number) => void,
  signal?: AbortSignal,
  onInfo?: (info: { duration: number; estimatedBytes: number }) => void,
): Promise<Prepared> {
  const { ALL_FORMATS, BlobSource, BufferTarget, canEncodeVideo, Conversion, Input, Mp4OutputFormat, Output } = await loadMediabunny()
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS })
  let duration: number
  let track
  try {
    duration = await input.computeDuration()
    track = await input.getPrimaryVideoTrack()
  } catch {
    throw new PrepareError('formato', 'No se puede leer este vídeo. Prueba a grabarlo de nuevo o a enviarlo en otro formato.')
  }
  if (!track) throw new PrepareError('formato', 'Este archivo no tiene imagen de vídeo.')
  if (duration > MAX_VIDEO_SECONDS)
    throw new PrepareError(
      'muy-largo',
      `Dura ${formatDuration(duration)} y el máximo es ${formatDuration(MAX_VIDEO_SECONDS)}. Recórtalo en la galería del móvil y vuelve a añadirlo.`,
    )

  const original: Prepared = { blob: file, name: file.name, originalSize: file.size, compressed: false, duration }
  if (file.size <= COMPRESS_VIDEO_OVER_MB * MB) return original

  // Tamaño de salida: lado largo a 1280 px como mucho, manteniendo la proporción
  const landscape = track.displayWidth >= track.displayHeight
  const longSide = landscape ? track.displayWidth : track.displayHeight
  const target = Math.min(VIDEO_LONG_SIDE, longSide)
  const size = landscape ? { width: even(target) } : { height: even(target) }
  const ratio = track.displayHeight / track.displayWidth
  const outW = landscape ? even(target) : even(target / ratio)
  const outH = landscape ? even(target * ratio) : even(target)

  const canCompress = await canEncodeVideo('avc', { width: outW, height: outH, frameRate: 30 }).catch(() => false)
  if (!canCompress) {
    if (file.size <= MAX_UPLOAD_MB * MB) return original
    throw new PrepareError(
      'no-se-puede-comprimir',
      `Ocupa ${formatMB(file.size)} y este navegador no puede comprimir vídeo. Ábrelo desde Chrome o grábalo a menos resolución.`,
    )
  }

  onInfo?.({ duration, estimatedBytes: Math.min(file.size, estimateVideoBytes(duration)) })

  const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() })
  const conversion = await Conversion.init({
    input,
    output,
    tracks: 'primary',
    video: { ...size, codec: 'avc', bitrate: VIDEO_BITRATE, frameRate: 30 },
    // El audio se copia tal cual si cabe en MP4 (no hace falta recomprimirlo)
  })
  if (!conversion.isValid) {
    if (file.size <= MAX_UPLOAD_MB * MB) return original
    throw new PrepareError('no-se-puede-comprimir', `Ocupa ${formatMB(file.size)} y no se ha podido comprimir en este móvil.`)
  }

  const onAbort = () => conversion.cancel()
  signal?.addEventListener('abort', onAbort)
  conversion.onProgress = (p) => onProgress(Math.min(1, p))
  try {
    await conversion.execute()
  } catch (e) {
    if (signal?.aborted) throw new PrepareError('cancelado', 'Cancelado')
    console.error(e)
    if (file.size <= MAX_UPLOAD_MB * MB) return original
    throw new PrepareError('no-se-puede-comprimir', `Ocupa ${formatMB(file.size)} y la compresión ha fallado en este móvil.`)
  } finally {
    signal?.removeEventListener('abort', onAbort)
  }

  const blob = new Blob([output.target.buffer!], { type: 'video/mp4' })
  if (blob.size >= file.size && file.size <= MAX_UPLOAD_MB * MB) return original
  if (blob.size > MAX_UPLOAD_MB * MB)
    throw new PrepareError('muy-grande', `Incluso comprimido ocupa ${formatMB(blob.size)} y el máximo es ${MAX_UPLOAD_MB} MB. Recórtalo un poco.`)
  return { blob, name: `${baseName(file.name)}.mp4`, originalSize: file.size, compressed: true, duration }
}

export async function prepareImage(file: File): Promise<Prepared> {
  const original: Prepared = { blob: file, name: file.name, originalSize: file.size, compressed: false }
  // GIF (animación) y fotos ya ligeras se suben tal cual
  if (file.type === 'image/gif' || file.size < 600 * 1024) return checkSize(original)
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const scale = Math.min(1, IMAGE_LONG_SIDE / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', IMAGE_QUALITY))
    if (!blob || blob.size >= file.size) return checkSize(original)
    return { blob, name: `${baseName(file.name)}.jpg`, originalSize: file.size, compressed: true }
  } catch {
    return checkSize(original)
  }
}

function checkSize(p: Prepared) {
  if (p.blob.size > MAX_UPLOAD_MB * MB) throw new PrepareError('muy-grande', `Ocupa ${formatMB(p.blob.size)} y el máximo es ${MAX_UPLOAD_MB} MB.`)
  return p
}
