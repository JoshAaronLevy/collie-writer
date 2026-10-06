import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { statfs, lstat } from 'node:fs/promises'
import { Transform, Writable, type Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { crc32 } from 'node:zlib'
import { LIMITS, SnapshotError, cancelled, type BlobRef } from './manifest'
import { syncFile } from '../storage/files'
import { AsyncLocalStorage } from 'node:async_hooks'
import { isSpaceIssue, type SpaceIssue } from '../../shared/storage-space'
import { dirname, isAbsolute } from 'node:path'
import { hasControlCharacters } from '../../shared/control-characters'

export type Progress = (bytes: number) => void
type Budget = {
  operation: string
  path: string
  active: boolean
  volumes: Map<string, bigint>
}
const context = new AsyncLocalStorage<Budget>()
const budgets = new Set<Budget>()
export function errorSpace(error: unknown, operation: string, path: string): SpaceIssue | null {
  if (error && typeof error === 'object') {
    if ('space' in error && isSpaceIssue(error.space)) return error.space
    const code = 'code' in error ? String(error.code) : ''
    if (code === 'DISK_FULL' || code === 'ENOSPC' || code.startsWith('SQLITE_FULL'))
      return {
        operation,
        path:
          'path' in error &&
          typeof error.path === 'string' &&
          error.path.length <= 4096 &&
          isAbsolute(error.path) &&
          !hasControlCharacters(error.path)
            ? dirname(error.path)
            : path,
        required: null,
        available: null,
        reserved: 0,
        reason: 'write-failed'
      }
  }
  return null
}
/** Reservations cover only this worker's cooperating jobs, and last until their work settles. */
export async function withSpaceBudget<T>(
  operation: string,
  path: string,
  work: () => Promise<T>
): Promise<T> {
  const budget: Budget = { operation, path, active: true, volumes: new Map() }
  budgets.add(budget)
  try {
    return await context.run(budget, work)
  } catch (error) {
    const space = errorSpace(error, operation, path)
    if (space && !(error instanceof SnapshotError)) throw new SnapshotError('DISK_FULL', space)
    throw error
  } finally {
    budget.active = false
    budgets.delete(budget)
  }
}
export async function requireSpace(directory: string, bytes: number): Promise<void> {
  if (!Number.isSafeInteger(bytes) || bytes < 0 || !Number.isSafeInteger(bytes + LIMITS.margin))
    throw new SnapshotError('LIMIT_EXCEEDED')
  const budget = context.getStore()
  const issue: SpaceIssue = {
    operation: budget?.operation ?? 'File preparation',
    path: directory,
    required: bytes + LIMITS.margin,
    available: null,
    reserved: 0,
    reason: 'unknown'
  }
  let device: string, available: bigint
  try {
    const before = await lstat(directory, { bigint: true })
    const info = await statfs(directory, { bigint: true })
    const after = await lstat(directory, { bigint: true })
    if (
      !before.isDirectory() ||
      before.isSymbolicLink() ||
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      info.bavail < 0n ||
      info.bsize <= 0n ||
      info.bavail > info.blocks
    )
      throw new Error('capacity')
    device = String(before.dev)
    available = info.bavail * info.bsize
    if (available > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('capacity')
  } catch {
    throw new SnapshotError('UNAVAILABLE', issue)
  }
  let reserved = 0n
  for (const other of budgets) if (other !== budget) reserved += other.volumes.get(device) ?? 0n
  issue.available = Number(available)
  issue.reserved = Number(
    reserved > BigInt(Number.MAX_SAFE_INTEGER) ? BigInt(Number.MAX_SAFE_INTEGER) : reserved
  )
  const required = BigInt(issue.required!)
  if (available < required + reserved) {
    issue.reason = 'insufficient'
    throw new SnapshotError('DISK_FULL', issue)
  }
  // Retain the peak per-volume estimate; never add the same staging bytes twice.
  if (budget?.active)
    budget.volumes.set(
      device,
      required > (budget.volumes.get(device) ?? 0n) ? required : budget.volumes.get(device)!
    )
}
export class HashMeter extends Transform {
  private readonly hash = createHash('sha256')
  bytes = 0
  crc = 0
  constructor(
    private readonly maximum: number,
    private readonly progress: Progress = () => {},
    private readonly checkCrc = false
  ) {
    super()
  }
  override _transform(
    chunk: Buffer,
    _encoding: BufferEncoding,
    done: (error?: Error | null, data?: Buffer) => void
  ): void {
    this.bytes += chunk.length
    if (this.bytes > this.maximum) {
      done(new SnapshotError('LIMIT_EXCEEDED'))
      return
    }
    try {
      this.hash.update(chunk)
      if (this.checkCrc) this.crc = crc32(chunk, this.crc)
      this.progress(chunk.length)
      done(null, chunk)
    } catch (error) {
      done(error instanceof Error ? error : new SnapshotError('UNAVAILABLE'))
    }
  }
  result(): BlobRef {
    return { bytes: this.bytes, sha256: this.hash.digest('hex') }
  }
}
export async function transfer(
  input: Readable,
  destination: string | null,
  maximum: number,
  signal?: AbortSignal,
  progress?: Progress,
  expectedCrc?: number
): Promise<BlobRef> {
  if (signal?.aborted) {
    input.destroy()
    cancelled(signal)
  }
  const meter = new HashMeter(maximum, progress, expectedCrc !== undefined)
  const output = destination
    ? createWriteStream(destination, { flags: 'wx', mode: 0o600 })
    : new Writable({
        write(_chunk, _encoding, done) {
          done()
        }
      })
  try {
    await pipeline(input, meter, output, { signal })
    if (expectedCrc !== undefined && meter.crc !== expectedCrc)
      throw new SnapshotError('INVALID_ARCHIVE')
    if (destination) await syncFile(destination)
    return meter.result()
  } catch (error) {
    cancelled(signal)
    throw error
  }
}
export async function fileHash(
  path: string,
  maximum: number,
  signal?: AbortSignal,
  progress?: Progress
): Promise<BlobRef> {
  const info = await lstat(path)
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.size > maximum)
    throw new SnapshotError('INVALID_ARCHIVE')
  return transfer(createReadStream(path), null, maximum, signal, progress)
}
