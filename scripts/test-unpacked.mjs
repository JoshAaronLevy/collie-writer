import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
const candidates =
  process.platform === 'darwin'
    ? [
        `dist/mac${process.arch === 'arm64' ? '-arm64' : ''}/Collie Writer.app/Contents/MacOS/Collie Writer`
      ]
    : process.platform === 'win32'
      ? ['dist/win-unpacked/collie-writer-dev.exe']
      : []
const artifact = candidates.find(existsSync)
if (!artifact) throw new Error('Build the native unpacked development artifact first.')
const result = spawnSync(
  process.execPath,
  ['node_modules/@playwright/test/cli.js', 'test', '--project=desktop'],
  {
    stdio: 'inherit',
    env: { ...process.env, COLLIE_DESKTOP_EXECUTABLE: resolve(artifact) }
  }
)
process.exit(result.status ?? 1)
