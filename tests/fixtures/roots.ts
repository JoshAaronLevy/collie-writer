import { randomBytes } from 'node:crypto'
import { mkdtempSync, writeFileSync, rmSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { validateTestRoot } from '../../src/main/test-root'
export function temporaryRoot(): { root: string; token: string; cleanup: () => void } {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'collie-writer-test-')))
  const token = randomBytes(32).toString('hex')
  writeFileSync(join(root, '.collie-test-owner'), token, { flag: 'wx', mode: 0o600 })
  return { root, token, cleanup: () => rmSync(validateTestRoot(root, token), { recursive: true }) }
}
