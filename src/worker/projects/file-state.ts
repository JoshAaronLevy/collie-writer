import { constants, type BigIntStats, type ReadStream } from 'node:fs'
import { lstat, open, readFile, realpath } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, sep } from 'node:path'
import { isId } from '../../domain/editor/schema'
import { ProjectError } from '../../domain/projects/errors'
import { exact, record, isDestination, type DestinationView } from '../../shared/projects'
import { contained, writeJson } from '../storage/files'
import { LIMITS, isHash } from './manifest'
import { transfer, type Progress } from './streams'

export const ARCHIVE_BYTES = LIMITS.expanded + LIMITS.manifest + LIMITS.entries * 512
export type Generation = {
  dev: string
  ino: string
  size: string
  mtime: string
  ctime: string
  sha256: string
}
export type SavedLocation = DestinationView & { fingerprint: Generation; grantId: string }
export function isGeneration(v: unknown): v is Generation {
  return (
    record(v) &&
    exact(v, ['dev', 'ino', 'size', 'mtime', 'ctime', 'sha256']) &&
    ['dev', 'ino', 'size', 'mtime', 'ctime'].every(
      (k) => typeof v[k] === 'string' && /^-?\d{1,30}$/.test(v[k] as string)
    ) &&
    isHash(v.sha256)
  )
}
export function sameGeneration(a: Generation | null, b: Generation | null): boolean {
  return a === null
    ? b === null
    : !!b &&
        a.dev === b.dev &&
        a.ino === b.ino &&
        a.size === b.size &&
        a.mtime === b.mtime &&
        a.ctime === b.ctime &&
        a.sha256 === b.sha256
}
/** Filesystem metadata may change without changing the saved project bytes. */
export function sameFileContents(a: Generation | null, b: Generation | null): boolean {
  return a === null ? b === null : !!b && a.size === b.size && a.sha256 === b.sha256
}
export function destinationView(value: SavedLocation | null): DestinationView | null {
  if (!value) return null
  const { path, snapshotId, headCommitId, generationId } = value
  return { path, snapshotId, headCommitId, generationId }
}
export function isSavedLocation(v: unknown): v is SavedLocation {
  if (
    !record(v) ||
    !exact(v, ['path', 'snapshotId', 'headCommitId', 'generationId', 'fingerprint', 'grantId'])
  )
    return false
  const { fingerprint, grantId, ...view } = v
  return isDestination(view) && isAbsolute(view.path) && isGeneration(fingerprint) && isId(grantId)
}
export async function readDestination(
  root: string,
  workspace: string
): Promise<SavedLocation | null> {
  const path = join(workspace, 'destination-v1.json')
  try {
    await contained(root, path, false)
    if ((await lstat(path)).size > 16384) throw new ProjectError('CORRUPT_PROJECT')
    const data: unknown = JSON.parse(await readFile(path, 'utf8'))
    if (
      !record(data) ||
      !exact(data, ['version', 'destination']) ||
      data.version !== 1 ||
      !isSavedLocation(data.destination)
    )
      throw new ProjectError('CORRUPT_PROJECT')
    return data.destination
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')
      return null
    throw error
  }
}
export async function writeDestination(
  workspace: string,
  destination: SavedLocation
): Promise<void> {
  if (!isSavedLocation(destination)) throw new ProjectError('VALIDATION')
  await writeJson(join(workspace, 'destination-v1.json'), { version: 1, destination })
}
export async function selectedPath(root: string, path: string): Promise<string> {
  if (
    !isAbsolute(path) ||
    path.length > 4000 ||
    /[\x00-\x1f]/.test(path) ||
    !/\.collie$/i.test(path)
  )
    throw new ProjectError('DENIED')
  if (process.platform === 'win32' && (path.startsWith('\\\\') || /[:]/.test(path.slice(2))))
    throw new ProjectError('UNSAFE_DESTINATION')
  const parent = await realpath(dirname(path))
  // The native picker grants one resolved filename, never access to working storage.
  const resolved = join(parent, basename(path))
  const rel = relative(await realpath(root), resolved)
  if (!rel || (rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel)))
    throw new ProjectError('DENIED')
  return resolved
}
/** Observe bytes from one opened regular file; stamps alone never establish a generation. */
export async function observe(
  path: string,
  signal?: AbortSignal,
  progress?: Progress,
  copyTo?: string
): Promise<Generation | null> {
  let before: BigIntStats
  try {
    before = await lstat(path, { bigint: true })
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')
      return null
    throw error
  }
  if (
    !before.isFile() ||
    before.isSymbolicLink() ||
    before.nlink !== 1n ||
    before.size > BigInt(ARCHIVE_BYTES)
  )
    throw new ProjectError('INVALID_ARCHIVE')
  const file = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
  let input: ReadStream | undefined
  try {
    const first = await file.stat({ bigint: true })
    if (
      !first.isFile() ||
      first.nlink !== 1n ||
      first.ino !== before.ino ||
      first.dev !== before.dev
    )
      throw new ProjectError('EXTERNAL_CHANGE')
    input = file.createReadStream({ autoClose: false })
    const hash = await transfer(input, copyTo ?? null, ARCHIVE_BYTES, signal, progress)
    const last = await file.stat({ bigint: true }),
      named = await lstat(path, { bigint: true })
    if (
      last.size !== first.size ||
      last.mtimeNs !== first.mtimeNs ||
      last.ctimeNs !== first.ctimeNs ||
      named.ino !== first.ino ||
      named.dev !== first.dev ||
      named.size !== first.size ||
      named.mtimeNs !== first.mtimeNs ||
      named.ctimeNs !== first.ctimeNs ||
      named.isSymbolicLink() ||
      hash.bytes !== Number(first.size)
    )
      throw new ProjectError('EXTERNAL_CHANGE')
    return {
      dev: first.dev.toString(),
      ino: first.ino.toString(),
      size: first.size.toString(),
      mtime: first.mtimeNs.toString(),
      ctime: first.ctimeNs.toString(),
      sha256: hash.sha256
    }
  } finally {
    input?.destroy()
    await file.close()
  }
}
