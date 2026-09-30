import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {},
  preload: {
    build: {
      externalizeDeps: false,
      rollupOptions: { output: { format: 'cjs', inlineDynamicImports: true } }
    }
  },
  renderer: {
    resolve: { alias: { '@renderer': resolve('src/renderer/src') } },
    server: { host: '127.0.0.1', port: 5173, strictPort: true },
    plugins: [react()]
  }
})
