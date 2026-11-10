import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: false,
      },
      '/documentos': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: false,
      },
      '/modulos/incapacidad/reporte': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: false,
      },
      '/modulos/viatico/reporte': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: false,
      },
      '/modulos/compensatorio/reporte': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: false,
      },
      '/modulos/vacaciones/reporte': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: false,
      },
    },
  },
})
