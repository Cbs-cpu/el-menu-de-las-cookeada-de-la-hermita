import { createClient } from '@supabase/supabase-js'

// Proyecto de Supabase de la ermita. La clave "publishable" es pública por diseño
// (va dentro de la web); lo que protege los datos son las políticas de supabase/*.sql,
// que solo dejan leer y escribir a usuarios con sesión iniciada.
// Se pueden sobrescribir con VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.
const URL_ = import.meta.env.VITE_SUPABASE_URL || 'https://wpkeqearxhbwilutnzxx.supabase.co'
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_bx9wDK7LWrt9OyDfHDyx1A_HRjiJVGW'

export const supabase = createClient(URL_, KEY)
