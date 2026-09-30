import { lstatSync, readFileSync, realpathSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'

// Both startup and cleanup use this guard. No normal profile may be supplied as a fixture.
export function validateTestRoot(root: string, token: string): string {
  const resolved = resolve(root)
  if (
    !/^[a-f0-9]{64}$/.test(token) ||
    !/^collie-writer-test-[A-Za-z0-9]+$/.test(basename(resolved))
  )
    throw new Error('Unsafe test root')
  if (
    lstatSync(resolved).isSymbolicLink() ||
    realpathSync(dirname(resolved)) !== realpathSync(tmpdir())
  )
    throw new Error('Unsafe test root')
  const marker = join(resolved, '.collie-test-owner')
  if (lstatSync(marker).isSymbolicLink() || readFileSync(marker, 'utf8') !== token)
    throw new Error('Unowned test root')
  for (const child of ['profile', 'session', 'logs', 'crashes']) {
    try {
      if (lstatSync(join(resolved, child)).isSymbolicLink()) throw new Error('Unsafe test child')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }
  return realpathSync(resolved)
}
