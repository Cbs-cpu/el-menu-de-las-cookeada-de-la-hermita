# El menú de cookeadas de la ermita 🦀

App web de la ermita. Va por secciones; la primera es:

## Conchas para ermitaños

Un mapa del mundo real en modo oscuro donde guardar **spots** (aquí los llamamos *conchas*):

- Mapa vectorial del mundo entero (OpenStreetMap + CARTO), con vista satélite (Esri).
- Buscador de sitios y direcciones (Photon/OSM) y de tus propias conchas.
- Toca el mapa o pulsa **Nueva concha** para dejar un spot; puedes arrastrarlo para afinar.
- Cada concha tiene nombre, valoración de 1 a 5 estrellas, reseña/notas, fotos y vídeos y un color de concha.
- Ficha con galería y visor a pantalla completa, "Cómo llegar", copiar coordenadas, editar y eliminar.
- Lista de conchas ordenable por recientes o mejor valoradas.
- Funciona en móvil (hoja inferior) y escritorio (panel lateral).

Las conchas, fotos y vídeos se guardan en Supabase y se ven al momento en todos los dispositivos.

## Fotos y vídeos

- Los vídeos se comprimen en el propio móvil antes de subirse (720p, ~2 Mbps, con WebCodecs vía
  `mediabunny`): 30 s de vídeo del móvil (~90 MB) quedan en ~8 MB. Máximo 3 minutos.
- Las fotos se reducen a 2048 px en JPEG (~0,5 MB).
- La subida es reanudable (TUS, trozos de 6 MB): si se corta la conexión, sigue por donde iba.
- Límite del plan gratis de Supabase: 50 MB por archivo y 1 GB en total.

## Cuentas

Para usar la app hay que entrar con usuario y contraseña. Para crear una cuenta hay que pasar
**la prueba del mago**: preguntas de "¿Es pensaukas?" con Sí/No. Las preguntas están en
`src/lib/wizard.ts`.

## Supabase

1. SQL Editor: ejecutar `supabase/schema.sql` y después `supabase/auth.sql`.
2. Authentication → Sign In / Providers → Email: desactivar **Confirm email**
   (las cuentas usan emails internos `usuario@hermita.app`).

## Desarrollo

```bash
npm install
npm run dev
```

Stack: Vite + React + TypeScript, MapLibre GL, Dexie (IndexedDB), Sonner.
