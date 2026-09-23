import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: { '/api': { target: 'http://localhost:5050', changeOrigin: true } },
  },
  build: {
    // There used to be a manualChunks entry naming three, @react-three/fiber and
    // @react-three/drei as one chunk. Fiber depends on React, so Rollup resolved
    // React and react-dom into that chunk too, which made a 304 kB gzip bundle a
    // hard dependency of every route: /disclaimer was issuing a modulepreload for
    // three.js in order to get React. Routes and diagrams now load through dynamic
    // imports, so Rollup works the split out from the real graph instead.
    rollupOptions: {},
  },
})
