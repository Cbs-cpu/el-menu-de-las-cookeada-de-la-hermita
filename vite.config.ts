import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // MapLibre 6 carga su worker por URL relativa; el pre-bundling de Vite la rompe.
  optimizeDeps: { exclude: ['maplibre-gl'] },
})
