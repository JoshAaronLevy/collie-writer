import { lstat, mkdir, open, rename, realpath } from 'node:fs/promises'
import { dirname, join, relative, isAbsolute } from 'node:path'
import { randomUUID } from 'node:crypto'
import { ProjectError } from '../../domain/projects/errors'

export async function contained(root: string, path: string, directory: boolean): Promise<void> {
  const info = await lstat(path)
  const rel = relative(await realpath(root), await realpath(path))
  if (info.isSymbolicLink() || (directory ? !info.isDirectory() : !info.isFile() || info.nlink !== 1) || rel.startsWith('..') || isAbsolute(rel)) throw new ProjectError('DENIED')
}
export async function directory(root: string, path: string): Promise<void> {
  await contained(root, dirname(path), true)
  await mkdir(path, { mode: 0o700 }).catch(error => { if (error.code !== 'EEXIST') throw error })
  await contained(root, path, true)
}
export async function syncDirectory(path: string): Promise<void> {
  if (process.platform !== 'darwin') return // Windows SQLite flushes files; directory flush is not provided by Node.
  const file = await open(path, 'r')
  try { await file.sync() } finally { await file.close() }
}
export async function syncFile(path: string): Promise<void> {
  const file = await open(path, 'r+')
  try { await file.sync() } finally { await file.close() }
}
export async function writeJson(path: string, data: unknown): Promise<void> {
  const temporary = join(dirname(path), `.write-${randomUUID()}.json`)
  const file = await open(temporary, 'wx', 0o600)
  try { await file.writeFile(JSON.stringify(data)); await file.sync() } finally { await file.close() }
  await rename(temporary, path)
  await syncDirectory(dirname(path))
}
