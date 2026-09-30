import Database from 'better-sqlite3'
import { isId, readDocument } from '../../domain/editor/schema'
import { exact, record } from '../../shared/projects'
import { validateProjectSchema } from '../storage/schema'
import { isHash, isUtc, LIMITS, SnapshotError, type BlobRef } from './manifest'

export type PortableGraph = { projectId: string; headCommitId: string; blobs: BlobRef[] }
const invalid = (): never => { throw new SnapshotError('INVALID_ARCHIVE') }
const text = (v: unknown, maximum: number): boolean => typeof v === 'string' && v.length <= maximum && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(v)

/** Only queries app-owned tables after exact SQL/trigger/schema and integrity validation. */
export function readPortableGraph(db: Database.Database): PortableGraph {
  validateProjectSchema(db)
  const projects = db.prepare('SELECT * FROM projects').all() as Record<string, unknown>[]
  if (projects.length !== 1) return invalid()
  const project = projects[0]
  if (!isId(project.id) || !isId(project.head_commit_id) || project.template !== 'blank' || project.locale !== 'en-US' || !text(project.title, 500) || project.title === '' || !isUtc(project.created_at) || !isUtc(project.updated_at)) return invalid()
  const projectId = project.id, headCommitId = project.head_commit_id
  const blobs = new Map<string, BlobRef>(), assetIds = new Set<string>()
  for (const raw of db.prepare('SELECT * FROM managed_assets').iterate()) {
    const asset = raw as Record<string, unknown>
    if (assetIds.size >= LIMITS.entries - 16 || asset.project_id !== projectId || !isId(asset.id) || !isHash(asset.sha256) || !Number.isSafeInteger(asset.byte_size) || Number(asset.byte_size) < 0 || Number(asset.byte_size) > LIMITS.blob || !text(asset.original_name, 255) || /[\\/:]/.test(String(asset.original_name)) || ['.','..'].includes(String(asset.original_name)) || !['application/pdf','image/png','image/jpeg','text/plain'].includes(String(asset.media_type))) return invalid()
    const prior = blobs.get(asset.sha256)
    if (prior && prior.bytes !== asset.byte_size) return invalid()
    assetIds.add(asset.id); blobs.set(asset.sha256, { sha256: asset.sha256, bytes: Number(asset.byte_size) })
  }
  // Every registered asset is retained, even if currently unused. Later history must retain asset rows.
  let documentCount = 0, editorCount = 0
  const lookup = db.prepare('SELECT document_id,kind FROM editor_ids WHERE project_id=? AND id=?')
  for (const raw of db.prepare('SELECT * FROM documents').iterate()) {
    const doc = raw as Record<string, unknown>
    if (++documentCount > 1 || doc.project_id !== projectId || !isId(doc.id) || !isId(doc.revision_id) || doc.parent_id !== null || doc.position !== 0 || doc.kind !== 'text' || doc.editor_version !== 1 || !text(doc.title, 500) || !text(doc.status, 100) || !text(doc.synopsis, 100000) || typeof doc.payload !== 'string' || Buffer.byteLength(doc.payload) > 64 * 1024 ** 2) return invalid()
    const payload = readDocument(JSON.parse(doc.payload))
    const visit = (node: unknown): void => {
      if (!node || typeof node !== 'object') return
      for (const [key, value] of Object.entries(node)) {
        if (key === 'sourceId') invalid() // Source ownership arrives with the source repository.
        else if (key === 'assetId') { if (!assetIds.has(String(value))) invalid() }
        else if (['blockId','footnoteId','citationId'].includes(key)) {
          const entry = lookup.get(projectId, value) as { document_id: string; kind: string } | undefined
          if (!entry || entry.document_id !== doc.id || entry.kind !== key) invalid()
          editorCount++
        } else visit(value)
      }
    }
    visit(payload)
  }
  if (documentCount !== 1 || (db.prepare('SELECT count(*) AS n FROM editor_ids').get() as { n: number }).n !== editorCount) return invalid()
  let commits = 0
  for (const raw of db.prepare('SELECT * FROM commits').iterate()) {
    const commit = raw as Record<string, unknown>
    if (++commits > 1000000 || commit.project_id !== projectId || !isId(commit.id) || (commit.parent_id !== null && !isId(commit.parent_id)) || commit.parent_id === commit.id || !isUtc(commit.created_at)) return invalid()
  }
  const parent = db.prepare('SELECT parent_id FROM commits WHERE project_id=? AND id=?')
  let cursor: string | null = headCommitId, chain = 0
  while (cursor !== null) {
    if (++chain > commits) return invalid()
    const row = parent.get(projectId, cursor) as { parent_id: string | null } | undefined
    if (!row) return invalid()
    cursor = row.parent_id
  }
  if (chain !== commits) return invalid()
  let operations = 0
  for (const raw of db.prepare('SELECT * FROM domain_operations').iterate()) {
    const op = raw as Record<string, unknown>
    if (++operations > 1000000 || op.project_id !== projectId || !isId(op.operation_id) || !isHash(op.digest) || typeof op.result !== 'string' || op.result.length > 1024) return invalid()
    const result: unknown = JSON.parse(op.result)
    if (!record(result) || !exact(result, ['projectId','documentId','revisionId','headCommitId']) || result.projectId !== projectId || !Object.values(result).every(isId) || !parent.get(projectId, result.headCommitId) || !db.prepare('SELECT id FROM documents WHERE project_id=? AND id=?').get(projectId, result.documentId)) return invalid()
  }
  return { projectId, headCommitId, blobs: [...blobs.values()].sort((a,b) => a.sha256.localeCompare(b.sha256)) }
}
export function inspectPortableDatabase(path: string, nativeBinding?: string): PortableGraph {
  const db = new Database(path, { readonly: true, fileMustExist: true, nativeBinding })
  try { db.pragma('trusted_schema=OFF'); return readPortableGraph(db) } finally { db.close() }
}

/** Save's minimum head may be an ancestor, never a head from another branch. */
export function includesHeads(db: Database.Database, projectId: string, head: string, minima: string[]): boolean {
  const remaining = new Set(minima)
  const parent = db.prepare('SELECT parent_id FROM commits WHERE project_id=? AND id=?')
  for (let count = 0; count < 1000000; count++) {
    remaining.delete(head)
    if (!remaining.size) return true
    const row = parent.get(projectId, head) as { parent_id: string | null } | undefined
    if (!row?.parent_id) return false
    head = row.parent_id
  }
  return false
}
