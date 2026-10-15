import { planningSnapshot } from './planning-data'
import { materialDocuments } from './chapter-material'
import { effectiveState } from '../../shared/outline'
import { setMaterialLink } from './material-links'
import { PLANNING_RECORD_LIMIT } from '../../shared/planning'
import type Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { ProjectError } from '../../domain/projects/errors'
import type { ConversationTurn } from '../../shared/conversations'
import {
  isReferenceReceipt,
  type ReferenceOrigin,
  type ReferenceSave,
  type ReferenceReceipt,
  type ReferenceCandidate
} from '../../shared/conversation-sources'
import type { SourceMetadata } from '../../shared/sources'
import {
  candidateRows,
  normalizeMetadata,
  createSourceRow,
  commitSourceOperation,
  priorSourceOperation
} from './sources'
import { requestDigest } from '../storage/digest'
import { inWriteTransaction } from '../storage/driver'

export function checkReference(t: ConversationTurn, origin: ReferenceOrigin): void {
  const r = origin.reference
  if (
    t.attempt.id !== origin.attemptId ||
    t.attempt.state !== 'completed' ||
    !t.assistant ||
    t.assistant.revisionId !== origin.revisionId ||
    (r.kind === 'text'
      ? !t.assistant.text.includes(r.text)
      : ![...(t.research?.citations ?? []), ...(t.research?.sources ?? [])].some(
          (ref) => ref.url === r.url
        ))
  )
    throw new ProjectError('STALE_REVISION')
}
export function referenceCandidates(
  db: Database.Database,
  p: string,
  metadata: SourceMetadata
): ReferenceCandidate[] {
  return candidateRows(db, p, normalizeMetadata(metadata), '').map((c) => {
    const row = db
      .prepare('SELECT revision_id,metadata FROM sources WHERE project_id=? AND id=?')
      .get(p, c.id) as { revision_id: string; metadata: string }
    return {
      ...c,
      revisionId: row.revision_id,
      title: (JSON.parse(row.metadata) as SourceMetadata).title
    }
  })
}
export function saveReference(
  db: Database.Database,
  p: string,
  input: ReferenceSave,
  readTurn: (id: string) => ConversationTurn
): ReferenceReceipt {
  return inWriteTransaction(db, () => {
    const digest = requestDigest(input)
    const previous = db
      .prepare('SELECT body FROM conversation_sources WHERE project_id=? AND operation_id=?')
      .get(p, input.operationId) as { body: string } | undefined
    if (previous) {
      const receipt: unknown = JSON.parse(previous.body)
      if (!isReferenceReceipt(receipt)) throw new ProjectError('CORRUPT_PROJECT')
      if (receipt.digest !== digest) throw new ProjectError('OPERATION_CONFLICT')
      return receipt
    }
    if (priorSourceOperation(db, p, input.operationId, digest))
      throw new ProjectError('OPERATION_CONFLICT')
    const t = readTurn(input.origin.attemptId)
    checkReference(t, input.origin)
    const candidates = referenceCandidates(db, p, input.metadata)
    if (requestDigest(candidates) !== requestDigest(input.candidates))
      throw new ProjectError('STALE_REVISION')
    if (input.existingSourceId && !candidates.some((c) => c.id === input.existingSourceId))
      throw new ProjectError('STALE_REVISION')
    if (
      (
        db.prepare('SELECT count(*) AS n FROM conversation_sources WHERE project_id=?').get(p) as {
          n: number
        }
      ).n >= 100000
    )
      throw new ProjectError('LIMIT_EXCEEDED')
    if (
      (
        db
          .prepare(
            'SELECT count(*) AS n FROM conversation_sources WHERE project_id=? AND attempt_id=?'
          )
          .get(p, input.origin.attemptId) as { n: number }
      ).n >= 100
    )
      throw new ProjectError('LIMIT_EXCEEDED')
    const sourceId = input.existingSourceId ?? randomUUID(),
      now = new Date().toISOString()
    if (!input.existingSourceId)
      createSourceRow(
        db,
        p,
        sourceId,
        input.metadata,
        input.verified,
        'AI conversation reference',
        now
      )
    if (input.association) {
      const target = input.association.target
      if (
        t.capture.version !== 7 ||
        requestDigest(t.capture.planning.scope) !== requestDigest(target)
      )
        throw new ProjectError('VALIDATION')
      if (target.kind === 'chapter') {
        const docs = materialDocuments(db, p),
          doc = docs.find((d) => d.id === target.id)
        if (!doc || effectiveState(doc, docs) !== 'active') throw new ProjectError('STALE_REVISION')
        setMaterialLink(db, p, { kind: 'source', id: sourceId, documentId: target.id }, true)
      } else {
        if (
          !db.prepare('SELECT 1 FROM planning_topics WHERE project_id=? AND id=?').get(p, target.id)
        )
          throw new ProjectError('STALE_REVISION')
        db.prepare('INSERT OR IGNORE INTO planning_topic_members VALUES (?,?,?,?)').run(
          p,
          target.id,
          'source',
          sourceId
        )
        if (
          (
            db
              .prepare('SELECT count(*) AS n FROM planning_topic_members WHERE project_id=?')
              .get(p) as { n: number }
          ).n > PLANNING_RECORD_LIMIT
        )
          throw new ProjectError('LIMIT_EXCEEDED')
      }
      if (Buffer.byteLength(JSON.stringify(planningSnapshot(db, p))) > 32 * 1024 ** 2 - 1024)
        throw new ProjectError('LIMIT_EXCEEDED')
    }
    const receipt: ReferenceReceipt = {
      ...input,
      version: input.association ? 2 : 1,
      digest,
      sourceId,
      conversationId: t.attempt.conversationId,
      createdAt: now
    }
    if (!isReferenceReceipt(receipt)) throw new ProjectError('LIMIT_EXCEEDED')
    db.prepare('INSERT INTO conversation_sources VALUES (?,?,?,?,?)').run(
      p,
      input.operationId,
      input.origin.attemptId,
      sourceId,
      JSON.stringify(receipt)
    )
    commitSourceOperation(db, p, input.operationId, digest, now)
    return receipt
  })
}
export function referenceReceipts(
  db: Database.Database,
  p: string,
  attemptId: string
): ReferenceReceipt[] {
  return (
    db
      .prepare(
        'SELECT body FROM conversation_sources WHERE project_id=? AND attempt_id=? ORDER BY rowid'
      )
      .all(p, attemptId) as { body: string }[]
  ).map((row) => {
    const value: unknown = JSON.parse(row.body)
    if (!isReferenceReceipt(value)) throw new ProjectError('CORRUPT_PROJECT')
    return value
  })
}
export function validateReferenceReceipts(
  db: Database.Database,
  p: string,
  readTurn: (id: string) => ConversationTurn
): void {
  if (
    (db.prepare('SELECT count(*) AS n FROM conversation_sources').get() as { n: number }).n >
      100000 ||
    db.prepare('SELECT 1 FROM conversation_sources WHERE project_id<>? LIMIT 1').get(p)
  )
    throw new ProjectError('CORRUPT_PROJECT')
  if (
    db
      .prepare(
        'SELECT 1 FROM conversation_sources WHERE project_id=? GROUP BY attempt_id HAVING count(*)>100 LIMIT 1'
      )
      .get(p)
  )
    throw new ProjectError('CORRUPT_PROJECT')
  for (const row of db
    .prepare(
      'SELECT operation_id,attempt_id,source_id,substr(body,1,192001) AS body FROM conversation_sources WHERE project_id=?'
    )
    .iterate(p) as Iterable<{
    operation_id: string
    attempt_id: string
    source_id: string
    body: string
  }>) {
    const v: unknown = JSON.parse(row.body)
    if (!isReferenceReceipt(v)) throw new ProjectError('CORRUPT_PROJECT')
    const { digest, sourceId, conversationId } = v
    const save: ReferenceSave = {
      operationId: v.operationId,
      origin: v.origin,
      metadata: v.metadata,
      verified: v.verified,
      existingSourceId: v.existingSourceId,
      candidates: v.candidates,
      ...(v.association ? { association: v.association } : {})
    }
    const t = readTurn(row.attempt_id)
    checkReference(t, v.origin)
    if (
      v.association &&
      ((db.prepare('SELECT schema_version AS v FROM format').get() as { v: number }).v < 42 ||
        t.capture.version !== 7 ||
        requestDigest(t.capture.planning.scope) !== requestDigest(v.association.target))
    )
      throw new ProjectError('CORRUPT_PROJECT')
    if (
      row.operation_id !== v.operationId ||
      row.attempt_id !== v.origin.attemptId ||
      row.source_id !== sourceId ||
      conversationId !== t.attempt.conversationId ||
      requestDigest(save) !== digest ||
      !db.prepare('SELECT 1 FROM sources WHERE project_id=? AND id=?').get(p, sourceId) ||
      !priorSourceOperation(db, p, v.operationId, digest)
    )
      throw new ProjectError('CORRUPT_PROJECT')
  }
}

export function linkedReferenceMatches(
  db: Database.Database,
  p: string,
  attemptId: string,
  url?: string,
  receipts = referenceReceipts(db, p, attemptId)
): import('../../shared/conversation-knowledge').SourceMatch[] {
  const ids = receipts
    .filter((r) => !url || (r.origin.reference.kind === 'web' && r.origin.reference.url === url))
    .map((r) => r.sourceId)
  const matches = new Map<string, import('../../shared/conversation-knowledge').SourceMatch>()
  for (const id of ids) {
    let next: string | null = id
    const seen = new Set<string>()
    while (next && !seen.has(next) && seen.size < 32) {
      seen.add(next)
      const row = db
        .prepare('SELECT id,state,replacement_id,metadata FROM sources WHERE project_id=? AND id=?')
        .get(p, next) as
        { id: string; state: string; replacement_id: string | null; metadata: string } | undefined
      if (!row) break
      if (row.state === 'merged') {
        next = row.replacement_id
        continue
      }
      matches.set(row.id, {
        id: row.id,
        title: (JSON.parse(row.metadata) as SourceMetadata).title.slice(0, 200),
        status: row.state === 'active' ? 'exact' : 'trashed',
        reason: 'Linked from this answer by you.'
      })
      break
    }
    if (matches.size >= 20) break
  }
  return [...matches.values()]
}
export function sourceReferenceHistory(
  db: Database.Database,
  p: string,
  sourceId: string,
  offset: number
): { items: ReferenceReceipt[]; more: boolean } {
  const rows = db
    .prepare(
      `SELECT substr(r.body,1,192001) AS body FROM conversation_sources r WHERE r.project_id=? AND
    (r.source_id=? OR r.source_id IN (SELECT alias FROM source_aliases WHERE project_id=? AND source_id=?)) ORDER BY r.rowid DESC LIMIT 21 OFFSET ?`
    )
    .all(p, sourceId, p, sourceId, offset) as { body: string }[]
  return {
    items: rows.slice(0, 20).map((row) => {
      const v: unknown = JSON.parse(row.body)
      if (!isReferenceReceipt(v)) throw new ProjectError('CORRUPT_PROJECT')
      return v
    }),
    more: rows.length > 20
  }
}
