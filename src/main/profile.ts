import { app } from 'electron'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { RELEASE } from './release'
import { validateTestRoot } from './test-root'

export function configureProfile(): boolean {
  const root = process.env.COLLIE_TEST_ROOT
  const token = process.env.COLLIE_TEST_TOKEN
  if (!!root !== !!token) throw new Error('Incomplete test profile configuration')
  // Stage 1 stores Chromium preferences only. Verified device-local working storage belongs to Stage 4.
  const base =
    root && token ? validateTestRoot(root, token) : join(app.getPath('appData'), RELEASE.appId)
  for (const child of ['profile', 'session', 'logs', 'crashes'])
    mkdirSync(join(base, child), { recursive: true })
  app.setPath('userData', join(base, 'profile'))
  app.setPath('sessionData', join(base, 'session'))
  app.setPath('crashDumps', join(base, 'crashes'))
  app.setAppLogsPath(join(base, 'logs'))
  return !!root
}
