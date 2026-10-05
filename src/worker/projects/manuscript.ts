import { rebuildCitations } from './citation-occurrences'
import type Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { isId, readDocument, type DocumentPayload } from '../../domain/editor/schema'
import { requestDigest } from '../storage/digest'
import { ProjectError } from '../../domain/projects/errors'
import {
  canParent,
  effectiveState,
  isAnchorTarget,
  isManuscriptSnapshot,
  type AnchorTarget,
  type ManuscriptSnapshot,
  type OutlineDocument,
  type RetainedDocument
} from '../../shared/outline'

export function manuscript(db: Database.Database, projectId: string): ManuscriptSnapshot {
  const rows = db
    .prepare(
      `SELECT d.*,s.state,s.replacement_id FROM documents d JOIN outline_state s ON s.project_id=d.project_id AND s.document_id=d.id WHERE d.project_id=? ORDER BY d.parent_id,d.position`
    )
    .all(projectId) as {
    id: string
    parent_id: string | null
    position: number
    kind: OutlineDocument['kind']
    title: string
    status: string
    synopsis: string
    revision_id: string
    payload: string
    state: OutlineDocument['state']
    replacement_id: string | null
  }[]
  if (
    rows.length !==
    (
      db.prepare('SELECT count(*) AS n FROM documents WHERE project_id=?').get(projectId) as {
        n: number
      }
    ).n
  )
    throw new ProjectError('CORRUPT_PROJECT')
  const documents = rows.map((d) => ({
    id: d.id,
    parentId: d.parent_id,
    position: d.position,
    kind: d.kind,
    title: d.title,
    status: d.status,
    synopsis: d.synopsis,
    revisionId: d.revision_id,
    state: d.state,
    replacementId: d.replacement_id,
    payload: readDocument(JSON.parse(d.payload))
  }))
  const anchors = db
    .prepare(
      'SELECT id,kind,document_id AS documentId,state,replacement_id AS replacementId,label FROM anchor_targets WHERE project_id=? ORDER BY id'
    )
    .all(projectId) as AnchorTarget[]
  const result: ManuscriptSnapshot = { version: 1, documents, anchors }
  validateManuscript(result)
  return result
}
export function validateManuscript(value: unknown): asserts value is ManuscriptSnapshot {
  if (!isManuscriptSnapshot(value)) throw new ProjectError('CORRUPT_PROJECT')
  const docs = value.documents,
    byId = new Map(docs.map((d) => [d.id, d])),
    positions = new Map<string | null, number[]>()
  if (
    byId.size !== docs.length ||
    !docs.some((d) => d.kind === 'text' && effectiveState(d, docs) === 'active')
  )
    throw new ProjectError('VALIDATION')
  for (const d of docs) {
    const parent = d.parentId ? byId.get(d.parentId) : undefined
    // Archived/trash parents retain their valid tree shape.
    if (
      (d.parentId && !parent) ||
      !canParent(d.kind, parent ? { ...parent, state: 'active' } : undefined)
    )
      throw new ProjectError('VALIDATION')
    let cursor = d,
      depth = 0
    while (cursor.parentId) {
      if (++depth > 3) throw new ProjectError('VALIDATION')
      cursor = byId.get(cursor.parentId)!
    }
    if (
      d.kind !== 'text' &&
      (d.state === 'merged' ||
        d.payload.ast.content.length !== 1 ||
        d.payload.ast.content[0].type !== 'paragraph' ||
        (d.payload.ast.content[0].content?.length ?? 0) !== 0 ||
        Object.keys(d.payload.footnotesById).length)
    )
      throw new ProjectError('CORRUPT_PROJECT')
    if (d.state === 'merged') {
      let replacement = d,
        seen = new Set<string>()
      while (replacement.replacementId) {
        if (seen.has(replacement.id)) throw new ProjectError('CORRUPT_PROJECT')
        seen.add(replacement.id)
        const next = byId.get(replacement.replacementId)
        if (!next || next.kind !== 'text') throw new ProjectError('CORRUPT_PROJECT')
        replacement = next
      }
    }
    const siblings = positions.get(d.parentId) ?? []
    siblings.push(d.position)
    positions.set(d.parentId, siblings)
  }
  for (const values of positions.values())
    if (values.sort((a, b) => a - b).some((p, i) => p !== i))
      throw new ProjectError('CORRUPT_PROJECT')
  const occurrences = currentAnchors(docs),
    anchorMap = new Map(value.anchors.map((a) => [a.id, a]))
  if (anchorMap.size !== value.anchors.length) throw new ProjectError('CORRUPT_PROJECT')
  for (const anchor of value.anchors) {
    if (!byId.has(anchor.documentId)) throw new ProjectError('CORRUPT_PROJECT')
    const actual = occurrences.get(anchor.id)
    if (
      actual
        ? actual.documentId !== anchor.documentId ||
          actual.state !== anchor.state ||
          actual.kind !== anchor.kind ||
          anchor.replacementId !== null
        : anchor.state !== 'deleted'
    )
      throw new ProjectError('CORRUPT_PROJECT')
    if (anchor.replacementId) {
      const target = anchorMap.get(anchor.replacementId)
      if (anchor.id === anchor.replacementId || !target || target.kind !== anchor.kind)
        throw new ProjectError('CORRUPT_PROJECT')
      const seen = new Set<string>([anchor.id])
      let cursor = target
      while (cursor.replacementId) {
        if (seen.has(cursor.id)) throw new ProjectError('CORRUPT_PROJECT')
        seen.add(cursor.id)
        const next = anchorMap.get(cursor.replacementId)
        if (!next) throw new ProjectError('CORRUPT_PROJECT')
        cursor = next
      }
    }
  }
  if ([...occurrences.keys()].some((id) => !anchorMap.has(id)))
    throw new ProjectError('CORRUPT_PROJECT')
}
export function payloadAnchors(
  payload: DocumentPayload
): { id: string; kind: AnchorTarget['kind']; label: string }[] {
  const result: { id: string; kind: AnchorTarget['kind']; label: string }[] = []
  const entries = new Map<string, { id: string; kind: AnchorTarget['kind']; label: string }>()
  function words(v: unknown): string {
    if (!v || typeof v !== 'object') return ''
    if ('text' in v && typeof v.text === 'string') return v.text
    return 'content' in v && Array.isArray(v.content) ? v.content.map(words).join(' ') : ''
  }
  function visit(v: unknown): void {
    if (!v || typeof v !== 'object') return
    for (const [key, child] of Object.entries(v)) {
      if (['blockId', 'citationId', 'footnoteId'].includes(key)) {
        const entry = { id: String(child), kind: key as AnchorTarget['kind'], label: '' }
        result.push(entry)
        entries.set(entry.id, entry)
      } else visit(child)
    }
    if ('attrs' in v && v.attrs && typeof v.attrs === 'object' && 'blockId' in v.attrs) {
      const blockId = v.attrs.blockId
      const entry = entries.get(String(blockId))
      if (entry) entry.label = words(v).slice(0, 200)
    }
  }
  visit(payload)
  return result
}
export function currentAnchors(documents: RetainedDocument[]): Map<string, AnchorTarget> {
  const result = new Map<string, AnchorTarget>()
  for (const d of documents) {
    if (d.state === 'merged' || d.kind !== 'text') continue
    const state = effectiveState(d, documents)
    for (const a of payloadAnchors(d.payload)) {
      if (result.has(a.id)) throw new ProjectError('VALIDATION')
      result.set(a.id, {
        ...a,
        documentId: d.id,
        state: state === 'merged' ? 'deleted' : state,
        replacementId: null
      })
    }
  }
  return result
}
export function reconcileAnchors(snapshot: ManuscriptSnapshot): void {
  const actual = currentAnchors(snapshot.documents),
    previous = new Map(snapshot.anchors.map((a) => [a.id, a]))
  for (const [id, old] of previous)
    if (!actual.has(id)) actual.set(id, { ...old, state: 'deleted' })
  // Keep explicit repair identities even if their chosen target later becomes unavailable.
  snapshot.anchors = [...actual.values()].sort((a, b) => a.id.localeCompare(b.id))
}
export function writeManuscript(
  db: Database.Database,
  projectId: string,
  snapshot: ManuscriptSnapshot
): void {
  validateManuscript(snapshot)
  db.pragma('defer_foreign_keys=ON')
  const doc = db.prepare(
    `INSERT INTO documents VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(project_id,id) DO UPDATE SET parent_id=excluded.parent_id,position=excluded.position,kind=excluded.kind,title=excluded.title,status=excluded.status,synopsis=excluded.synopsis,revision_id=excluded.revision_id,payload=excluded.payload`
  )
  const state = db.prepare(
    'INSERT INTO outline_state VALUES (?,?,?,?) ON CONFLICT(project_id,document_id) DO UPDATE SET state=excluded.state,replacement_id=excluded.replacement_id'
  )
  for (const d of snapshot.documents) {
    doc.run(
      projectId,
      d.id,
      d.parentId,
      d.position,
      d.kind,
      d.title,
      d.status,
      d.synopsis,
      d.revisionId,
      1,
      JSON.stringify(d.payload)
    )
    state.run(projectId, d.id, d.state, d.replacementId)
  }
  db.prepare('DELETE FROM editor_ids WHERE project_id=?').run(projectId)
  db.prepare('DELETE FROM anchor_targets WHERE project_id=?').run(projectId)
  const insert = db.prepare('INSERT INTO editor_ids VALUES (?,?,?,?)'),
    anchor = db.prepare('INSERT INTO anchor_targets VALUES (?,?,?,?,?,?,?)')
  for (const a of snapshot.anchors) {
    anchor.run(projectId, a.id, a.documentId, a.kind, a.state, a.replacementId, a.label)
    if (a.state !== 'deleted') insert.run(projectId, a.id, a.documentId, a.kind)
  }
  rebuildCitations(db, projectId)
}
export function seedOutline(
  db: Database.Database,
  title = 'Before outline/history adoption'
): void {
  db.prepare("INSERT INTO outline_state SELECT project_id,id,'active',NULL FROM documents").run()
  const projects = db.prepare('SELECT id FROM projects').all() as { id: string }[]
  for (const p of projects) {
    const docs = db.prepare('SELECT id,payload FROM documents WHERE project_id=?').all(p.id) as {
      id: string
      payload: string
    }[]
    const insert = db.prepare('INSERT INTO anchor_targets VALUES (?,?,?,?,?,?,?)')
    for (const doc of docs)
      for (const a of payloadAnchors(readDocument(JSON.parse(doc.payload))))
        insert.run(p.id, a.id, doc.id, a.kind, 'active', null, a.label)
    const snapshot = manuscript(db, p.id)
    const project = db.prepare('SELECT head_commit_id FROM projects WHERE id=?').get(p.id) as {
      head_commit_id: string
    }
    checkpoint(db, p.id, project.head_commit_id, snapshot, 'structural', title)
  }
}
export function checkpoint(
  db: Database.Database,
  projectId: string,
  head: string,
  snapshot: ManuscriptSnapshot,
  reason: 'manual' | 'automatic' | 'structural' | 'restore',
  title: string
): string {
  const parent = db
    .prepare('SELECT id FROM history_checkpoints WHERE project_id=? ORDER BY rowid DESC LIMIT 1')
    .get(projectId) as { id: string } | undefined
  if (
    (
      db
        .prepare('SELECT count(*) AS n FROM history_checkpoints WHERE project_id=?')
        .get(projectId) as { n: number }
    ).n >= 100000
  )
    throw new ProjectError('LIMIT_EXCEEDED')
  if (Buffer.byteLength(JSON.stringify(snapshot)) > 256 * 1024 ** 2)
    throw new ProjectError('LIMIT_EXCEEDED')
  const insert = db.prepare('INSERT OR IGNORE INTO history_content VALUES (?,?,?,?)')
  const grouped = new Map<string, AnchorTarget[]>()
  for (const anchor of snapshot.anchors) {
    const list = grouped.get(anchor.documentId) ?? []
    list.push(anchor)
    grouped.set(anchor.documentId, list)
  }
  let materializedBytes = 0
  const refs = snapshot.documents.map((document) => {
    const entry = { document, anchors: grouped.get(document.id) ?? [] },
      id = requestDigest(entry),
      content = JSON.stringify(entry)
    materializedBytes += Buffer.byteLength(content)
    if (materializedBytes > 256 * 1024 ** 2) throw new ProjectError('LIMIT_EXCEEDED')
    insert.run(projectId, id, content, Buffer.byteLength(content))
    return { documentId: document.id, contentId: id }
  })
  const payload = JSON.stringify({ version: 1, documents: refs })
  const checkpointId = randomUUID()
  db.prepare('INSERT INTO history_checkpoints VALUES (?,?,?,?,?,?,?,?,?,?)').run(
    projectId,
    checkpointId,
    parent?.id ?? null,
    head,
    new Date().toISOString(),
    'human',
    reason,
    title,
    payload,
    Buffer.byteLength(payload)
  )
  return checkpointId
}
export function automaticCheckpoint(db: Database.Database, projectId: string, force = false): void {
  const last = db
    .prepare(
      'SELECT created_at,head_commit_id FROM history_checkpoints WHERE project_id=? ORDER BY rowid DESC LIMIT 1'
    )
    .get(projectId) as { created_at: string; head_commit_id: string } | undefined
  const project = db.prepare('SELECT head_commit_id FROM projects WHERE id=?').get(projectId) as {
    head_commit_id: string
  }
  if (
    !last ||
    (last.head_commit_id !== project.head_commit_id &&
      (force || Date.now() - Date.parse(last.created_at) >= 30000))
  )
    checkpoint(
      db,
      projectId,
      project.head_commit_id,
      manuscript(db, projectId),
      'automatic',
      'Human editing'
    )
}
export function conservedContent(snapshot: ManuscriptSnapshot): string {
  // Exact canonical block/footnote values, including nested structure, marks, locators and asset IDs.
  const blocks: string[] = [],
    notes: string[] = []
  for (const d of snapshot.documents.filter((d) => d.state !== 'merged')) {
    for (const block of d.payload.ast.content) blocks.push(JSON.stringify(block))
    for (const [id, body] of Object.entries(d.payload.footnotesById))
      notes.push(JSON.stringify([id, body]))
  }
  return JSON.stringify([blocks.sort(), notes.sort()])
}
export function freshRevisions(before: ManuscriptSnapshot, after: ManuscriptSnapshot): void {
  const old = new Map(before.documents.map((d) => [d.id, JSON.stringify(d)]))
  for (const d of after.documents)
    if (old.get(d.id) !== JSON.stringify(d)) d.revisionId = randomUUID()
}

/** Incremental current-document projection; full-book serialization is limited to checkpoints/transforms. */
export function updateDocumentAnchors(
  db: Database.Database,
  projectId: string,
  documentId: string,
  payload: DocumentPayload
): void {
  db.prepare("UPDATE anchor_targets SET state='deleted' WHERE project_id=? AND document_id=?").run(
    projectId,
    documentId
  )
  const upsert = db.prepare(
    `INSERT INTO anchor_targets VALUES (?,?,?,?,?,?,?) ON CONFLICT(project_id,id) DO UPDATE SET document_id=excluded.document_id,kind=excluded.kind,state='active',replacement_id=NULL,label=excluded.label`
  )
  for (const a of payloadAnchors(payload)) {
    const prior = db
      .prepare('SELECT document_id,kind,state FROM anchor_targets WHERE project_id=? AND id=?')
      .get(projectId, a.id) as { document_id: string; kind: string; state: string } | undefined
    if (
      prior &&
      ((prior.document_id !== documentId && prior.state !== 'deleted') || prior.kind !== a.kind)
    )
      throw new ProjectError('VALIDATION')
    upsert.run(projectId, a.id, documentId, a.kind, 'active', null, a.label)
  }
}

export function checkpointReferences(value: string): { documentId: string; contentId: string }[] {
  const raw: unknown = JSON.parse(value)
  if (
    !raw ||
    typeof raw !== 'object' ||
    Array.isArray(raw) ||
    Object.keys(raw).length !== 2 ||
    !('version' in raw) ||
    raw.version !== 1 ||
    !('documents' in raw) ||
    !Array.isArray(raw.documents) ||
    !raw.documents.length ||
    raw.documents.length > 10000
  )
    throw new ProjectError('CORRUPT_PROJECT')
  const ids = new Set<string>()
  return raw.documents.map((r: unknown) => {
    if (
      !r ||
      typeof r !== 'object' ||
      Array.isArray(r) ||
      Object.keys(r).length !== 2 ||
      !('documentId' in r) ||
      !isId(r.documentId) ||
      !('contentId' in r) ||
      typeof r.contentId !== 'string' ||
      !/^[a-f0-9]{64}$/.test(r.contentId) ||
      ids.has(r.documentId)
    )
      throw new ProjectError('CORRUPT_PROJECT')
    ids.add(r.documentId)
    return { documentId: r.documentId, contentId: r.contentId }
  })
}
export function readCheckpoint(
  db: Database.Database,
  projectId: string,
  encoded: string
): ManuscriptSnapshot {
  const snapshot: ManuscriptSnapshot = { version: 1, documents: [], anchors: [] }
  let bytes = 0
  for (const ref of checkpointReferences(encoded)) {
    const row = db
      .prepare('SELECT content,byte_size FROM history_content WHERE project_id=? AND id=?')
      .get(projectId, ref.contentId) as { content: string; byte_size: number } | undefined
    if (
      !row ||
      (bytes += row.byte_size) > 256 * 1024 ** 2 ||
      Buffer.byteLength(row.content) !== row.byte_size
    )
      throw new ProjectError('CORRUPT_PROJECT')
    const entry: unknown = JSON.parse(row.content)
    if (
      !entry ||
      typeof entry !== 'object' ||
      Array.isArray(entry) ||
      Object.keys(entry).length !== 2 ||
      !('document' in entry) ||
      !('anchors' in entry) ||
      !Array.isArray(entry.anchors) ||
      !entry.anchors.every(isAnchorTarget) ||
      requestDigest(entry) !== ref.contentId
    )
      throw new ProjectError('CORRUPT_PROJECT')
    const document = entry.document as RetainedDocument,
      anchors = entry.anchors as AnchorTarget[]
    if (document?.id !== ref.documentId || anchors.some((a) => a.documentId !== ref.documentId))
      throw new ProjectError('CORRUPT_PROJECT')
    snapshot.documents.push(document)
    for (const anchor of anchors) snapshot.anchors.push(anchor)
  }
  validateManuscript(snapshot)
  return snapshot
}
export function historyStorage(
  db: Database.Database,
  projectId: string,
  remove: Set<string> = new Set()
): { totalBytes: number; prunableBytes: number; unreferenced: string[] } {
  let totalBytes = 0,
    prunableBytes = 0
  const retained = new Set<string>()
  for (const raw of db
    .prepare('SELECT id,snapshot,byte_size FROM history_checkpoints WHERE project_id=?')
    .iterate(projectId)) {
    const row = raw as { id: string; snapshot: string; byte_size: number }
    totalBytes += row.byte_size
    if (remove.has(row.id)) prunableBytes += row.byte_size
    else for (const ref of checkpointReferences(row.snapshot)) retained.add(ref.contentId)
  }
  const unreferenced: string[] = []
  for (const raw of db
    .prepare('SELECT id,byte_size FROM history_content WHERE project_id=?')
    .iterate(projectId)) {
    const row = raw as { id: string; byte_size: number }
    totalBytes += row.byte_size
    if (!retained.has(row.id)) {
      prunableBytes += row.byte_size
      unreferenced.push(row.id)
    }
  }
  return { totalBytes, prunableBytes, unreferenced }
}
