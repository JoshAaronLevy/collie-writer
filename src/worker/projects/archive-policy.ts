import { CITATION_ASSETS, citationProfile } from './citation-assets'
import { LIMITS, SnapshotError, entriesFor, readManifest, type SnapshotManifest } from './manifest'

const TEXT_BYTES = 2 * 1024 ** 2
const ENTRY_OVERHEAD = 512
const FOOTER_BYTES = 512
const DEFLATE_LEVEL = 6

/** Conservative raw-deflate bound, including fixed-block expansion and final-block overhead.
 * Use arithmetic rather than 32-bit shifts: a database can be 4 GiB.
 * See zlib 1.3.1 deflateBound in deflate.c. No compression ratio is assumed.
 */
function deflateMaximum(bytes: number): number {
  return bytes + Math.ceil(bytes / 8) + Math.ceil(bytes / 256) + Math.ceil(bytes / 512) + 64
}
const deflateOverhead = (bytes: number): number => deflateMaximum(bytes) - bytes

// Preserve the previous physical-file allowance, adding only bounded writer/container overhead.
// Expanded entry limits remain unchanged, including for externally produced deflated blobs.
export const ARCHIVE_BYTES =
  LIMITS.expanded +
  LIMITS.manifest +
  LIMITS.entries * ENTRY_OVERHEAD +
  FOOTER_BYTES +
  deflateOverhead(LIMITS.database) +
  deflateOverhead(TEXT_BYTES) +
  CITATION_ASSETS.reduce((total, ref) => total + deflateOverhead(ref.bytes), 0)

type ArchiveEntryPolicy = { bytes: number; compressionLevel: 0 | 6 }
export type ArchivePlan = {
  json: Buffer
  entries: Map<string, ArchiveEntryPolicy>
  expandedBytes: number
  maximumBytes: number
}

/** Plan the exact new archive and its full extraction from validated, expanded manifest lengths. */
export function archivePlan(manifest: SnapshotManifest): ArchivePlan {
  readManifest(manifest)
  citationProfile(manifest.citationAssets)
  const json = Buffer.from(JSON.stringify(manifest))
  if (json.length > LIMITS.manifest) throw new SnapshotError('LIMIT_EXCEEDED')
  const text = new Set(
    manifest.citationAssets.filter((ref) => ref.bytes <= TEXT_BYTES).map((ref) => ref.sha256)
  )
  const entries = new Map<string, ArchiveEntryPolicy>([
    ['manifest.json', { bytes: json.length, compressionLevel: json.length <= TEXT_BYTES ? 6 : 0 }]
  ])
  for (const [name, ref] of entriesFor(manifest))
    entries.set(name, {
      bytes: ref.bytes,
      compressionLevel:
        name === 'project.sqlite' || (name.startsWith('citation-assets/') && text.has(ref.sha256))
          ? DEFLATE_LEVEL
          : 0
    })
  let expandedBytes = 0,
    maximumBytes = FOOTER_BYTES
  for (const entry of entries.values()) {
    expandedBytes += entry.bytes
    maximumBytes +=
      (entry.compressionLevel ? deflateMaximum(entry.bytes) : entry.bytes) + ENTRY_OVERHEAD
  }
  // The reader counts the manifest too; do not create a snapshot it cannot extract at the limit.
  if (
    !Number.isSafeInteger(expandedBytes) ||
    expandedBytes > LIMITS.expanded ||
    !Number.isSafeInteger(maximumBytes) ||
    maximumBytes > ARCHIVE_BYTES
  )
    throw new SnapshotError('LIMIT_EXCEEDED')
  return { json, entries, expandedBytes, maximumBytes }
}
