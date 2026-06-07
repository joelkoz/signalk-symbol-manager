import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The compiled UI is served by Signal K Server from `public/` at
// `/signalk-symbol-manager/`, so every emitted asset URL must carry that base
// path in a production build. In dev (`vite`) we serve from `/` and proxy the
// plugin API + asset routes to a locally running Signal K server, so the same
// app code (which calls absolute `/plugins/...` and `/signalk/...` paths) works
// unchanged.
export default defineConfig(({ command }) => ({
  root: 'web',
  base: command === 'build' ? '/signalk-symbol-manager/' : '/',
  plugins: [react()],
  build: {
    outDir: '../public',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1500
  },
  server: {
    proxy: {
      '/plugins': 'http://localhost:3000',
      '/signalk': 'http://localhost:3000'
    }
  }
}))
