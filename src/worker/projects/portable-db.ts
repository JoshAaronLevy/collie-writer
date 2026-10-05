import { hasControlCharacters } from '../../shared/control-characters'
import { validatePortableProofreading } from './proofreading'
import { validatePortableConversations } from './conversations'
import { readProjectDetails } from './details'
import { validatePortableCitations } from './citation-occurrences'
import { validatePortableInterchange } from './interchange'
import Database from 'better-sqlite3'
import { isId, readDocument } from '../../domain/editor/schema'
import { isProjectTemplate } from '../../domain/projects/templates'
import { exact, record } from '../../shared/projects'
import { manuscript, readCheckpoint, historyStorage } from './manuscript'
import { validatePortableNotes } from './notes'
import { validatePortableSources } from './sources'
import { validatePortableInspection } from './inspection'
import { validatePortableEvidence } from './evidence'
import { inspectVersion, validateProjectSchema } from '../storage/schema'
import { isHash, isUtc, LIMITS, SnapshotError, type BlobRef } from './manifest'

export type PortableGraph = {
  projectId: string
  headCommitId: string
  schemaVersion: number
  blobs: BlobRef[]
}
const invalid = (): never => {
  throw new SnapshotError('INVALID_ARCHIVE')
}
const text = (v: unknown, maximum: number): boolean =>
  typeof v === 'string' && v.length <= maximum && !hasControlCharacters(v, true)

/** Only queries app-owned tables after exact SQL/trigger/schema and integrity validation. */
export function readPortableGraph(db: Database.Database): PortableGraph {
  const version = inspectVersion(db)
  validateProjectSchema(db, version)
  const projects = db.prepare('SELECT * FROM projects').all() as Record<string, unknown>[]
  if (projects.length !== 1) return invalid()
  const project = projects[0]
  if (
    !isId(project.id) ||
    !isId(project.head_commit_id) ||
    !isProjectTemplate(project.template) ||
    project.locale !== 'en-US' ||
    !text(project.title, 500) ||
    project.title === '' ||
    !isUtc(project.created_at) ||
    !isUtc(project.updated_at)
  )
    return invalid()
  const projectId = project.id,
    headCommitId = project.head_commit_id
  if (version >= 10)
    try {
      readProjectDetails(db, projectId)
    } catch {
      return invalid()
    }
  else if (project.template === 'essay' || project.template === 'critique') return invalid()
  const blobs = new Map<string, BlobRef>(),
    assetIds = new Set<string>()
  for (const raw of db.prepare('SELECT * FROM managed_assets').iterate()) {
    const asset = raw as Record<string, unknown>
    if (
      assetIds.size >= LIMITS.entries - 16 ||
      asset.project_id !== projectId ||
      !isId(asset.id) ||
      !isHash(asset.sha256) ||
      !Number.isSafeInteger(asset.byte_size) ||
      Number(asset.byte_size) < 0 ||
      Number(asset.byte_size) > LIMITS.blob ||
      !text(asset.original_name, 255) ||
      /[\\/:]/.test(String(asset.original_name)) ||
      ['.', '..'].includes(String(asset.original_name)) ||
      !['application/pdf', 'image/png', 'image/jpeg', 'text/plain'].includes(
        String(asset.media_type)
      )
    )
      return invalid()
    const prior = blobs.get(asset.sha256)
    if (prior && prior.bytes !== asset.byte_size) return invalid()
    assetIds.add(asset.id)
    blobs.set(asset.sha256, { sha256: asset.sha256, bytes: Number(asset.byte_size) })
  }
  // Every registered asset is retained, even if currently unused. Later history must retain asset rows.
  let editorCount = 0
  const lookup = db.prepare('SELECT document_id,kind FROM editor_ids WHERE project_id=? AND id=?')
  const documents = db.prepare('SELECT * FROM documents').all() as Record<string, unknown>[]
  const snapshot = version >= 3 ? manuscript(db, projectId) : null
  if (
    documents.length < 1 ||
    documents.length > 10000 ||
    (snapshot && snapshot.documents.length !== documents.length)
  )
    return invalid()
  const positions = new Set<number>()
  function references(payload: unknown, documentId?: unknown): void {
    if (!payload || typeof payload !== 'object') return
    for (const [key, value] of Object.entries(payload)) {
      if (key === 'sourceId') {
        if (
          version < 5 ||
          !isId(value) ||
          !db
            .prepare(
              'SELECT 1 FROM sources WHERE project_id=? AND id=? UNION SELECT 1 FROM source_aliases WHERE project_id=? AND alias=?'
            )
            .get(projectId, value, projectId, value)
        )
          invalid()
      } else if (key === 'assetId') {
        if (!assetIds.has(String(value))) invalid()
      } else if (['blockId', 'footnoteId', 'citationId'].includes(key)) {
        if (documentId !== undefined) {
          const entry = lookup.get(projectId, value) as
            { document_id: string; kind: string } | undefined
          if (!entry || entry.document_id !== documentId || entry.kind !== key) invalid()
          editorCount++
        }
      } else references(value, documentId)
    }
  }
  for (const doc of documents) {
    if (
      doc.project_id !== projectId ||
      !isId(doc.id) ||
      !isId(doc.revision_id) ||
      doc.editor_version !== 1 ||
      typeof doc.payload !== 'string' ||
      Buffer.byteLength(doc.payload) > 64 * 1024 ** 2
    )
      return invalid()
    if (!snapshot) {
      if (
        doc.parent_id !== null ||
        !Number.isSafeInteger(doc.position) ||
        Number(doc.position) < 0 ||
        positions.has(Number(doc.position)) ||
        doc.kind !== 'text' ||
        !text(doc.title, 500) ||
        !text(doc.status, 100) ||
        !text(doc.synopsis, 100000)
      )
        return invalid()
      positions.add(Number(doc.position))
    }
    const merged =
      doc.kind !== 'text' || snapshot?.documents.find((d) => d.id === doc.id)?.state === 'merged'
    references(readDocument(JSON.parse(doc.payload)), merged ? undefined : doc.id)
  }
  if (
    (!snapshot &&
      (positions.size !== documents.length || [...positions].some((p) => p >= documents.length))) ||
    (db.prepare('SELECT count(*) AS n FROM editor_ids').get() as { n: number }).n !== editorCount
  )
    return invalid()
  if (snapshot) {
    for (const table of [
      'outline_state',
      'anchor_targets',
      'history_checkpoints',
      'history_content'
    ])
      if (db.prepare(`SELECT 1 FROM ${table} WHERE project_id<>? LIMIT 1`).get(projectId))
        return invalid()
    let count = 0
    const seen = new Set<string>()
    const checkpointIds = new Set(
      (
        db.prepare('SELECT id FROM history_checkpoints WHERE project_id=?').all(projectId) as {
          id: string
        }[]
      ).map((row) => row.id)
    )
    for (const raw of db.prepare('SELECT * FROM history_checkpoints ORDER BY rowid').iterate()) {
      const h = raw as Record<string, unknown>
      if (
        ++count > 100000 ||
        !isId(h.id) ||
        seen.has(h.id) ||
        (h.parent_id !== null && (!isId(h.parent_id) || h.parent_id === h.id)) ||
        !isId(h.head_commit_id) ||
        !isUtc(h.created_at) ||
        h.actor !== 'human' ||
        !['manual', 'automatic', 'structural', 'restore'].includes(String(h.reason)) ||
        !text(h.title, 500) ||
        typeof h.snapshot !== 'string' ||
        Buffer.byteLength(h.snapshot) !== h.byte_size ||
        Number(h.byte_size) > 256 * 1024 ** 2
      )
        return invalid()
      if (
        h.parent_id !== null &&
        checkpointIds.has(String(h.parent_id)) &&
        !seen.has(String(h.parent_id))
      )
        return invalid()
      seen.add(h.id)
      const history = readCheckpoint(db, projectId, h.snapshot)
      for (const doc of history.documents) {
        if (!documents.some((d) => d.id === doc.id)) invalid()
        references(doc.payload)
      }
    }
  }
  if (snapshot && historyStorage(db, projectId).unreferenced.length) return invalid()
  if (version >= 4)
    try {
      validatePortableNotes(db, projectId)
    } catch {
      return invalid()
    }
  if (version >= 5)
    try {
      validatePortableSources(db, projectId, assetIds)
    } catch {
      return invalid()
    }
  if (version >= 6)
    try {
      validatePortableInspection(db, projectId, assetIds)
    } catch {
      return invalid()
    }
  if (version >= 7)
    try {
      validatePortableEvidence(db, projectId)
    } catch {
      return invalid()
    }
  if (version >= 8)
    try {
      validatePortableCitations(db, projectId)
    } catch {
      return invalid()
    }
  if (version >= 9)
    try {
      validatePortableInterchange(db, projectId)
    } catch {
      return invalid()
    }
  if (version >= 12)
    try {
      validatePortableProofreading(db, projectId)
    } catch {
      return invalid()
    }
  if (version >= 11)
    try {
      validatePortableConversations(db, projectId)
    } catch {
      return invalid()
    }
  let commits = 0
  for (const raw of db.prepare('SELECT * FROM commits').iterate()) {
    const commit = raw as Record<string, unknown>
    if (
      ++commits > 1000000 ||
      commit.project_id !== projectId ||
      !isId(commit.id) ||
      (commit.parent_id !== null && !isId(commit.parent_id)) ||
      commit.parent_id === commit.id ||
      !isUtc(commit.created_at)
    )
      return invalid()
  }
  const parent = db.prepare('SELECT parent_id FROM commits WHERE project_id=? AND id=?')
  let cursor: string | null = headCommitId,
    chain = 0
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
    if (
      ++operations > 1000000 ||
      op.project_id !== projectId ||
      !isId(op.operation_id) ||
      !isHash(op.digest) ||
      typeof op.result !== 'string' ||
      op.result.length > 1024
    )
      return invalid()
    const result: unknown = JSON.parse(op.result)
    if (
      !record(result) ||
      !exact(result, ['projectId', 'documentId', 'revisionId', 'headCommitId']) ||
      result.projectId !== projectId ||
      !Object.values(result).every(isId) ||
      !parent.get(projectId, result.headCommitId) ||
      !db
        .prepare('SELECT id FROM documents WHERE project_id=? AND id=?')
        .get(projectId, result.documentId)
    )
      return invalid()
  }
  return {
    projectId,
    headCommitId,
    schemaVersion: version,
    blobs: [...blobs.values()].sort((a, b) => a.sha256.localeCompare(b.sha256))
  }
}
export function inspectPortableDatabase(path: string, nativeBinding?: string): PortableGraph {
  const db = new Database(path, { readonly: true, fileMustExist: true, nativeBinding })
  try {
    db.pragma('trusted_schema=OFF')
    return readPortableGraph(db)
  } finally {
    db.close()
  }
}

/** Save's minimum head may be an ancestor, never a head from another branch. */
export function includesHeads(
  db: Database.Database,
  projectId: string,
  head: string,
  minima: string[]
): boolean {
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
