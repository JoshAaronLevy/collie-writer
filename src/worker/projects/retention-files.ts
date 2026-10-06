import {
  constants,
  lstatSync,
  openSync,
  closeSync,
  fstatSync,
  readSync,
  type BigIntStats
} from 'node:fs'
import { dirname } from 'node:path'
import { createHash } from 'node:crypto'
import { open, opendir } from 'node:fs/promises'
import { ProjectError } from '../../domain/projects/errors'
import { exact, record } from '../../shared/projects'
export type RetentionStamp = {
  dev: string
  ino: string
  size: number
  mtime: string
  ctime: string
}
export function stamp(info: BigIntStats): RetentionStamp {
  if (
    !info.isFile() ||
    info.isSymbolicLink() ||
    info.nlink !== 1n ||
    !info.ino ||
    info.size < 0n ||
    info.size > BigInt(Number.MAX_SAFE_INTEGER)
  )
    throw new ProjectError('DENIED')
  return {
    dev: String(info.dev),
    ino: String(info.ino),
    size: Number(info.size),
    mtime: String(info.mtimeNs),
    ctime: String(info.ctimeNs)
  }
}
export function isRetentionStamp(v: unknown): v is RetentionStamp {
  return (
    record(v) &&
    exact(v, ['dev', 'ino', 'size', 'mtime', 'ctime']) &&
    ['dev', 'ino', 'mtime', 'ctime'].every(
      (k) => typeof v[k] === 'string' && /^-?\d{1,30}$/.test(v[k] as string)
    ) &&
    Number.isSafeInteger(v.size) &&
    Number(v.size) >= 0
  )
}
export const sameStamp = (a: RetentionStamp | null, b: RetentionStamp | null): boolean =>
  JSON.stringify(a) === JSON.stringify(b)
/** Capture all ancestor identities; never resolve a redirect into new deletion authority. */
export function parentStamp(path: string): string {
  const ids: string[] = []
  let current = dirname(path)
  for (let i = 0; i < 128; i++) {
    const info = lstatSync(current, { bigint: true })
    if (!info.isDirectory() || info.isSymbolicLink() || !info.ino) throw new ProjectError('DENIED')
    ids.push(`${current}:${info.dev}:${info.ino}`)
    const next = dirname(current)
    if (next === current) return createHash('sha256').update(JSON.stringify(ids)).digest('hex')
    current = next
  }
  throw new ProjectError('DENIED')
}
export function namedStamp(path: string): RetentionStamp | null {
  parentStamp(path)
  const info = lstatSync(path, { bigint: true, throwIfNoEntry: false })
  return info ? stamp(info) : null
}
export function boundedBytes(path: string, maximum: number): Buffer {
  const before = namedStamp(path)
  if (!before || before.size > maximum) throw new ProjectError('JOB_INTERRUPTED')
  const fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
  try {
    if (!sameStamp(before, stamp(fstatSync(fd, { bigint: true }))))
      throw new ProjectError('EXTERNAL_CHANGE')
    // Reading at most the observed length plus one keeps even externally growing records bounded.
    const storage = Buffer.alloc(before.size + 1)
    let read = 0
    while (read < storage.length) {
      const n = readSync(fd, storage, read, storage.length - read, read)
      if (!n) break
      read += n
    }
    const buffer = storage.subarray(0, read)
    if (
      buffer.length !== before.size ||
      buffer.length > maximum ||
      !sameStamp(before, stamp(fstatSync(fd, { bigint: true }))) ||
      !sameStamp(before, namedStamp(path))
    )
      throw new ProjectError('EXTERNAL_CHANGE')
    return buffer
  } finally {
    closeSync(fd)
  }
}
export function boundedJson(path: string, maximum: number): unknown {
  return JSON.parse(
    new TextDecoder('utf-8', { fatal: true }).decode(boundedBytes(path, maximum))
  ) as unknown
}

export async function retentionNames(folder: string, maximum: number): Promise<string[]> {
  parentStamp(`${folder}/entry`)
  const out: string[] = [],
    dir = await opendir(folder)
  for await (const entry of dir) {
    if (out.length >= maximum) throw new ProjectError('LIMIT_EXCEEDED')
    out.push(entry.name)
  }
  return out.sort()
}

export type PayloadProof = {
  path: string
  identity: RetentionStamp
  parent: string
  sha256: string
}
/** Bounded content read from one descriptor; never opens a SQLite connection or extracts files. */
export async function inspectRetentionPayload(
  path: string,
  maximum: number
): Promise<PayloadProof> {
  const identity = namedStamp(path),
    parent = parentStamp(path)
  if (!identity || identity.size > maximum) throw new ProjectError('LIMIT_EXCEEDED')
  const file = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
  try {
    if (!sameStamp(identity, stamp(await file.stat({ bigint: true }))))
      throw new ProjectError('EXTERNAL_CHANGE')
    const hash = createHash('sha256'),
      buffer = Buffer.alloc(128 * 1024)
    let position = 0
    while (position <= identity.size) {
      const { bytesRead } = await file.read(
        buffer,
        0,
        Math.min(buffer.length, identity.size + 1 - position),
        position
      )
      if (!bytesRead) break
      position += bytesRead
      if (position > identity.size) throw new ProjectError('EXTERNAL_CHANGE')
      hash.update(buffer.subarray(0, bytesRead))
    }
    if (
      position !== identity.size ||
      !sameStamp(identity, stamp(await file.stat({ bigint: true }))) ||
      !sameStamp(identity, namedStamp(path)) ||
      parent !== parentStamp(path)
    )
      throw new ProjectError('EXTERNAL_CHANGE')
    return { path, identity, parent, sha256: hash.digest('hex') }
  } finally {
    await file.close()
  }
}
