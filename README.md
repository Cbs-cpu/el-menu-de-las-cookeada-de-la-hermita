# El menú de cookeadas de la hermita 🦀

App web de la hermita. Va por secciones; la primera es:

## Conchas para hermitaños

Un mapa del mundo real en modo oscuro donde guardar **spots** (aquí los llamamos *conchas*):

- Mapa vectorial del mundo entero (OpenStreetMap + CARTO), con vista satélite (Esri).
- Buscador de sitios y direcciones (Photon/OSM) y de tus propias conchas.
- Toca el mapa o pulsa **Nueva concha** para dejar un spot; puedes arrastrarlo para afinar.
- Cada concha tiene nombre, valoración de 1 a 5 estrellas, reseña/notas, fotos y vídeos y un color de concha.
- Ficha con galería y visor a pantalla completa, "Cómo llegar", copiar coordenadas, editar y eliminar.
- Lista de conchas ordenable por recientes o mejor valoradas.
- Funciona en móvil (hoja inferior) y escritorio (panel lateral).

Las conchas, fotos y vídeos se guardan en Supabase y se ven al momento en todos los dispositivos.

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
