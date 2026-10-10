import { ZipFile as ZipWriter } from 'yazl'
import { openPromise, type Entry, type ZipFile } from 'yauzl'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, readFile, lstat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import { contained, syncDirectory, syncFile } from '../storage/files'
import {
  LIMITS,
  SnapshotError,
  cancelled,
  entriesFor,
  readManifest,
  type SnapshotManifest,
  type BlobRef
} from './manifest'
import { citationProfile, validateCitationFile } from './citation-assets'
import { inspectPortableDatabase } from './portable-db'
import { validateImportArtifactFiles } from './import-sessions'
import { requireSpace, transfer, type Progress } from './streams'
import { ARCHIVE_BYTES, archivePlan } from './archive-policy'

const invalid = (): never => {
  throw new SnapshotError('INVALID_ARCHIVE')
}
const same = (a: BlobRef, b: BlobRef): boolean => a.bytes === b.bytes && a.sha256 === b.sha256
export type ArchiveFile = { name: string; path: string; ref: BlobRef }

/** Call only with an app-owned new staging filename and leased immutable source files. */
export async function writeArchive(
  path: string,
  manifest: SnapshotManifest,
  files: ArchiveFile[],
  signal?: AbortSignal,
  progress?: Progress
): Promise<void> {
  const plan = archivePlan(manifest)
  cancelled(signal)
  const expected = entriesFor(manifest)
  if (
    files.length !== expected.size ||
    new Set(files.map((f) => f.name)).size !== files.length ||
    files.some((f) => !expected.has(f.name) || !same(expected.get(f.name)!, f.ref))
  )
    invalid()
  const byName = new Map(files.map((file) => [file.name, file]))
  await requireSpace(dirname(path), plan.maximumBytes)
  cancelled(signal)
  const zip = new ZipWriter(),
    output = zip.outputStream as Readable
  const sources = new Set<Readable>()
  const closing = new Set<Promise<void>>()
  let failure: Error | undefined
  zip.on('error', (error: Error) => {
    if (failure) return
    failure = error
    output.destroy(error)
    for (const source of sources) source.destroy(error)
  })
  const stop = (error: Error): void => {
    // Mark yazl errored as well as stopping the output, so it cannot pump another lazy entry.
    if (!failure) zip.emit('error', error)
  }
  const own = (source: Readable): Readable => {
    if (sources.has(source) || source.closed) return source
    sources.add(source)
    const pipe = source.pipe
    // yazl pipes through CRC/size counters and DeflateRaw without forwarding their errors.
    // Own each private stream at the documented pipe handoff, before it starts accepting bytes.
    source.pipe = function <T extends NodeJS.WritableStream>(
      destination: T,
      options?: { end?: boolean }
    ): T {
      if (destination instanceof Readable && destination !== output) own(destination)
      return pipe.call(this, destination, options) as T
    }
    source.on('error', stop)
    const closed = new Promise<void>((resolve) => {
      source.once('close', () => {
        source.pipe = pipe
        sources.delete(source)
        closing.delete(closed)
        resolve()
      })
    })
    closing.add(closed)
    if (failure) source.destroy(failure)
    return source
  }
  const abort = (): void => stop(new SnapshotError('CANCELLED'))
  signal?.addEventListener('abort', abort, { once: true })
  const writing = pipeline(output, createWriteStream(path, { flags: 'wx', mode: 0o600 }), {
    signal
  })
  // Attach immediately; construction errors must not leave an unhandled pipeline rejection.
  void writing.catch(stop)
  try {
    for (const [name, entry] of plan.entries) {
      const file = byName.get(name)
      zip.addReadStreamLazy(
        name,
        { compressionLevel: entry.compressionLevel, size: entry.bytes, mode: 0o100600 },
        (callback) => {
          if (failure || signal?.aborted) {
            const empty = Readable.from([])
            empty.destroy()
            callback(failure ?? new SnapshotError('CANCELLED'), empty)
            return
          }
          const input = own(file ? createReadStream(file.path) : Readable.from([plan.json]))
          let bytes = 0
          input.on('data', (chunk) => {
            const length = Buffer.byteLength(chunk)
            bytes += length
            // A source changing after capture must not grow past the planned expanded allowance.
            if (bytes > entry.bytes) stop(new SnapshotError('LIMIT_EXCEEDED'))
            else if (file) progress?.(length)
          })
          callback(null, input)
        }
      )
    }
    zip.end({ forceZip64Format: true, comment: '' })
    await writing
    await Promise.all(closing)
    cancelled(signal)
    if (failure) throw failure
    if ((await lstat(path)).size > plan.maximumBytes) throw new SnapshotError('LIMIT_EXCEEDED')
    await syncFile(path)
    await syncDirectory(dirname(path))
  } catch (error) {
    stop(error instanceof Error ? error : new SnapshotError('UNAVAILABLE'))
    await writing.catch(() => {})
    await Promise.all(closing)
    cancelled(signal)
    throw error
  } finally {
    signal?.removeEventListener('abort', abort)
  }
}

export async function archiveInventory(
  zip: ZipFile,
  signal?: AbortSignal,
  entryLimit: number = LIMITS.entries,
  expandedLimit: number = LIMITS.expanded
): Promise<Map<string, Entry>> {
  if (zip.entryCount > entryLimit || zip.comment !== '') invalid()
  const entries = new Map<string, Entry>(),
    folded = new Set<string>()
  let total = 0
  for await (const entry of zip.eachEntry()) {
    cancelled(signal)
    const name = entry.fileName,
      mode = entry.externalFileAttributes >>> 16
    if (
      !/^(manifest\.json|project\.sqlite|blobs\/[a-f0-9]{64}|citation-assets\/[a-f0-9]{64})$/.test(
        name
      ) ||
      folded.has(name.toLowerCase()) ||
      entries.size >= entryLimit
    )
      invalid()
    if (
      (mode & 0o170000) !== 0o100000 ||
      (mode & 0o7111) !== 0 ||
      (entry.externalFileAttributes & 0x10) !== 0 ||
      entry.isEncrypted() ||
      ![0, 8].includes(entry.compressionMethod) ||
      entry.fileCommentLength !== 0 ||
      entry.extraFieldLength > 64 ||
      entry.extraFields.some((f) => ![0x0001, 0x5455].includes(f.id))
    )
      invalid()
    const maximum =
      name === 'manifest.json'
        ? LIMITS.manifest
        : name === 'project.sqlite'
          ? LIMITS.database
          : name.startsWith('blobs/')
            ? LIMITS.blob
            : LIMITS.citation
    if (
      !Number.isSafeInteger(entry.uncompressedSize) ||
      entry.uncompressedSize < 0 ||
      entry.uncompressedSize > maximum ||
      !Number.isSafeInteger(entry.compressedSize) ||
      entry.compressedSize < 0
    )
      throw new SnapshotError('LIMIT_EXCEEDED')
    total += entry.uncompressedSize
    if (total > expandedLimit) throw new SnapshotError('LIMIT_EXCEEDED')
    entries.set(name, entry)
    folded.add(name.toLowerCase())
  }
  if (!entries.has('manifest.json') || !entries.has('project.sqlite')) invalid()
  return entries
}

/** Extract to a newly-created private directory. Never use archive names as arbitrary paths. */
export async function extractArchive(
  path: string,
  staging: string,
  nativeBinding?: string,
  signal?: AbortSignal,
  progress?: Progress
): Promise<SnapshotManifest> {
  cancelled(signal)
  const source = await lstat(path)
  if (!source.isFile() || source.isSymbolicLink() || source.size > ARCHIVE_BYTES) invalid()
  await mkdir(staging, { mode: 0o700 }) // Must not exist; caller owns its parent and any later cleanup.
  const zip = await openPromise(path, {
    autoClose: false,
    lazyEntries: true,
    decodeStrings: true,
    strictFileNames: true,
    validateEntrySizes: true
  })
  let archiveError: Error | undefined
  const streams = new Set<Readable>()
  const fail = (error: Error): void => {
    archiveError = error
    for (const stream of streams) stream.destroy(error)
  }
  zip.on('error', fail)
  const abort = (): void => {
    zip.emit('error', new SnapshotError('CANCELLED'))
    zip.close()
  }
  signal?.addEventListener('abort', abort, { once: true })
  const read = async (entry: Entry, target: string, expected?: BlobRef): Promise<void> => {
    cancelled(signal)
    if (archiveError) throw archiveError
    const stream = await zip.openReadStreamPromise(entry)
    streams.add(stream)
    try {
      const actual = await transfer(
        stream,
        target,
        entry.uncompressedSize,
        signal,
        progress,
        entry.crc32
      )
      if (actual.bytes !== entry.uncompressedSize || (expected && !same(actual, expected)))
        invalid()
    } finally {
      stream.destroy()
      streams.delete(stream)
    }
  }
  try {
    const entries = await archiveInventory(zip, signal)
    await requireSpace(
      staging,
      [...entries.values()].reduce((n, e) => n + e.uncompressedSize, 0)
    )
    await read(entries.get('manifest.json')!, join(staging, 'manifest.json'))
    const manifest = readManifest(
      JSON.parse(
        new TextDecoder('utf-8', { fatal: true }).decode(
          await readFile(join(staging, 'manifest.json'))
        )
      )
    )
    citationProfile(manifest.citationAssets)
    const expected = entriesFor(manifest)
    if (entries.size !== expected.size + 1) invalid()
    for (const [name, ref] of expected)
      if (entries.get(name)?.uncompressedSize !== ref.bytes) invalid()
    await mkdir(join(staging, 'blobs'), { mode: 0o700 })
    await mkdir(join(staging, 'citation-assets'), { mode: 0o700 })
    for (const [name, ref] of expected) await read(entries.get(name)!, join(staging, name), ref)
    for (const ref of manifest.citationAssets)
      await validateCitationFile(join(staging, 'citation-assets', ref.sha256), ref, signal)
    cancelled(signal)
    const graph = inspectPortableDatabase(join(staging, 'project.sqlite'), nativeBinding)
    await validateImportArtifactFiles(staging, staging, graph.importArtifacts)
    const manifestBlobs = new Map(manifest.blobs.map((ref) => [ref.sha256, ref]))
    if (
      graph.schemaVersion !== manifest.schemaVersion ||
      graph.projectId !== manifest.projectId ||
      graph.headCommitId !== manifest.headCommitId ||
      graph.blobs.length !== manifest.blobs.length ||
      graph.blobs.some(
        (ref) => !manifestBlobs.has(ref.sha256) || !same(manifestBlobs.get(ref.sha256)!, ref)
      )
    )
      invalid()
    if (archiveError) throw archiveError
    await contained(staging, join(staging, 'project.sqlite'), false)
    await syncDirectory(join(staging, 'blobs'))
    await syncDirectory(join(staging, 'citation-assets'))
    await syncDirectory(staging)
    return manifest
  } catch (error) {
    cancelled(signal)
    throw error
  } finally {
    signal?.removeEventListener('abort', abort)
    zip.close()
  }
}
