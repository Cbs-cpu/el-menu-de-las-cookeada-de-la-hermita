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

Por ahora todo se guarda en el navegador (IndexedDB), fotos y vídeos incluidos.

## Desarrollo

```bash
npm install
npm run dev
```

Stack: Vite + React + TypeScript, MapLibre GL, Dexie (IndexedDB), Sonner.
