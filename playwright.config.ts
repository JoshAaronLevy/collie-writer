import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  reporter: 'list',
  outputDir: 'test-results',
  projects: [
    { name: 'integration', testDir: './tests/integration' },
    { name: 'desktop', testDir: './tests/desktop' }
  ]
})
