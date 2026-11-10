import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const target = process.env.TALENTO_API_TARGET || 'http://127.0.0.1:8000'
const proxy = Object.fromEntries([
  '/api', '/documentos', ...['incapacidad', 'viatico', 'compensatorio', 'vacaciones'].map((kind) => `/modulos/${kind}/reporte`),
].map((path) => [path, { target, changeOrigin: false }]))

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: 'localhost',
    strictPort: true,
    proxy,
  },
  preview: { host: 'localhost', strictPort: true, proxy },
})
