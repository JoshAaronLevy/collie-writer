import { isId } from '../../domain/editor/schema'
import { exact, record } from '../../shared/projects'

export const LIMITS = {
  entries: 100000,
  expanded: 100 * 1024 ** 3,
  blob: 1024 ** 3,
  database: 4 * 1024 ** 3,
  manifest: 32 * 1024 ** 2,
  citation: 2 * 1024 ** 2,
  margin: 64 * 1024 ** 2
} as const
export type SnapshotCode = 'INVALID_ARCHIVE' | 'FORMAT_TOO_NEW' | 'LIMIT_EXCEEDED' | 'DISK_FULL' | 'CANCELLED' | 'STALE_REVISION' | 'UNAVAILABLE' | 'OPERATION_CONFLICT'
export class SnapshotError extends Error {
  constructor(readonly code: SnapshotCode) { super(code) }
}
export type BlobRef = { sha256: string; bytes: number }
export type CitationRef = BlobRef & { id: string; kind: 'style' | 'locale' | 'notice' }
export type SnapshotManifest = {
  format: 'collie'; formatVersion: 1; minimumReader: 1 | 3 | 4 | 5 | 6 | 7 | 8; schemaVersion: 2 | 3 | 4 | 5 | 6 | 7 | 8; editorVersion: 1
  projectId: string; snapshotId: string; parentSnapshotId: string | null; headCommitId: string
  createdAt: string; database: BlobRef; blobs: BlobRef[]; citationAssets: CitationRef[]
}
export const isHash = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
export const isUtc = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value))
function blob(value: unknown, maximum: number): value is BlobRef {
  return record(value) && isHash(value.sha256) && Number.isSafeInteger(value.bytes) && Number(value.bytes) >= 0 && Number(value.bytes) <= maximum
}
export function readManifest(value: unknown): SnapshotManifest {
  const invalid = (): never => { throw new SnapshotError('INVALID_ARCHIVE') }
  if (!record(value) || !exact(value, ['format','formatVersion','minimumReader','schemaVersion','editorVersion','projectId','snapshotId','parentSnapshotId','headCommitId','createdAt','database','blobs','citationAssets'])) return invalid()
  if (value.format !== 'collie') return invalid()
  for (const [key, supported] of [['formatVersion',1],['editorVersion',1]] as const) {
    if (typeof value[key] === 'number' && value[key] > supported) throw new SnapshotError('FORMAT_TOO_NEW')
    if (value[key] !== supported) return invalid()
  }
  if (typeof value.schemaVersion === 'number' && value.schemaVersion > 8 || typeof value.minimumReader === 'number' && value.minimumReader > 8) throw new SnapshotError('FORMAT_TOO_NEW')
  if (!(value.schemaVersion === 2 && value.minimumReader === 1 || value.schemaVersion === 3 && value.minimumReader === 3 || value.schemaVersion === 4 && value.minimumReader === 4 || value.schemaVersion === 5 && value.minimumReader === 5 || value.schemaVersion === 6 && value.minimumReader === 6 || value.schemaVersion === 7 && value.minimumReader === 7 || value.schemaVersion === 8 && value.minimumReader === 8)) return invalid()
  if (![value.projectId,value.snapshotId,value.headCommitId].every(isId) || (value.parentSnapshotId !== null && !isId(value.parentSnapshotId)) || value.parentSnapshotId === value.snapshotId || !isUtc(value.createdAt)) return invalid()
  if (!blob(value.database, LIMITS.database) || !exact(value.database, ['sha256','bytes']) || value.database.bytes < 512) return invalid()
  if (!Array.isArray(value.blobs) || !Array.isArray(value.citationAssets) || value.blobs.length + value.citationAssets.length + 2 > LIMITS.entries) return invalid()
  const hashes = new Set<string>(), ids = new Set<string>()
  let total = value.database.bytes
  for (const ref of value.blobs) {
    if (!blob(ref, LIMITS.blob) || !exact(ref, ['sha256','bytes']) || hashes.has(ref.sha256)) return invalid()
    hashes.add(ref.sha256); total += ref.bytes
  }
  hashes.clear()
  for (const ref of value.citationAssets) {
    if (!blob(ref, LIMITS.citation) || !exact(ref, ['sha256','bytes','id','kind']) || typeof ref.id !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(ref.id) || !['style','locale','notice'].includes(String(ref.kind)) || hashes.has(ref.sha256) || ids.has(ref.id)) return invalid()
    hashes.add(ref.sha256); ids.add(ref.id); total += ref.bytes
  }
  if (total > LIMITS.expanded) throw new SnapshotError('LIMIT_EXCEEDED')
  return value as SnapshotManifest
}
export function entriesFor(manifest: SnapshotManifest): Map<string, BlobRef> {
  return new Map([
    ['project.sqlite', manifest.database],
    ...manifest.blobs.map(ref => [`blobs/${ref.sha256}`, ref] as const),
    ...manifest.citationAssets.map(ref => [`citation-assets/${ref.sha256}`, ref] as const)
  ])
}
export function cancelled(signal?: AbortSignal): void {
  if (signal?.aborted) throw new SnapshotError('CANCELLED')
}
