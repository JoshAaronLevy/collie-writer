import type Database from 'better-sqlite3'
import { ProjectError } from '../../domain/projects/errors'
import { record } from '../../shared/projects'
import {
  isExternalConversation,
  isExternalMessage,
  historicalTime,
  originalFlag,
  type ExternalConversation,
  type ExternalMessage,
  type ExternalEvidence,
  type TranscriptSummary
} from '../../shared/conversation-transcript'
import type { GraphRecord, ImportGraph } from '../../shared/import-graph'
import { requestDigest } from '../storage/digest'
const corrupt = (): never => {
  throw new ProjectError('CORRUPT_PROJECT')
}
export const hasExternalSchema = (db: Database.Database): boolean =>
  (db.prepare('SELECT schema_version AS v FROM format WHERE singleton=1').get() as { v: number })
    .v >= 24
function parse<T>(body: unknown, valid: (v: unknown) => v is T): T {
  if (typeof body !== 'string' || body.length > 64000) return corrupt()
  const v: unknown = JSON.parse(body)
  if (!valid(v) || JSON.stringify(v) !== body) return corrupt()
  return v
}
export function externalOrigin(
  db: Database.Database,
  p: string,
  id: string
): ExternalConversation | null {
  if (!hasExternalSchema(db)) return null
  const row = db
    .prepare(
      'SELECT graph_id,body FROM external_conversations WHERE project_id=? AND conversation_id=?'
    )
    .get(p, id)
  if (!row) return null
  if (!record(row)) return corrupt()
  const value = parse(row.body, isExternalConversation)
  if (value.conversationId !== id || value.graphId !== row.graph_id) return corrupt()
  return value
}
export function externalMessage(db: Database.Database, p: string, id: string): ExternalMessage {
  const row = db
    .prepare(
      'SELECT conversation_id,sequence,body FROM external_messages WHERE project_id=? AND id=?'
    )
    .get(p, id)
  if (!record(row)) throw new ProjectError('NOT_FOUND')
  const value = parse(row.body, isExternalMessage)
  if (
    value.id !== id ||
    value.conversationId !== row.conversation_id ||
    value.sequence !== row.sequence
  )
    return corrupt()
  return value
}
export function externalSummary(
  db: Database.Database,
  p: string,
  id: string
): TranscriptSummary | null {
  const origin = externalOrigin(db, p, id)
  if (!origin) return null
  return {
    version: 1,
    importedAt: origin.importedAt,
    historicalTime: historicalTime(origin.record),
    archivedInOriginal: originalFlag(origin.record, 'is_archived'),
    doNotRecallInOriginal: originalFlag(origin.record, 'is_do_not_remember'),
    excluded: origin.excluded,
    messages: (
      db
        .prepare(
          'SELECT count(*) AS n FROM external_messages WHERE project_id=? AND conversation_id=?'
        )
        .get(p, id) as { n: number }
    ).n
  }
}
export function externalEvidence(
  db: Database.Database,
  p: string,
  graphId: string
): ExternalEvidence {
  if (!hasExternalSchema(db)) return { origins: [], messages: [] }
  const origins: ExternalConversation[] = [],
    messages: ExternalMessage[] = []
  for (const row of db
    .prepare('SELECT conversation_id FROM external_conversations WHERE project_id=? AND graph_id=?')
    .iterate(p, graphId) as Iterable<{ conversation_id: string }>) {
    const origin = externalOrigin(db, p, row.conversation_id)!
    origins.push(origin)
    for (const m of db
      .prepare(
        'SELECT id FROM external_messages WHERE project_id=? AND conversation_id=? ORDER BY sequence'
      )
      .iterate(p, origin.conversationId) as Iterable<{ id: string }>)
      messages.push(externalMessage(db, p, m.id))
  }
  return { origins, messages }
}
export function descendsFrom(
  db: Database.Database,
  p: string,
  head: string,
  ancestor: string
): boolean {
  const seen = new Set<string>()
  let current: string | null = head
  while (current && seen.size < 1000000) {
    if (current === ancestor) return true
    if (seen.has(current)) return false
    seen.add(current)
    const r = db
      .prepare('SELECT parent_id FROM commits WHERE project_id=? AND id=?')
      .get(p, current) as { parent_id: string | null } | undefined
    if (!r) return false
    current = r.parent_id
  }
  return false
}
/** SQL-only ownership and prefix checks, before graph assets are admitted. No acceptance writer is exposed. */
export function validateExternalConversations(db: Database.Database, p: string): void {
  if (!hasExternalSchema(db)) return
  for (const table of ['external_conversations', 'external_messages']) {
    const n = db.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }
    if (
      n.n > (table === 'external_conversations' ? 10000 : 100000) ||
      db.prepare(`SELECT 1 FROM ${table} WHERE project_id<>? LIMIT 1`).get(p)
    )
      return corrupt()
  }
  let messages = 0
  for (const row of db
    .prepare('SELECT conversation_id FROM external_conversations WHERE project_id=?')
    .iterate(p) as Iterable<{ conversation_id: string }>) {
    const origin = externalOrigin(db, p, row.conversation_id)!
    const graph = db
      .prepare('SELECT batch_id,body FROM import_graphs WHERE project_id=? AND id=?')
      .get(p, origin.graphId)
    const chat = db
      .prepare(
        'SELECT created_at,origin_document_id FROM conversations WHERE project_id=? AND id=?'
      )
      .get(p, origin.conversationId)
    if (
      !record(graph) ||
      graph.batch_id !== origin.batchId ||
      JSON.parse(String(graph.body)).digest !== origin.graphDigest ||
      !record(chat) ||
      chat.created_at !== origin.importedAt ||
      chat.origin_document_id !== null ||
      !db.prepare('SELECT 1 FROM commits WHERE project_id=? AND id=?').get(p, origin.commitId)
    )
      return corrupt()
    const graphManifest = JSON.parse(String(graph.body)) as ImportGraph
    const graphRevision = db
      .prepare('SELECT head_commit_id FROM import_batch_revisions WHERE project_id=? AND id=?')
      .get(p, graphManifest.revisionId) as { head_commit_id: string } | undefined
    if (
      !graphRevision ||
      !descendsFrom(db, p, origin.commitId, graphRevision.head_commit_id) ||
      origin.importedAt < graphManifest.createdAt
    )
      return corrupt()
    let sequence = 0
    const identities = new Set<string>()
    for (const m of db
      .prepare(
        'SELECT id FROM external_messages WHERE project_id=? AND conversation_id=? ORDER BY sequence'
      )
      .iterate(p, origin.conversationId) as Iterable<{ id: string }>) {
      const value = externalMessage(db, p, m.id)
      if (
        value.sequence !== sequence++ ||
        value.graphId !== origin.graphId ||
        value.record.conversationIdentityId !== origin.record.identityId ||
        identities.has(value.record.identityId) ||
        db
          .prepare('SELECT 1 FROM conversation_messages WHERE project_id=? AND id=?')
          .get(p, value.id)
      )
        return corrupt()
      identities.add(value.record.identityId)
      messages++
    }
    // A genuine native suffix must descend from the immutable accepted-prefix commit.
    const ancestry = new Map<string, boolean>([[origin.commitId, true]])
    for (const a of db
      .prepare(
        "SELECT json_extract(body,'$.head') AS head FROM ai_captures WHERE project_id=? AND conversation_id=?"
      )
      .iterate(p, origin.conversationId) as Iterable<{ head: string }>) {
      let current: string | null = a.head
      const path: string[] = [],
        seen = new Set<string>()
      while (current && !ancestry.has(current)) {
        if (seen.has(current) || path.length >= 1000000) return corrupt()
        seen.add(current)
        path.push(current)
        const commit = db
          .prepare('SELECT parent_id FROM commits WHERE project_id=? AND id=?')
          .get(p, current) as { parent_id: string | null } | undefined
        if (!commit) return corrupt()
        current = commit.parent_id
      }
      const descends = current !== null && ancestry.get(current) === true
      for (const id of path) ancestry.set(id, descends)
      if (!descends) return corrupt()
    }
  }
  if (
    (db.prepare('SELECT count(*) AS n FROM external_messages').get() as { n: number }).n !==
    messages
  )
    return corrupt()
}
/** Original graph records are authoritative; accepted descriptors cannot relabel or substitute evidence. */
export function validateExternalEvidence(
  manifest: ImportGraph,
  records: GraphRecord[],
  evidence: ExternalEvidence
): void {
  if (!evidence.origins.length && !evidence.messages.length) return
  const index = new Map(records.map((r) => [r.id, r])),
    origins = new Map(evidence.origins.map((o) => [o.conversationId, o]))
  const check = (chosen: GraphRecord, variants: string[]): void => {
    if (requestDigest(index.get(chosen.id) ?? null) !== requestDigest(chosen)) return corrupt()
    for (const id of variants) {
      const other = index.get(id)
      if (!other || other.kind !== chosen.kind || other.identityId !== chosen.identityId)
        return corrupt()
    }
  }
  for (const origin of evidence.origins) {
    if (
      origin.graphId !== manifest.id ||
      origin.graphDigest !== manifest.digest ||
      origin.batchId !== manifest.batchId
    )
      return corrupt()
    check(origin.record, origin.variants)
  }
  const order = new Map<string, number>()
  for (const m of evidence.messages) {
    const o = origins.get(m.conversationId)
    if (!o || m.graphId !== o.graphId || m.record.conversationIdentityId !== o.record.identityId)
      return corrupt()
    check(m.record, m.variants)
    const witness = index.get(m.orderRecordId)
    if (
      !witness ||
      witness.identityId !== m.record.identityId ||
      witness.conversationIdentityId !== o.record.identityId ||
      witness.locator.fileId !== o.record.locator.fileId ||
      witness.disposition === 'internal' ||
      !['selected', 'array-order'].includes(witness.path) ||
      witness.order <= (order.get(m.conversationId) ?? -1)
    )
      return corrupt()
    order.set(m.conversationId, witness.order)
  }
}
