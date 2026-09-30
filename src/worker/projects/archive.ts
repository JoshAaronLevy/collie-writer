import { ZipFile as ZipWriter } from 'yazl'
import { openPromise, type Entry, type ZipFile } from 'yauzl'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, readFile, lstat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import { contained, syncDirectory, syncFile } from '../storage/files'
import { LIMITS, SnapshotError, cancelled, entriesFor, readManifest, type SnapshotManifest, type BlobRef } from './manifest'
import { citationProfile, validateCitationFile } from './citation-assets'
import { inspectPortableDatabase } from './portable-db'
import { requireSpace, transfer, type Progress } from './streams'

const invalid = (): never => { throw new SnapshotError('INVALID_ARCHIVE') }
const same = (a: BlobRef, b: BlobRef): boolean => a.bytes === b.bytes && a.sha256 === b.sha256
export type ArchiveFile = { name: string; path: string; ref: BlobRef }

/** Call only with an app-owned new staging filename and leased immutable source files. */
export async function writeArchive(path: string, manifest: SnapshotManifest, files: ArchiveFile[], signal?: AbortSignal, progress?: Progress): Promise<void> {
  readManifest(manifest); citationProfile(manifest.citationAssets); cancelled(signal)
  const expected = entriesFor(manifest)
  if (files.length !== expected.size || new Set(files.map(f => f.name)).size !== files.length || files.some(f => !expected.has(f.name) || !same(expected.get(f.name)!, f.ref))) invalid()
  const json = Buffer.from(JSON.stringify(manifest))
  if (json.length > LIMITS.manifest) throw new SnapshotError('LIMIT_EXCEEDED')
  // Stored entries bound growth, avoid recompressing PDFs/images, and support predictable preflight.
  await requireSpace(dirname(path), json.length + files.reduce((n,f) => n + f.ref.bytes + 512, 0))
  const zip = new ZipWriter(), output = zip.outputStream as Readable
  const sources = new Set<Readable>()
  zip.on('error', (error: Error) => { output.destroy(error) })
  const writing = pipeline(output, createWriteStream(path, { flags: 'wx', mode: 0o600 }), { signal })
  // Attach immediately; construction errors must not leave an unhandled pipeline rejection.
  void writing.catch(() => {})
  try {
    zip.addBuffer(json, 'manifest.json', { compress: false, mode: 0o100600 })
    for (const file of files) {
      zip.addReadStreamLazy(file.name, { compress: false, size: file.ref.bytes, mode: 0o100600 }, callback => {
        if (signal?.aborted) { callback(new SnapshotError('CANCELLED'), Readable.from([])); return }
        const input = createReadStream(file.path)
        sources.add(input)
        input.on('data', (chunk: Buffer) => progress?.(chunk.length))
        input.once('close', () => sources.delete(input))
        callback(null, input)
      })
    }
    zip.end({ forceZip64Format: true, comment: '' })
    await writing
    await syncFile(path); await syncDirectory(dirname(path))
  } catch (error) {
    output.destroy(); for (const source of sources) source.destroy()
    await writing.catch(() => {})
    cancelled(signal); throw error
  }
}

async function inventory(zip: ZipFile, signal?: AbortSignal): Promise<Map<string, Entry>> {
  if (zip.entryCount > LIMITS.entries || zip.comment !== '') invalid()
  const entries = new Map<string, Entry>(), folded = new Set<string>()
  let total = 0
  for await (const entry of zip.eachEntry()) {
    cancelled(signal)
    const name = entry.fileName, mode = entry.externalFileAttributes >>> 16
    if (!/^(manifest\.json|project\.sqlite|blobs\/[a-f0-9]{64}|citation-assets\/[a-f0-9]{64})$/.test(name) || folded.has(name.toLowerCase()) || entries.size >= LIMITS.entries) invalid()
    if ((mode & 0o170000) !== 0o100000 || (mode & 0o7111) !== 0 || (entry.externalFileAttributes & 0x10) !== 0 || entry.isEncrypted() || ![0,8].includes(entry.compressionMethod) || entry.fileCommentLength !== 0 || entry.extraFieldLength > 64 || entry.extraFields.some(f => ![0x0001,0x5455].includes(f.id))) invalid()
    const maximum = name === 'manifest.json' ? LIMITS.manifest : name === 'project.sqlite' ? LIMITS.database : name.startsWith('blobs/') ? LIMITS.blob : LIMITS.citation
    if (!Number.isSafeInteger(entry.uncompressedSize) || entry.uncompressedSize < 0 || entry.uncompressedSize > maximum || !Number.isSafeInteger(entry.compressedSize) || entry.compressedSize < 0) throw new SnapshotError('LIMIT_EXCEEDED')
    total += entry.uncompressedSize
    if (total > LIMITS.expanded) throw new SnapshotError('LIMIT_EXCEEDED')
    entries.set(name, entry); folded.add(name.toLowerCase())
  }
  if (!entries.has('manifest.json') || !entries.has('project.sqlite')) invalid()
  return entries
}

/** Extract to a newly-created private directory. Never use archive names as arbitrary paths. */
export async function extractArchive(path: string, staging: string, nativeBinding?: string, signal?: AbortSignal, progress?: Progress): Promise<SnapshotManifest> {
  cancelled(signal)
  const source = await lstat(path)
  if (!source.isFile() || source.isSymbolicLink() || source.size > LIMITS.expanded + LIMITS.entries * 512) invalid()
  await mkdir(staging, { mode: 0o700 }) // Must not exist; caller owns its parent and any later cleanup.
  const zip = await openPromise(path, { autoClose: false, lazyEntries: true, decodeStrings: true, strictFileNames: true, validateEntrySizes: true })
  let archiveError: Error | undefined
  const streams = new Set<Readable>()
  const fail = (error: Error): void => { archiveError = error; for (const stream of streams) stream.destroy(error) }
  zip.on('error', fail)
  const abort = (): void => { zip.emit('error', new SnapshotError('CANCELLED')); zip.close() }
  signal?.addEventListener('abort', abort, { once: true })
  const read = async (entry: Entry, target: string, expected?: BlobRef): Promise<void> => {
    cancelled(signal)
    if (archiveError) throw archiveError
    const stream = await zip.openReadStreamPromise(entry)
    streams.add(stream)
    try {
      const actual = await transfer(stream, target, entry.uncompressedSize, signal, progress, entry.crc32)
      if (actual.bytes !== entry.uncompressedSize || (expected && !same(actual, expected))) invalid()
    } finally { stream.destroy(); streams.delete(stream) }
  }
  try {
    const entries = await inventory(zip, signal)
    await requireSpace(staging, [...entries.values()].reduce((n,e) => n + e.uncompressedSize, 0))
    await read(entries.get('manifest.json')!, join(staging, 'manifest.json'))
    const manifest = readManifest(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await readFile(join(staging, 'manifest.json')))))
    citationProfile(manifest.citationAssets)
    const expected = entriesFor(manifest)
    if (entries.size !== expected.size + 1) invalid()
    for (const [name, ref] of expected) if (entries.get(name)?.uncompressedSize !== ref.bytes) invalid()
    await mkdir(join(staging, 'blobs'), { mode: 0o700 })
    await mkdir(join(staging, 'citation-assets'), { mode: 0o700 })
    for (const [name, ref] of expected) await read(entries.get(name)!, join(staging, name), ref)
    for (const ref of manifest.citationAssets) await validateCitationFile(join(staging, 'citation-assets', ref.sha256), ref, signal)
    cancelled(signal)
    const graph = inspectPortableDatabase(join(staging, 'project.sqlite'), nativeBinding)
    const manifestBlobs = new Map(manifest.blobs.map(ref => [ref.sha256,ref]))
    if (graph.projectId !== manifest.projectId || graph.headCommitId !== manifest.headCommitId || graph.blobs.length !== manifest.blobs.length || graph.blobs.some(ref => !manifestBlobs.has(ref.sha256) || !same(manifestBlobs.get(ref.sha256)!, ref))) invalid()
    if (archiveError) throw archiveError
    await contained(staging, join(staging, 'project.sqlite'), false)
    await syncDirectory(join(staging, 'blobs')); await syncDirectory(join(staging, 'citation-assets')); await syncDirectory(staging)
    return manifest
  } catch (error) { cancelled(signal); throw error }
  finally { signal?.removeEventListener('abort', abort); zip.close() }
}
