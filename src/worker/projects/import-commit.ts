import type Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { ProjectError } from '../../domain/projects/errors'
import { type ConfirmationEntry } from '../../shared/import-review'
import {
  confirmationCommand,
  isImportCommitReceipt,
  isImportCommitResult,
  type ImportCommitCommand,
  type ImportCommitReceipt,
  type ImportCommitResult,
  type CommitRequest,
  type CommitValue
} from '../../shared/import-commit'
import {
  isExternalConversation,
  isExternalMessage,
  originalFlag,
  type ExternalConversation,
  type ExternalMessage
} from '../../shared/conversation-transcript'
import type { GraphRecord } from '../../shared/import-graph'
import { IMPORT_LIMITS } from '../../shared/project-import'
import { requestDigest } from '../storage/digest'
import { inWriteTransaction } from '../storage/driver'
import type { AnalysisContext } from './import-analysis-capture'
import {
  readImportReview,
  storedManifest,
  prepareImportReview,
  manifestCurrent,
  importReviewCapacity,
  reviewGraphEvidence,
  validateReviewGraph
} from './import-review'
import { importIdentity, acceptedIdentities } from './import-identities'
import { readImportBlob } from './import-graphs'
import { OriginalTranscriptText } from './conversation-transcript'
import { installReviewedContent, validateImportedContent } from './imported-provenance'
import {
  externalOrigin,
  externalMessage,
  validateExternalConversations
} from './external-conversations'

const corrupt = (): never => {
  throw new ProjectError('CORRUPT_PROJECT')
}
export const importCommitDigest = (command: ImportCommitCommand): string =>
  requestDigest({ contract: 'project-import-commit-v1', command })
function receipt(db: Database.Database, p: string, id: string): ImportCommitReceipt {
  const row = db
    .prepare('SELECT substr(body,1,8193) AS body FROM import_receipts WHERE project_id=? AND id=?')
    .get(p, id) as { body: string } | undefined
  if (!row || row.body.length > 8192) return corrupt()
  const v: unknown = JSON.parse(row.body)
  if (!isImportCommitReceipt(v) || JSON.stringify(v) !== row.body || v.id !== id) return corrupt()
  return v
}
function outcome(
  db: Database.Database,
  p: string,
  c: ImportCommitCommand
): ImportCommitReceipt | null {
  const row = db
    .prepare('SELECT digest,result FROM domain_operations WHERE project_id=? AND operation_id=?')
    .get(p, c.operationId) as { digest: string; result: string } | undefined
  if (!row) return null
  if (row.digest !== importCommitDigest(c)) throw new ProjectError('OPERATION_CONFLICT')
  const r: unknown = JSON.parse(row.result)
  if (!isImportCommitResult(r) || r.projectId !== p || r.receiptId !== c.operationId)
    return corrupt()
  const saved = receipt(db, p, r.receiptId)
  if (
    requestDigest(saved.command) !== requestDigest(c) ||
    saved.afterHead !== r.headCommitId ||
    saved.batchId !== r.batchId
  )
    return corrupt()
  return saved
}
function report(
  ctx: Pick<AnalysisContext, 'db' | 'projectId'>,
  r: ImportCommitReceipt | null,
  offset = 0
): CommitValue {
  if (!r)
    return {
      type: 'import-committed',
      receipt: null,
      counts: null,
      entries: [],
      offset: 0,
      total: 0
    }
  const saved = storedManifest(ctx as AnalysisContext, r.manifestId),
    entries: ConfirmationEntry[] = []
  let units = 0
  for (const e of saved.entries.slice(offset, offset + 10)) {
    const size = JSON.stringify(e).length
    if (entries.length && units + size > 100000) break
    units += size
    entries.push(e)
  }
  return {
    type: 'import-committed',
    receipt: r,
    counts: saved.manifest.counts,
    entries,
    offset,
    total: saved.entries.length
  }
}
export async function importCommitCommand(
  ctx: AnalysisContext,
  input: CommitRequest
): Promise<CommitValue> {
  const { db, projectId: p } = ctx
  if (input.action === 'import-report') {
    const row = db
      .prepare('SELECT id FROM import_receipts WHERE project_id=? AND batch_id=?')
      .get(p, input.batchId) as { id: string } | undefined
    return report(ctx, row ? receipt(db, p, row.id) : null, input.offset)
  }
  // Exact historical result lookup precedes all head, destination, picker and current-review guards.
  const prior = outcome(db, p, input.command)
  if (prior || input.action === 'import-outcome') return report(ctx, prior)
  const { manifest: m, entries } = storedManifest(ctx, input.command.manifestId)
  if (requestDigest(confirmationCommand(m)) !== requestDigest(input.command))
    throw new ProjectError('OPERATION_CONFLICT')
  if (
    db.prepare('SELECT 1 FROM import_receipts WHERE project_id=? AND batch_id=?').get(p, m.batchId)
  )
    throw new ProjectError('OPERATION_CONFLICT')
  for (const table of ['import_review_revisions', 'import_confirmation_manifests'])
    if (
      db
        .prepare(`SELECT 1 FROM ${table} WHERE project_id=? AND id=?`)
        .get(p, input.command.operationId)
    )
      throw new ProjectError('OPERATION_CONFLICT')
  const prepared = await prepareImportReview(ctx, readImportReview(db, p, m.reviewId))
  if (
    !manifestCurrent(ctx, m, prepared, entries) ||
    prepared.manifestId !== m.id ||
    prepared.blocking ||
    prepared.undecided ||
    requestDigest(prepared.counts) !== requestDigest(m.counts) ||
    requestDigest(entries.map((e) => prepared.choices.get(e.itemId))) !== m.choicesDigest
  )
    throw new ProjectError('STALE_REVISION')
  validateReviewGraph(
    prepared.content.records,
    prepared.content.relations,
    reviewGraphEvidence(db, p, m.graphId).filter((e) => e.review.id === m.reviewId)
  )
  // All accepted text is already pinned in managed originals/graph pages. Verify retained bytes before publication;
  // no original picker grant, external path, network, provider call or newly fetched asset is involved.
  const hashes = new Set<string>()
  for (const a of m.artifacts)
    if (!hashes.has(a.sha256)) {
      await readImportBlob(ctx, a, IMPORT_LIMITS.fileBytes)
      hashes.add(a.sha256)
    }
  const text = new OriginalTranscriptText(ctx, m.batchId),
    included = entries.filter((e) => e.action !== 'exclude'),
    records = prepared.records,
    identities = acceptedIdentities(db, p),
    identityKeys = new Set<string>(),
    afterHead = randomUUID(),
    now = new Date().toISOString(),
    origins: ExternalConversation[] = [],
    messages: ExternalMessage[] = []
  const byDestination = new Map(included.map((e) => [e.destinationId, e])),
    childrenByChat = new Map<string, ConfirmationEntry[]>()
  for (const e of included)
    if (e.kind === 'message' && e.parentDestinationId) {
      const children = childrenByChat.get(e.parentDestinationId) ?? []
      children.push(e)
      childrenByChat.set(e.parentDestinationId, children)
    }
  for (const e of included) {
    const r = records.get(e.choice.recordId)!,
      identity = importIdentity(r)
    if (identities.has(identity.key) || identityKeys.has(identity.key))
      throw new ProjectError('STALE_REVISION')
    identityKeys.add(identity.key)
    if (e.kind === 'chat') {
      const origin: ExternalConversation = {
        version: 1,
        conversationId: e.destinationId!,
        revisionId: e.revisionId!,
        batchId: m.batchId,
        graphId: m.graphId,
        graphDigest: m.graphDigest,
        record: r,
        variants: prepared.byId.get(e.itemId)!.records.map((r) => r.id),
        importedAt: now,
        commitId: afterHead,
        excluded: originalFlag(r, 'is_do_not_remember') === true
      }
      if (!isExternalConversation(origin)) throw new ProjectError('LIMIT_EXCEEDED')
      origins.push(origin)
      const children = (childrenByChat.get(e.destinationId!) ?? []).sort(
        (a, b) => records.get(a.choice.recordId)!.order - records.get(b.choice.recordId)!.order
      )
      for (const [sequence, ch] of children.entries()) {
        const record = records.get(ch.choice.recordId)!
        await text.read(record)
        const message: ExternalMessage = {
          version: 1,
          id: ch.destinationId!,
          revisionId: ch.revisionId!,
          conversationId: e.destinationId!,
          graphId: m.graphId,
          sequence,
          visibility: ['user', 'assistant'].includes(record.role ?? '') ? 'visible' : 'excluded',
          orderRecordId: record.id,
          record,
          variants: prepared.byId.get(ch.itemId)!.records.map((r) => r.id)
        }
        if (!isExternalMessage(message)) throw new ProjectError('LIMIT_EXCEEDED')
        messages.push(message)
      }
    }
  }
  if (messages.length !== m.counts.messages || origins.length !== m.counts.chats)
    throw new ProjectError('VALIDATION')
  const r: ImportCommitReceipt = {
    version: 1,
    id: m.receiptId,
    batchId: m.batchId,
    graphId: m.graphId,
    manifestId: m.id,
    manifestDigest: requestDigest(m),
    command: input.command,
    commandDigest: importCommitDigest(input.command),
    beforeHead: m.expectedHead,
    afterHead,
    createdAt: now
  }
  const growth =
    Buffer.byteLength(JSON.stringify({ origins, messages, receipt: r })) +
    included.reduce(
      (n, e) =>
        n +
        Buffer.byteLength(JSON.stringify(e)) +
        Buffer.byteLength(
          JSON.stringify(
            e.kind === 'note'
              ? prepared.content.notes.get(e.choice.recordId)
              : records.get(e.choice.recordId)
          )
        ) +
        (e.kind === 'note'
          ? records.get(e.choice.recordId)!.texts.reduce((n, t) => n + t.units, 0) * 6 + 8192
          : 2048),
      65536
    )
  await importReviewCapacity(ctx, m.batchId, growth)
  const total = (table: string): number =>
    (db.prepare(`SELECT count(*) AS n FROM ${table} WHERE project_id=?`).get(p) as { n: number }).n
  if (
    total('conversations') + origins.length > 10000 ||
    total('external_messages') + messages.length > 100000 ||
    total('sources') + m.counts.newSources > 100000 ||
    total('notes') +
      total('note_labels') +
      total('annotations') +
      m.counts.notes +
      new Set(
        included.flatMap((e) => e.labels.filter((l) => l.action === 'create').map((l) => l.id))
      ).size >
      100000 ||
    total('imported_content_origins') +
      included.filter((e) => e.kind === 'source' || e.kind === 'note').length >
      100000 ||
    total('import_accepted_items') + included.length > 100000
  )
    throw new ProjectError('LIMIT_EXCEEDED')
  inWriteTransaction(db, () => {
    if (outcome(db, p, input.command)) return
    if (!manifestCurrent(ctx, m, prepared, entries)) throw new ProjectError('STALE_REVISION')
    db.prepare('INSERT INTO commits VALUES (?,?,?,?)').run(p, afterHead, m.expectedHead, now)
    for (const o of origins) {
      const e = byDestination.get(o.conversationId)!
      db.prepare(
        'INSERT INTO conversations (project_id,id,revision_id,title,state,created_at,updated_at,origin_document_id) VALUES (?,?,?,?,?,?,?,NULL)'
      ).run(
        p,
        o.conversationId,
        o.revisionId,
        e.title.trim(),
        originalFlag(o.record, 'is_archived') === true ? 'archived' : 'active',
        now,
        now
      )
      db.prepare('INSERT INTO external_conversations VALUES (?,?,?,?)').run(
        p,
        o.conversationId,
        m.graphId,
        JSON.stringify(o)
      )
    }
    for (const message of messages)
      db.prepare('INSERT INTO external_messages VALUES (?,?,?,?,?)').run(
        p,
        message.id,
        message.conversationId,
        message.sequence,
        JSON.stringify(message)
      )
    installReviewedContent(db, p, prepared.content, entries, afterHead, now)
    db.prepare('UPDATE projects SET head_commit_id=?,updated_at=? WHERE id=?').run(
      afterHead,
      now,
      p
    )
    db.prepare('INSERT INTO import_receipts VALUES (?,?,?,?,?,?,?)').run(
      p,
      r.id,
      r.batchId,
      r.manifestId,
      r.id,
      r.afterHead,
      JSON.stringify(r)
    )
    for (const e of included) {
      const identity = importIdentity(records.get(e.choice.recordId)!)
      db.prepare('INSERT INTO import_accepted_items VALUES (?,?,?,?,?)').run(
        p,
        identity.key,
        identity.fingerprint,
        r.id,
        e.itemId
      )
    }
    const result: ImportCommitResult = {
      version: 2,
      kind: 'import-commit',
      projectId: p,
      batchId: r.batchId,
      receiptId: r.id,
      headCommitId: r.afterHead
    }
    db.prepare('INSERT INTO domain_operations VALUES (?,?,?,?)').run(
      p,
      r.id,
      r.commandDigest,
      JSON.stringify(result)
    )
    validateExternalConversations(db, p)
    validateImportedContent(db, p)
    validatePortableImportCommits(db, p)
  })
  return report(ctx, outcome(db, p, input.command))
}

export function validateImportCommitOperation(
  db: Database.Database,
  p: string,
  id: string,
  digest: string,
  result: unknown
): result is ImportCommitResult {
  if (!isImportCommitResult(result) || result.projectId !== p || result.receiptId !== id)
    return false
  const r = receipt(db, p, id)
  return (
    r.commandDigest === digest &&
    r.commandDigest === importCommitDigest(r.command) &&
    result.batchId === r.batchId &&
    result.headCommitId === r.afterHead
  )
}
/** SQL admission proves every destination against its immutable original creation evidence, even after later edits. */
export function validatePortableImportCommits(db: Database.Database, p: string): void {
  if (
    (db.prepare('SELECT schema_version AS v FROM format WHERE singleton=1').get() as { v: number })
      .v < 29
  )
    return
  for (const table of ['import_receipts', 'import_accepted_items'])
    if (db.prepare(`SELECT 1 FROM ${table} WHERE project_id<>? LIMIT 1`).get(p)) return corrupt()
  const rows = db.prepare('SELECT * FROM import_receipts WHERE project_id=? LIMIT 1001').all(p) as {
    id: string
    batch_id: string
    manifest_id: string
    operation_id: string
    head_commit_id: string
  }[]
  if (rows.length > 1000) return corrupt()
  let items = 0
  for (const row of rows) {
    const r = receipt(db, p, row.id),
      saved = storedManifest({ db, projectId: p } as AnalysisContext, r.manifestId),
      m = saved.manifest,
      commit = db
        .prepare('SELECT parent_id,created_at FROM commits WHERE project_id=? AND id=?')
        .get(p, r.afterHead) as { parent_id: string; created_at: string } | undefined,
      op = db
        .prepare(
          'SELECT digest,result FROM domain_operations WHERE project_id=? AND operation_id=?'
        )
        .get(p, r.id) as { digest: string; result: string } | undefined
    if (
      row.batch_id !== r.batchId ||
      row.manifest_id !== r.manifestId ||
      row.operation_id !== r.id ||
      row.head_commit_id !== r.afterHead ||
      r.batchId !== m.batchId ||
      r.graphId !== m.graphId ||
      r.id !== m.receiptId ||
      r.manifestDigest !== requestDigest(m) ||
      requestDigest(r.command) !== requestDigest(confirmationCommand(m)) ||
      !commit ||
      commit.parent_id !== r.beforeHead ||
      commit.created_at !== r.createdAt ||
      !op ||
      !validateImportCommitOperation(db, p, r.id, op.digest, JSON.parse(op.result))
    )
      return corrupt()
    const acceptedMessages = new Map(
      saved.entries
        .filter((e) => e.kind === 'message' && e.action === 'create')
        .map((e) => [e.choice.recordId, e.destinationId])
    )
    for (const e of saved.entries) {
      if (e.action === 'exclude') continue
      for (const label of e.labels) {
        const target = db
          .prepare('SELECT kind FROM note_labels WHERE project_id=? AND id=?')
          .get(p, label.id) as { kind: string } | undefined
        if (!target || target.kind !== label.kind) return corrupt()
      }
      let original: GraphRecord
      if (e.kind === 'chat') {
        const o = externalOrigin(db, p, e.destinationId!)
        if (
          !o ||
          o.commitId !== r.afterHead ||
          o.graphId !== r.graphId ||
          o.revisionId !== e.revisionId
        )
          return corrupt()
        original = o.record
      } else if (e.kind === 'message') {
        const msg = externalMessage(db, p, e.destinationId!)
        if (
          msg.revisionId !== e.revisionId ||
          msg.conversationId !== e.parentDestinationId ||
          msg.graphId !== r.graphId ||
          requestDigest(msg.record.texts) !== e.bodyDigest
        )
          return corrupt()
        original = msg.record
      } else if (e.kind === 'source' || e.kind === 'note') {
        const origin = db
          .prepare('SELECT body FROM imported_content_origins WHERE project_id=? AND id=?')
          .get(p, e.originId) as { body: string } | undefined
        if (!origin) return corrupt()
        const o = JSON.parse(origin.body)
        if (
          o.commitId !== r.afterHead ||
          o.graphId !== r.graphId ||
          o.record.id !== e.choice.recordId ||
          o.messageId !== (o.relation ? (acceptedMessages.get(o.relation.from) ?? null) : null) ||
          (e.kind === 'source' ? o.sourceId : o.noteId) !== e.destinationId ||
          (e.kind === 'note' &&
            (o.bodyDigest !== e.bodyDigest || o.noteRevisionId !== e.revisionId))
        )
          return corrupt()
        original = o.record
        if (e.kind === 'source' && e.action === 'create') {
          const source = db
            .prepare(
              'SELECT revision_id,metadata,created_at FROM sources WHERE project_id=? AND id=?'
            )
            .get(p, e.destinationId) as
            { revision_id: string; metadata: string; created_at: string } | undefined
          if (!source || source.created_at !== r.createdAt) return corrupt()
          const old =
            source.revision_id === e.revisionId
              ? source.metadata
              : (
                  db
                    .prepare(
                      'SELECT snapshot FROM source_revisions WHERE project_id=? AND source_id=? AND revision_id=?'
                    )
                    .get(p, e.destinationId, e.revisionId) as { snapshot: string } | undefined
                )?.snapshot
          if (!old) return corrupt()
          const metadata =
            source.revision_id === e.revisionId
              ? JSON.parse(old)
              : JSON.parse(JSON.parse(old).metadata)
          if (requestDigest(metadata) !== requestDigest(e.choice.metadata)) return corrupt()
        }
      } else return corrupt()
      const identity = importIdentity(original),
        accepted = db
          .prepare(
            'SELECT fingerprint,receipt_id,item_id FROM import_accepted_items WHERE project_id=? AND identity_key=?'
          )
          .get(p, identity.key) as
          { fingerprint: string; receipt_id: string; item_id: string } | undefined
      if (
        original.id !== e.choice.recordId ||
        !accepted ||
        accepted.fingerprint !== identity.fingerprint ||
        accepted.receipt_id !== r.id ||
        accepted.item_id !== e.itemId ||
        ++items > 100000
      )
        return corrupt()
    }
  }
  if (
    (db.prepare('SELECT count(*) AS n FROM import_accepted_items').get() as { n: number }).n !==
    items
  )
    return corrupt()
}
