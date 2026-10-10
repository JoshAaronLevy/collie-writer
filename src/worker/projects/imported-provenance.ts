import type Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { ProjectError } from '../../domain/projects/errors'
import { type DocumentPayload } from '../../domain/editor/schema'
import { record } from '../../shared/projects'
import {
  isImportedContentOrigin,
  type ImportedContentOrigin,
  type ImportContentValue,
  type ImportContentRequest
} from '../../shared/import-content'
import type { GraphRecord, GraphRelation, ImportGraph } from '../../shared/import-graph'
import { requestDigest } from '../storage/digest'
import { externalMessage } from './external-conversations'
import type { PreparedContent } from './import-content'
import type { ConfirmationEntry } from '../../shared/import-review'
import { createSourceRow } from './sources'
import { textDigest } from './import-readers/graph'

const corrupt = (): never => {
  throw new ProjectError('CORRUPT_PROJECT')
}
const enabled = (db: Database.Database): boolean =>
  (db.prepare('SELECT schema_version AS v FROM format WHERE singleton=1').get() as { v: number })
    .v >= 25
function parse(body: unknown): ImportedContentOrigin {
  if (typeof body !== 'string' || body.length > 100000) return corrupt()
  const v: unknown = JSON.parse(body)
  if (!isImportedContentOrigin(v) || JSON.stringify(v) !== body) return corrupt()
  return v
}
export function contentEvidence(
  db: Database.Database,
  p: string,
  graphId: string
): ImportedContentOrigin[] {
  if (!enabled(db)) return []
  return (
    db
      .prepare(
        'SELECT substr(body,1,100001) AS body FROM imported_content_origins WHERE project_id=? AND graph_id=? ORDER BY id LIMIT 50001'
      )
      .all(p, graphId) as { body: string }[]
  ).map((r) => parse(r.body))
}
export function readContentOrigins(
  db: Database.Database,
  p: string,
  input: Extract<ImportContentRequest, { action: 'content-origins' }>
): ImportContentValue {
  if (!enabled(db)) return { type: 'content-origins', origins: [], nextOffset: null }
  // Include receipts for sources subsequently merged into this identity, without rewriting origins.
  const rows = db
    .prepare(
      input.kind === 'note'
        ? 'SELECT body FROM imported_content_origins WHERE project_id=? AND note_id=? ORDER BY id LIMIT 11 OFFSET ?'
        : 'SELECT body FROM imported_content_origins WHERE project_id=? AND (source_id=? OR source_id IN (SELECT alias FROM source_aliases WHERE project_id=? AND source_id=?)) ORDER BY id LIMIT 11 OFFSET ?'
    )
    .all(
      ...(input.kind === 'note'
        ? [p, input.id, input.offset]
        : [p, input.id, p, input.id, input.offset])
    ) as { body: string }[]
  const origins: ImportedContentOrigin[] = []
  let size = 0
  for (const row of rows.slice(0, 10)) {
    if (size + row.body.length > 100000 && origins.length) break
    origins.push(parse(row.body))
    size += row.body.length
  }
  return {
    type: 'content-origins',
    origins,
    nextOffset: rows.length > origins.length ? input.offset + origins.length : null
  }
}
export function validateContentEvidence(
  graph: ImportGraph,
  records: GraphRecord[],
  relations: GraphRelation[],
  origins: ImportedContentOrigin[]
): void {
  const byId = new Map(records.map((r) => [r.id, r])),
    refs = new Map(relations.map((r) => [r.id, r]))
  for (const origin of origins)
    if (
      origin.graphId !== graph.id ||
      origin.graphDigest !== graph.digest ||
      origin.batchId !== graph.batchId ||
      requestDigest(origin.record) !== requestDigest(byId.get(origin.record.id) ?? null) ||
      (origin.relation &&
        requestDigest(origin.relation) !== requestDigest(refs.get(origin.relation.id) ?? null))
    )
      corrupt()
}
function descends(db: Database.Database, p: string, head: string, target: string): boolean {
  const seen = new Set<string>()
  let next: string | null = head
  while (next && seen.size < 1000000 && !seen.has(next)) {
    if (next === target) return true
    seen.add(next)
    const row = db
      .prepare('SELECT parent_id FROM commits WHERE project_id=? AND id=?')
      .get(p, next) as { parent_id: string | null } | undefined
    if (!row) return false
    next = row.parent_id
  }
  return false
}
function originalBody(db: Database.Database, p: string, v: ImportedContentOrigin): DocumentPayload {
  const n = db
    .prepare('SELECT origin,revision_id,body,created_at FROM notes WHERE project_id=? AND id=?')
    .get(p, v.noteId) as
    { origin: string; revision_id: string; body: string; created_at: string } | undefined
  if (!n || n.origin !== 'imported-v1' || n.created_at !== v.importedAt) return corrupt()
  const prior =
    n.revision_id === v.noteRevisionId
      ? JSON.parse(n.body)
      : (() => {
          const row = db
            .prepare(
              'SELECT snapshot FROM note_revisions WHERE project_id=? AND note_id=? AND revision_id=?'
            )
            .get(p, v.noteId, v.noteRevisionId) as { snapshot: string } | undefined
          return row ? JSON.parse(row.snapshot).body : null
        })()
  if (!prior || requestDigest(prior) !== v.bodyDigest) return corrupt()
  const body = prior as DocumentPayload,
    paragraph = body.ast?.content[0]
  if (
    body.ast?.content.length !== 1 ||
    paragraph?.type !== 'paragraph' ||
    Object.keys(body.footnotesById).length
  )
    return corrupt()
  if ((paragraph.content ?? []).some((n) => n.type !== 'text' || n.marks?.length)) return corrupt()
  const text = (paragraph.content ?? []).map((n) => (n.type === 'text' ? n.text : '')).join('')
  let offset = 0
  for (const part of v.record.texts) {
    if (textDigest(text.slice(offset, offset + part.units)) !== part.sha256) return corrupt()
    offset += part.units
  }
  if (offset !== text.length) return corrupt()
  return body
}
function contentCapacity(db: Database.Database, p: string): void {
  const row = db
    .prepare(
      'SELECT count(*) AS count,coalesce(sum(length(body)),0) AS units FROM imported_content_origins WHERE project_id=?'
    )
    .get(p) as { count: number; units: number }
  if (row.count > 100000 || row.units > 20000000) throw new ProjectError('LIMIT_EXCEEDED')
}
export function validateImportedContent(db: Database.Database, p: string): void {
  if (!enabled(db)) return
  contentCapacity(db, p)
  if (db.prepare('SELECT 1 FROM imported_content_origins WHERE project_id<>? LIMIT 1').get(p))
    corrupt()
  let count = 0
  const head = (
    db.prepare('SELECT head_commit_id AS id FROM projects WHERE id=?').get(p) as { id: string }
  ).id
  for (const raw of db
    .prepare('SELECT * FROM imported_content_origins WHERE project_id=?')
    .iterate(p)) {
    if (!record(raw) || ++count > 100000) return corrupt()
    const v = parse(raw.body)
    if (
      raw.id !== v.id ||
      raw.graph_id !== v.graphId ||
      raw.record_id !== v.record.id ||
      raw.source_id !== v.sourceId ||
      raw.message_id !== v.messageId ||
      raw.note_id !== v.noteId ||
      raw.commit_id !== v.commitId
    )
      return corrupt()
    const g = db
      .prepare('SELECT body FROM import_graphs WHERE project_id=? AND id=?')
      .get(p, v.graphId) as { body: string } | undefined
    if (!g) return corrupt()
    const graph = JSON.parse(g.body) as ImportGraph
    const revision = db
      .prepare(
        'SELECT head_commit_id AS id FROM import_batch_revisions WHERE project_id=? AND id=?'
      )
      .get(p, graph.revisionId) as { id: string } | undefined
    if (
      !revision ||
      graph.batchId !== v.batchId ||
      graph.digest !== v.graphDigest ||
      v.importedAt < graph.createdAt ||
      !descends(db, p, v.commitId, revision.id) ||
      !descends(db, p, head, v.commitId)
    )
      return corrupt()
    const commit = db
      .prepare('SELECT created_at FROM commits WHERE project_id=? AND id=?')
      .get(p, v.commitId) as { created_at: string } | undefined
    if (!commit || commit.created_at !== v.importedAt) return corrupt()
    if (v.messageId) {
      const m = externalMessage(db, p, v.messageId)
      if (m.graphId !== v.graphId || !v.relation || !m.variants.includes(v.relation.from))
        return corrupt()
    }
    if (
      v.sourceId &&
      !db.prepare('SELECT 1 FROM sources WHERE project_id=? AND id=?').get(p, v.sourceId)
    )
      return corrupt()
    if (v.noteId) originalBody(db, p, v)
  }
  if (
    db
      .prepare(
        "SELECT 1 FROM notes n WHERE n.project_id=? AND n.origin='imported-v1' AND NOT EXISTS (SELECT 1 FROM imported_content_origins o WHERE o.project_id=n.project_id AND o.note_id=n.id) LIMIT 1"
      )
      .get(p)
  )
    corrupt()
}
/** Low-level writer: the caller owns one atomic confirmation transaction and its prepared graph. */
export function installReviewedContent(
  db: Database.Database,
  p: string,
  prepared: PreparedContent,
  entries: ConfirmationEntry[],
  commitId: string,
  now: string
): void {
  if (!db.inTransaction) throw new ProjectError('DENIED')
  const records = new Map(prepared.records.map((r) => [r.id, r])),
    rows = new Map(prepared.rows.map((r) => [r.recordId, r])),
    messages = new Map(
      entries
        .filter((e) => e.kind === 'message' && e.action === 'create')
        .map((e) => [e.choice.recordId, e.destinationId!])
    ),
    labels = new Set<string>(),
    references = new Map(
      prepared.relations.filter((l) => l.kind === 'reference' && l.to).map((l) => [l.to!, l])
    )
  for (const e of entries) {
    if (e.action === 'exclude' || !['source', 'note'].includes(e.kind)) continue
    const r = records.get(e.choice.recordId)!,
      row = rows.get(r.id)
    if (!row || !row.eligible) throw new ProjectError('VALIDATION')
    let sourceId: string | null = null,
      noteId: string | null = null
    if (e.kind === 'source') {
      if (e.action === 'create') {
        if (!e.choice.metadata) throw new ProjectError('VALIDATION')
        createSourceRow(
          db,
          p,
          e.destinationId!,
          e.choice.metadata,
          false,
          'Imported reference; original metadata is unverified.',
          now,
          e.revisionId!
        )
      } else {
        const source = db
          .prepare('SELECT revision_id,state FROM sources WHERE project_id=? AND id=?')
          .get(p, e.destinationId) as { revision_id: string; state: string } | undefined
        if (!source || source.state !== 'active' || source.revision_id !== e.revisionId)
          throw new ProjectError('STALE_REVISION')
      }
      sourceId = e.destinationId
    } else {
      const body = prepared.notes.get(r.id)
      if (!body || requestDigest(body) !== e.bodyDigest) throw new ProjectError('VALIDATION')
      db.prepare('INSERT INTO notes VALUES (?,?,?,?,?,?,?,?,?)').run(
        p,
        e.destinationId,
        e.revisionId,
        e.title.trim(),
        JSON.stringify(body),
        'active',
        'imported-v1',
        now,
        now
      )
      for (const l of e.labels) {
        if (l.action === 'create' && !labels.has(l.id)) {
          db.prepare('INSERT INTO note_labels VALUES (?,?,?,?,?,?,?)').run(
            p,
            l.id,
            l.kind,
            l.name,
            l.name.trim().normalize('NFKC').toLowerCase(),
            'active',
            randomUUID()
          )
          labels.add(l.id)
        }
        db.prepare('INSERT INTO note_label_links VALUES (?,?,?)').run(p, e.destinationId, l.id)
      }
      noteId = e.destinationId
    }
    const relation = references.get(r.id) ?? null,
      messageId = relation ? (messages.get(relation.from) ?? null) : null,
      origin: ImportedContentOrigin = {
        version: 1,
        id: e.originId!,
        graphId: prepared.manifest.id,
        graphDigest: prepared.manifest.digest,
        batchId: prepared.manifest.batchId,
        record: r,
        relation,
        sourceId,
        messageId,
        noteId,
        noteRevisionId: noteId ? e.revisionId : null,
        bodyDigest: noteId ? e.bodyDigest : null,
        authorship: row.authorship,
        labels: row.labels,
        losses: row.losses,
        importedAt: now,
        commitId
      }
    if (!isImportedContentOrigin(origin)) throw new ProjectError('VALIDATION')
    db.prepare('INSERT INTO imported_content_origins VALUES (?,?,?,?,?,?,?,?,?)').run(
      p,
      origin.id,
      origin.graphId,
      r.id,
      sourceId,
      messageId,
      noteId,
      commitId,
      JSON.stringify(origin)
    )
  }
  contentCapacity(db, p)
  const count = db
    .prepare(
      'SELECT (SELECT count(*) FROM notes WHERE project_id=?) + (SELECT count(*) FROM note_labels WHERE project_id=?) + (SELECT count(*) FROM annotations WHERE project_id=?) AS n'
    )
    .get(p, p, p) as { n: number }
  if (count.n > 100000) throw new ProjectError('LIMIT_EXCEEDED')
}
