import { defineConfig } from 'vitest/config'
export default defineConfig({
  esbuild: { jsx: 'automatic' },
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/renderer/**/*.test.tsx'],
    setupFiles: ['tests/fixtures/no-network.ts'],
    environment: 'node'
  }
})
