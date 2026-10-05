import { defineConfig } from 'eslint/config'
import tseslint from '@electron-toolkit/eslint-config-ts'
import eslintConfigPrettier from '@electron-toolkit/eslint-config-prettier'
import eslintPluginReact from 'eslint-plugin-react'
import eslintPluginReactHooks from 'eslint-plugin-react-hooks'
import eslintPluginReactRefresh from 'eslint-plugin-react-refresh'

export default defineConfig(
  {
    ignores: [
      '**/node_modules',
      '**/dist',
      '**/out',
      '**/out-tests',
      '**/.tools',
      '**/test-results',
      '**/output',
      '**/playwright-report',
      // Bundled upstream code, generated data and historical testing infrastructure.
      'resources/vendor/**',
      'resources/licenses/**',
      'src/renderer/public/pdfjs/**',
      'services/entitlements/runtime/**',
      'tests/**',
      'src/main/test-root.ts',
      'src/main/test-network.ts',
      'scripts/build-integration.mjs',
      'scripts/test-unpacked.mjs',
      'playwright.config.ts',
      'vitest.config.ts',
      '.github/disabled-workflows/**'
    ]
  },
  tseslint.configs.base,
  { files: ['**/*.{ts,tsx}'], extends: [tseslint.configs.recommended] },
  eslintPluginReact.configs.flat.recommended,
  eslintPluginReact.configs.flat['jsx-runtime'],
  {
    settings: {
      react: {
        version: 'detect'
      }
    }
  },
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': eslintPluginReactHooks,
      'react-refresh': eslintPluginReactRefresh
    },
    rules: {
      ...eslintPluginReactHooks.configs.recommended.rules,
      ...eslintPluginReactRefresh.configs.vite.rules
    }
  },
  {
    files: ['src/shared/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: ['electron', 'node:*', 'fs', 'path', '../main/*', '../preload/*'] }
      ]
    }
  },
  eslintConfigPrettier
)
