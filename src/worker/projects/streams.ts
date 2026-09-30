import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { statfs, lstat } from 'node:fs/promises'
import { Transform, Writable, type Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { crc32 } from 'node:zlib'
import { LIMITS, SnapshotError, cancelled, type BlobRef } from './manifest'
import { syncFile } from '../storage/files'

export type Progress = (bytes: number) => void
export async function requireSpace(directory: string, bytes: number): Promise<void> {
  const info = await statfs(directory, { bigint: true })
  if (!Number.isSafeInteger(bytes) || bytes < 0 || info.bavail * info.bsize < BigInt(bytes + LIMITS.margin)) throw new SnapshotError('DISK_FULL')
}
export class HashMeter extends Transform {
  private readonly hash = createHash('sha256')
  bytes = 0
  crc = 0
  constructor(private readonly maximum: number, private readonly progress: Progress = () => {}, private readonly checkCrc = false) { super() }
  override _transform(chunk: Buffer, _encoding: BufferEncoding, done: (error?: Error | null, data?: Buffer) => void): void {
    this.bytes += chunk.length
    if (this.bytes > this.maximum) { done(new SnapshotError('LIMIT_EXCEEDED')); return }
    try { this.hash.update(chunk); if (this.checkCrc) this.crc = crc32(chunk, this.crc); this.progress(chunk.length); done(null, chunk) }
    catch (error) { done(error instanceof Error ? error : new SnapshotError('UNAVAILABLE')) }
  }
  result(): BlobRef { return { bytes: this.bytes, sha256: this.hash.digest('hex') } }
}
export async function transfer(input: Readable, destination: string | null, maximum: number, signal?: AbortSignal, progress?: Progress, expectedCrc?: number): Promise<BlobRef> {
  if (signal?.aborted) { input.destroy(); cancelled(signal) }
  const meter = new HashMeter(maximum, progress, expectedCrc !== undefined)
  const output = destination ? createWriteStream(destination, { flags: 'wx', mode: 0o600 }) : new Writable({ write(_chunk, _encoding, done) { done() } })
  try {
    await pipeline(input, meter, output, { signal })
    if (expectedCrc !== undefined && meter.crc !== expectedCrc) throw new SnapshotError('INVALID_ARCHIVE')
    if (destination) await syncFile(destination)
    return meter.result()
  } catch (error) { cancelled(signal); throw error }
}
export async function fileHash(path: string, maximum: number, signal?: AbortSignal, progress?: Progress): Promise<BlobRef> {
  const info = await lstat(path)
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.size > maximum) throw new SnapshotError('INVALID_ARCHIVE')
  return transfer(createReadStream(path), null, maximum, signal, progress)
}
