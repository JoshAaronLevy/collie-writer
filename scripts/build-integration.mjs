import { build } from 'vite'
await build({
  configFile: false,
  build: {
    outDir: 'out-tests',
    target: 'node24',
    minify: false,
    lib: {
      entry: 'tests/fixtures/integration-main.ts',
      formats: ['cjs'],
      fileName: () => 'integration.cjs'
    },
    rollupOptions: { external: (id) => id === 'electron' || id.startsWith('node:') }
  }
})
