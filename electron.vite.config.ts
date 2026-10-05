import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    build: {
      externalizeDeps: {
        include: [
          'better-sqlite3',
          '@citation-js/core',
          '@citation-js/plugin-bibtex',
          '@citation-js/plugin-ris',
          'electron-updater',
          'js-yaml'
        ]
      }
    }
  },
  preload: {
    build: {
      externalizeDeps: false,
      rollupOptions: { output: { format: 'cjs', inlineDynamicImports: true } }
    }
  },
  renderer: {
    publicDir: resolve('src/renderer/public'),
    resolve: { alias: { '@renderer': resolve('src/renderer/src') } },
    server: { host: '127.0.0.1', port: 5173, strictPort: true },
    plugins: [react()]
  }
})
