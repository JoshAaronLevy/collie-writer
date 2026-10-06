import Database from 'better-sqlite3'
import { constants, openSync, closeSync, fstatSync, createReadStream } from 'node:fs'
import { fromFdPromise, type ZipFile, type Entry } from 'yauzl'
import { createHash } from 'node:crypto'
import { crc32 } from 'node:zlib'
import type { Readable } from 'node:stream'
import { ProjectError } from '../../domain/projects/errors'
import { archiveInventory } from './archive'
import { citationProfile } from './citation-assets'
import { entriesFor, readManifest, type SnapshotManifest } from './manifest'
import { readPortableGraph } from './portable-db'
import { portableContentDigest } from './retention-database'
import { transfer } from './streams'
import { namedStamp, parentStamp, sameStamp, stamp, type RetentionStamp } from './retention-files'

export const RETENTION_ARCHIVE_LIMIT = 512 * 1024 ** 2
export type ArchiveProof = {
  identity: RetentionStamp
  parent: string
  sha256: string
  manifest: SnapshotManifest
  contentDigest?: string
}
/** Read-only, bounded inspection. No staging, archive extraction, migration or retained incoming copy. */
export async function inspectRetentionArchive(
  path: string,
  nativeBinding?: string,
  includeContent = false
): Promise<ArchiveProof> {
  const parent = parentStamp(path),
    identity = namedStamp(path)
  if (!identity || identity.size > RETENTION_ARCHIVE_LIMIT) throw new ProjectError('LIMIT_EXCEEDED')
  const fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
  let zip: ZipFile | undefined, active: Readable | undefined, archiveError: Error | undefined
  const read = async (
    entry: Entry,
    collect: boolean
  ): Promise<{ bytes: Buffer; sha256: string }> => {
    if (archiveError) throw archiveError
    active = await zip!.openReadStreamPromise(entry)
    const chunks: Buffer[] = [],
      hash = createHash('sha256')
    let length = 0,
      crc = 0
    try {
      for await (const raw of active) {
        const chunk = raw as Buffer
        length += chunk.length
        if (length > entry.uncompressedSize) throw new ProjectError('INVALID_ARCHIVE')
        crc = crc32(chunk, crc)
        hash.update(chunk)
        if (collect) chunks.push(chunk)
      }
      if (length !== entry.uncompressedSize || crc !== entry.crc32 || archiveError)
        throw new ProjectError('INVALID_ARCHIVE')
      return { bytes: Buffer.concat(chunks), sha256: hash.digest('hex') }
    } finally {
      active.destroy()
      active = undefined
    }
  }
  try {
    if (!sameStamp(identity, stamp(fstatSync(fd, { bigint: true }))))
      throw new ProjectError('EXTERNAL_CHANGE')
    const raw = createReadStream(path, { fd, autoClose: false, start: 0 })
    const fingerprint = await transfer(raw, null, RETENTION_ARCHIVE_LIMIT)
    zip = await fromFdPromise(fd, {
      autoClose: false,
      lazyEntries: true,
      decodeStrings: true,
      strictFileNames: true,
      validateEntrySizes: true
    })
    zip.on('error', (error: Error) => {
      archiveError = error
      active?.destroy(error)
    })
    const entries = await archiveInventory(zip, undefined, 4096, RETENTION_ARCHIVE_LIMIT)
    if (
      entries.size > 4096 ||
      [...entries.values()].reduce((n, e) => n + e.uncompressedSize, 0) > RETENTION_ARCHIVE_LIMIT ||
      entries.get('project.sqlite')!.uncompressedSize > 32 * 1024 ** 2 ||
      entries.get('manifest.json')!.uncompressedSize > 1024 ** 2
    )
      throw new ProjectError('LIMIT_EXCEEDED')
    const manifest = readManifest(
      JSON.parse(
        new TextDecoder('utf-8', { fatal: true }).decode(
          (await read(entries.get('manifest.json')!, true)).bytes
        )
      )
    )
    citationProfile(manifest.citationAssets)
    const expected = entriesFor(manifest)
    if (entries.size !== expected.size + 1) throw new ProjectError('INVALID_ARCHIVE')
    let database: Buffer | undefined
    for (const [name, ref] of expected) {
      const entry = entries.get(name)
      if (!entry || entry.uncompressedSize !== ref.bytes) throw new ProjectError('INVALID_ARCHIVE')
      const result = await read(entry, name === 'project.sqlite')
      if (result.sha256 !== ref.sha256) throw new ProjectError('INVALID_ARCHIVE')
      if (name === 'project.sqlite') database = result.bytes
    }
    if (!database || database[18] !== 1 || database[19] !== 1)
      throw new ProjectError('INVALID_ARCHIVE')
    const db = new Database(database, {
      readonly: true,
      ...(nativeBinding ? { nativeBinding } : {})
    })
    let contentDigest: string | undefined
    try {
      db.pragma('trusted_schema=OFF')
      const graph = readPortableGraph(db),
        blobs = new Map(manifest.blobs.map((b) => [b.sha256, b.bytes]))
      if (
        graph.projectId !== manifest.projectId ||
        graph.headCommitId !== manifest.headCommitId ||
        graph.schemaVersion !== manifest.schemaVersion ||
        graph.blobs.length !== blobs.size ||
        graph.blobs.some((b) => blobs.get(b.sha256) !== b.bytes)
      )
        throw new ProjectError('INVALID_ARCHIVE')
      if (includeContent) contentDigest = portableContentDigest(db)
    } finally {
      db.close()
    }
    if (
      archiveError ||
      fingerprint.bytes !== identity.size ||
      !sameStamp(identity, stamp(fstatSync(fd, { bigint: true }))) ||
      !sameStamp(identity, namedStamp(path)) ||
      parent !== parentStamp(path)
    )
      throw new ProjectError('EXTERNAL_CHANGE')
    return {
      identity,
      parent,
      sha256: fingerprint.sha256,
      manifest,
      ...(contentDigest ? { contentDigest } : {})
    }
  } finally {
    active?.destroy()
    if (zip) {
      await new Promise<void>((resolve, reject) => {
        zip!.once('close', resolve)
        zip!.once('error', reject)
        zip!.close()
      })
    } else closeSync(fd)
  }
}
