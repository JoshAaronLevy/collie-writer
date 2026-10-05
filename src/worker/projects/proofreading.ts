import type Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { readDocument, isId, type DocumentPayload } from '../../domain/editor/schema'
import {
  MECHANICS_PROMPT,
  mechanicsContext,
  mechanicsTargets,
  replaceMechanicsFinding,
  validateMechanicsResult
} from '../../domain/ai/proofreading'
import { ProjectError } from '../../domain/projects/errors'
import { AI_LIMITS } from '../../shared/ai'
import type { ConversationBinding } from '../../shared/conversations'
import {
  isProofreadCapture,
  isProofreadRun,
  isProofreadFinding,
  isProofreadBundle,
  type FindingSuggestion,
  type ProofreadCapture,
  type ProofreadRun,
  type ProofreadFinding,
  type ProofreadBundle,
  type ProofreadReview,
  type ProofreadValue,
  type ProofreadWorkerInput
} from '../../shared/proofreading'
import { captureDigest } from '../ai/capture'
import { activeBindings, localBinding, protectHandoff, retireBinding } from '../ai/handoff'
import { inWriteTransaction } from '../storage/driver'
import { requestDigest } from '../storage/digest'
import { checkpoint, manuscript, payloadAnchors, updateDocumentAnchors } from './manuscript'
import { mapDocumentAnnotations, reconcileAnnotationAnchors } from './notes'
import { projectCitations } from './citation-occurrences'

type Context = {
  db: Database.Database
  operations: Database.Database
  projectId: string
  workspaceId: string
}
const activeStates = ['preparing', 'running', 'stopping']
const corrupt = (): never => {
  throw new ProjectError('CORRUPT_PROJECT')
}
function parse<T>(raw: unknown, valid: (v: unknown) => v is T): T {
  if (typeof raw !== 'string' || raw.length > 1_000_000) return corrupt()
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return corrupt()
  }
  return valid(value) ? value : corrupt()
}
function head(db: Database.Database, p: string): { head: string; updatedAt: string } {
  return db
    .prepare('SELECT head_commit_id AS head,updated_at AS updatedAt FROM projects WHERE id=?')
    .get(p) as { head: string; updatedAt: string }
}
function advance(db: Database.Database, p: string): { head: string; updatedAt: string } {
  const previous = head(db, p),
    next = { head: randomUUID(), updatedAt: new Date().toISOString() }
  db.prepare('INSERT INTO commits VALUES (?,?,?,?)').run(
    p,
    next.head,
    previous.head,
    next.updatedAt
  )
  db.prepare('UPDATE projects SET head_commit_id=?,updated_at=? WHERE id=?').run(
    next.head,
    next.updatedAt,
    p
  )
  return next
}
type DocumentRow = {
  id: string
  title: string
  kind: string
  revision_id: string
  payload: string
  parent_id: string | null
  state: string
}
function document(
  db: Database.Database,
  p: string,
  id: string,
  withPayload = true
): DocumentRow | null {
  const find = db.prepare(
    `SELECT d.id,d.title,d.kind,d.revision_id,${withPayload ? 'd.payload' : "'' AS payload"},d.parent_id,s.state FROM documents d JOIN outline_state s ON s.project_id=d.project_id AND s.document_id=d.id WHERE d.project_id=? AND d.id=?`
  )
  const row = find.get(p, id) as DocumentRow | undefined
  if (!row || row.kind !== 'text' || row.state !== 'active') return null
  let parent = row.parent_id,
    depth = 0
  while (parent) {
    const item = find.get(p, parent) as DocumentRow | undefined
    if (!item || item.state !== 'active' || ++depth > 3) return null
    parent = item.parent_id
  }
  return row
}
function run(db: Database.Database, p: string, id: string): ProofreadRun {
  const row = db
    .prepare(
      'SELECT substr(body,1,1000001) AS body FROM proofreading_runs WHERE project_id=? AND id=?'
    )
    .get(p, id) as { body: string } | undefined
  if (!row) throw new ProjectError('NOT_FOUND')
  return parse(row.body, isProofreadRun)
}
function bundle(db: Database.Database, p: string, id: string): ProofreadBundle {
  const attempt = run(db, p, id),
    row = db
      .prepare(
        'SELECT substr(body,1,1000001) AS body FROM proofreading_captures WHERE project_id=? AND id=?'
      )
      .get(p, attempt.captureId) as { body: string } | undefined
  const capture = parse(row?.body, isProofreadCapture),
    doc = document(db, p, capture.source.documentId, false)
  const rows = db
    .prepare(
      'SELECT id,substr(body,1,1000001) AS body FROM proofreading_findings WHERE project_id=? AND run_id=? ORDER BY rowid LIMIT 101'
    )
    .all(p, id) as { id: string; body: string }[]
  const value: ProofreadBundle = {
    attempt,
    capture,
    findings: rows.map((r) => {
      const f = parse(r.body, isProofreadFinding)
      return f.id === r.id ? f : corrupt()
    }),
    validity: !doc ? 'missing' : doc.revision_id === capture.source.revisionId ? 'current' : 'stale'
  }
  return isProofreadBundle(value) ? value : corrupt()
}
function writeRun(db: Database.Database, p: string, r: ProofreadRun): void {
  r.revisionId = randomUUID()
  db.prepare('UPDATE proofreading_runs SET body=? WHERE project_id=? AND id=?').run(
    JSON.stringify(r),
    p,
    r.id
  )
}
function review(db: Database.Database, p: string, input: ProofreadReview): ProofreadCapture {
  const doc = document(db, p, input.source.documentId)
  if (
    head(db, p).head !== input.expectedHead ||
    !doc ||
    doc.revision_id !== input.source.revisionId
  )
    throw new ProjectError('STALE_REVISION')
  let included: ReturnType<typeof mechanicsTargets>
  try {
    included = mechanicsTargets(readDocument(JSON.parse(doc.payload)), input.source)
  } catch (error) {
    throw new ProjectError(
      error instanceof Error && error.message === 'LIMIT_EXCEEDED'
        ? 'LIMIT_EXCEEDED'
        : 'STALE_REVISION'
    )
  }
  if (!included.targets.length) throw new ProjectError('VALIDATION')
  const text = mechanicsContext(included.targets)
  if (text.length > AI_LIMITS.context) throw new ProjectError('LIMIT_EXCEEDED')
  const capture: ProofreadCapture = {
    version: 1,
    id: input.captureId,
    createdAt: input.createdAt,
    head: input.expectedHead,
    prompt: MECHANICS_PROMPT,
    source: input.source,
    context: [
      {
        kind: input.source.kind,
        id: doc.id,
        revision: doc.revision_id,
        label: doc.title.slice(0, 200),
        text
      }
    ],
    digest: '',
    mode: 'mechanics',
    template: 'mechanics-v1',
    language: 'en-US',
    ...included
  }
  capture.digest = captureDigest(capture)
  if (!isProofreadCapture(capture)) throw new ProjectError('VALIDATION')
  return capture
}
function bindings(operations: Database.Database): ConversationBinding[] {
  return activeBindings(operations, 'proofread')
}
const sameBinding = (a: ConversationBinding | undefined, b: ConversationBinding | null): boolean =>
  !!a && !!b && requestDigest(a) === requestDigest(b)
export function findingSuggestion(f: ProofreadFinding): FindingSuggestion {
  return {
    targetId: f.targetId,
    from: f.from,
    to: f.to,
    before: f.before,
    replacement: f.replacement,
    reason: f.reason,
    kind: f.kind
  }
}

export async function proofreadingCommand(
  context: Context,
  input: ProofreadWorkerInput
): Promise<ProofreadValue> {
  const { db, operations, projectId: p } = context
  const result = (id: string, fresh = false): Extract<ProofreadValue, { type: 'turn' }> => ({
    type: 'turn',
    turn: bundle(db, p, id),
    fresh,
    ...head(db, p)
  })
  switch (input.action) {
    case 'list': {
      const rows = db
        .prepare(
          'SELECT id FROM proofreading_runs WHERE project_id=? ORDER BY rowid DESC LIMIT 20 OFFSET ?'
        )
        .all(p, input.offset) as { id: string }[]
      return {
        type: 'list',
        items: rows.map((row) => {
          const b = bundle(db, p, row.id)
          return {
            id: row.id,
            createdAt: b.attempt.createdAt,
            state: b.attempt.state,
            label: b.capture.context[0].label,
            findings: b.findings.length,
            validation: b.attempt.validation
          }
        }),
        total: (
          db.prepare('SELECT count(*) AS n FROM proofreading_runs WHERE project_id=?').get(p) as {
            n: number
          }
        ).n
      }
    }
    case 'review':
      return { type: 'review', capture: review(db, p, input) }
    case 'get':
      return result(input.attemptId)
    case 'receipt': {
      const d = input.decision,
        prior = db
          .prepare('SELECT digest FROM domain_operations WHERE project_id=? AND operation_id=?')
          .get(p, d.operationId) as { digest: string } | undefined
      if (!prior) return { type: 'done' }
      if (prior.digest !== requestDigest(d)) throw new ProjectError('OPERATION_CONFLICT')
      const decision = db
        .prepare(
          'SELECT finding_id FROM proofreading_decisions WHERE project_id=? AND operation_id=?'
        )
        .get(p, d.operationId) as { finding_id: string } | undefined
      const b = bundle(db, p, d.attemptId)
      if (
        !decision ||
        decision.finding_id !== d.findingId ||
        !b.findings.some((f) => f.id === d.findingId)
      )
        throw new ProjectError('OPERATION_CONFLICT')
      const doc = db
        .prepare('SELECT revision_id FROM documents WHERE project_id=? AND id=?')
        .get(p, b.capture.source.documentId) as { revision_id: string }
      return {
        type: 'decision',
        turn: b,
        documentId: b.capture.source.documentId,
        revisionId: doc.revision_id,
        ...head(db, p)
      }
    }
    case 'bindings':
      return { type: 'bindings', bindings: bindings(operations) }
    case 'binding':
      return localBinding(context, 'proofread', input.attemptId)
    case 'handoff': {
      const b = bundle(db, p, input.binding.attemptId),
        r = b.attempt,
        op = input.operation
      if (
        b.capture.digest !== input.binding.captureDigest ||
        r.sequence !== op.sequence + 1 ||
        r.state !== op.state ||
        r.model !== op.model ||
        r.provider !== 'openai-codex' ||
        r.reason !== op.reason ||
        r.finishedAt !== new Date(op.finishedAt ?? 0).toISOString() ||
        r.output !== op.text
      )
        throw new ProjectError('OPERATION_CONFLICT')
      // Human decisions/freshness may change later; the validated suggestions
      // and actual run outcome retained by this receipt do not.
      const body = {
        attempt: r,
        capture: b.capture,
        findings: b.findings.map((f) => ({ id: f.id, ...findingSuggestion(f) }))
      }
      return {
        type: 'handoff',
        receipt: protectHandoff(context, 'proofread', input.binding, op, input.acknowledged, {
          revision: r.revisionId,
          head: head(db, p).head,
          body
        })
      }
    }
    case 'retire':
      retireBinding(context, 'proofread', input.receipt)
      return { type: 'done' }
    case 'append':
      return inWriteTransaction(db, () => {
        const s = input.submission,
          digest = requestDigest(s)
        if (
          db
            .prepare('SELECT id FROM proofreading_runs WHERE project_id=? AND id=?')
            .get(p, s.attemptId)
        ) {
          if (run(db, p, s.attemptId).requestDigest !== digest)
            throw new ProjectError('OPERATION_CONFLICT')
          return result(s.attemptId)
        }
        if (
          (
            db.prepare('SELECT count(*) AS n FROM proofreading_runs WHERE project_id=?').get(p) as {
              n: number
            }
          ).n >= 10000
        )
          throw new ProjectError('LIMIT_EXCEEDED')
        if (
          (
            db
              .prepare(
                "SELECT count(*) AS n FROM proofreading_runs WHERE project_id=? AND json_extract(body,'$.state') IN ('preparing','running','stopping')"
              )
              .get(p) as { n: number }
          ).n
        )
          throw new ProjectError('ACCESS_BUSY')
        const capture = review(db, p, s.review)
        if (capture.digest !== s.digest) throw new ProjectError('STALE_REVISION')
        const r: ProofreadRun = {
          version: 1,
          id: s.attemptId,
          revisionId: randomUUID(),
          captureId: capture.id,
          state: 'not-sent',
          provider: null,
          model: null,
          reason: null,
          sequence: 0,
          createdAt: new Date().toISOString(),
          finishedAt: null,
          requestDigest: digest,
          output: '',
          validation: 'pending'
        }
        db.prepare('INSERT INTO proofreading_captures VALUES (?,?,?)').run(
          p,
          capture.id,
          JSON.stringify(capture)
        )
        db.prepare('INSERT INTO proofreading_runs VALUES (?,?,?,?)').run(
          p,
          r.id,
          capture.id,
          JSON.stringify(r)
        )
        advance(db, p)
        return result(r.id, true)
      })
    case 'bind': {
      const b = bundle(db, p, input.binding.attemptId),
        existing = localBinding(context, 'proofread', input.binding.attemptId).binding ?? undefined
      if (
        b.capture.digest !== input.binding.captureDigest ||
        (b.attempt.state !== 'not-sent' && !existing) ||
        (existing && !sameBinding(existing, input.binding))
      )
        throw new ProjectError('OPERATION_CONFLICT')
      if (!existing) {
        if (bindings(operations).length >= AI_LIMITS.jobs) throw new ProjectError('LIMIT_EXCEEDED')
        operations
          .prepare('INSERT INTO jobs VALUES (?,?,?,?,?,?)')
          .run(
            input.binding.attemptId,
            input.binding.operationId,
            'proofreading-binding',
            'bound',
            new Date().toISOString(),
            JSON.stringify(input.binding)
          )
      }
      return inWriteTransaction(db, () => {
        const r = run(db, p, b.attempt.id)
        if (r.state === 'not-sent') {
          r.state = 'preparing'
          r.provider = 'openai-codex'
          r.model = input.binding.model
          writeRun(db, p, r)
          advance(db, p)
        }
        return result(r.id)
      })
    }
    case 'settle':
      return inWriteTransaction(db, () => {
        const b = bundle(db, p, input.attemptId),
          r = b.attempt,
          owned = localBinding(context, 'proofread', r.id),
          existing = owned.binding ?? undefined,
          op = input.operation
        if (input.binding && !sameBinding(existing, input.binding)) throw new ProjectError('DENIED')
        if (owned.receipt) {
          if (!op || owned.receipt.resultDigest !== requestDigest(op))
            throw new ProjectError('OPERATION_CONFLICT')
          return result(r.id)
        }
        if (op) {
          if (
            !existing ||
            !input.binding ||
            op.scope.projectId !== p ||
            op.scope.workspaceId !== context.workspaceId ||
            op.operationId !== existing.operationId ||
            op.digest !== existing.digest ||
            op.connectionId !== existing.connectionId ||
            op.model !== existing.model ||
            op.action !== 'proofread'
          )
            throw new ProjectError('DENIED')
          if (op.sequence + 1 <= r.sequence) return result(r.id)
          // Terminal validated findings are immutable; later local decisions must never be overwritten.
          if (r.validation === 'valid' || r.validation === 'invalid') return result(r.id)
          r.sequence = op.sequence + 1
          r.provider = 'openai-codex'
          r.model = op.model
          r.state =
            op.state === 'starting'
              ? 'preparing'
              : op.state === 'cancelling'
                ? 'stopping'
                : op.state
          r.reason = op.reason
          r.finishedAt = op.finishedAt === null ? null : new Date(op.finishedAt).toISOString()
          r.output = op.text
          r.validation = activeStates.includes(r.state) ? 'pending' : 'not-completed'
          if (op.state === 'completed') {
            let suggestions: FindingSuggestion[] | null = null
            try {
              suggestions = validateMechanicsResult(op.text, b.capture)
            } catch {
              /* Preserve actual invalid output for reading; authorize no finding. */
            }
            r.validation = suggestions ? 'valid' : 'invalid'
            if (suggestions)
              for (const suggestion of suggestions) {
                const f: ProofreadFinding = {
                  ...suggestion,
                  version: 1,
                  id: randomUUID(),
                  runId: r.id,
                  revisionId: randomUUID(),
                  decision: 'pending',
                  decidedAt: null,
                  checkpointId: null
                }
                db.prepare('INSERT INTO proofreading_findings VALUES (?,?,?,?)').run(
                  p,
                  f.id,
                  r.id,
                  JSON.stringify(f)
                )
              }
          }
        } else if (r.state === 'not-sent' && !existing) {
          if (r.reason === input.reason) return result(r.id)
          r.reason = input.reason
        } else if (activeStates.includes(r.state) || (r.state === 'not-sent' && existing)) {
          r.state = 'unknown'
          r.validation = 'not-completed'
          r.reason = 'outcome-unknown'
          r.finishedAt = new Date().toISOString()
        } else return result(r.id)
        writeRun(db, p, r)
        advance(db, p)
        return result(r.id)
      })
    case 'decide':
      return inWriteTransaction(db, () => {
        const digest = requestDigest(input),
          prior = db
            .prepare(
              'SELECT digest,result FROM domain_operations WHERE project_id=? AND operation_id=?'
            )
            .get(p, input.operationId) as { digest: string; result: string } | undefined
        const b = bundle(db, p, input.attemptId),
          f = b.findings.find((f) => f.id === input.findingId)
        if (!f) throw new ProjectError('NOT_FOUND')
        const receipt = (): {
          head: string
          updatedAt: string
          type: 'decision'
          turn: ProofreadBundle
          documentId: string
          revisionId: string
        } => {
          const d = db
            .prepare('SELECT revision_id FROM documents WHERE project_id=? AND id=?')
            .get(p, b.capture.source.documentId) as { revision_id: string }
          return {
            type: 'decision' as const,
            turn: bundle(db, p, b.attempt.id),
            documentId: b.capture.source.documentId,
            revisionId: d.revision_id,
            ...head(db, p)
          }
        }
        if (prior) {
          if (prior.digest !== digest) throw new ProjectError('OPERATION_CONFLICT')
          return receipt()
        }
        if (head(db, p).head !== input.expectedHead || f.revisionId !== input.expectedRevision)
          throw new ProjectError('STALE_REVISION')
        if (b.attempt.validation !== 'valid' || f.decision === 'accepted')
          throw new ProjectError('DENIED')
        const now = new Date().toISOString()
        let revisionId = b.capture.source.revisionId
        if (input.decision === 'apply') {
          const doc = document(db, p, b.capture.source.documentId)
          if (f.decision !== 'pending' || !doc || doc.revision_id !== b.capture.source.revisionId)
            throw new ProjectError('STALE_REVISION')
          const before = readDocument(JSON.parse(doc.payload))
          let after: DocumentPayload
          try {
            after = replaceMechanicsFinding(before, b.capture, findingSuggestion(f))
          } catch {
            throw new ProjectError('STALE_REVISION')
          }
          f.checkpointId = checkpoint(
            db,
            p,
            input.expectedHead,
            manuscript(db, p),
            'structural',
            'Before proofreading correction'
          )
          revisionId = randomUUID()
          // Exact text replacement cannot introduce/remove rich identities; keep projections transactional.
          db.prepare('DELETE FROM editor_ids WHERE project_id=? AND document_id=?').run(p, doc.id)
          for (const anchor of payloadAnchors(after))
            db.prepare('INSERT INTO editor_ids VALUES (?,?,?,?)').run(
              p,
              anchor.id,
              doc.id,
              anchor.kind
            )
          mapDocumentAnnotations(db, p, doc.id, before, after)
          updateDocumentAnchors(db, p, doc.id, after)
          projectCitations(db, p, doc.id, after)
          db.prepare(
            'UPDATE documents SET revision_id=?,payload=? WHERE project_id=? AND id=?'
          ).run(revisionId, JSON.stringify(after), p, doc.id)
          reconcileAnnotationAnchors(db, p)
          f.decision = 'accepted'
        } else {
          if (
            (input.decision === 'ignore' && f.decision !== 'pending') ||
            (input.decision === 'undo-ignore' && f.decision !== 'ignored')
          )
            throw new ProjectError('STALE_REVISION')
          f.decision = input.decision === 'ignore' ? 'ignored' : 'pending'
          const doc = db
            .prepare('SELECT revision_id FROM documents WHERE project_id=? AND id=?')
            .get(p, b.capture.source.documentId) as { revision_id: string }
          revisionId = doc.revision_id
        }
        f.revisionId = randomUUID()
        f.decidedAt = now
        db.prepare('UPDATE proofreading_findings SET body=? WHERE project_id=? AND id=?').run(
          JSON.stringify(f),
          p,
          f.id
        )
        const next = advance(db, p)
        db.prepare('INSERT INTO domain_operations VALUES (?,?,?,?)').run(
          p,
          input.operationId,
          digest,
          JSON.stringify({
            projectId: p,
            documentId: b.capture.source.documentId,
            revisionId,
            headCommitId: next.head
          })
        )
        db.prepare('INSERT INTO proofreading_decisions VALUES (?,?,?,?,?,?,?)').run(
          p,
          input.operationId,
          f.id,
          f.revisionId,
          f.decision,
          now,
          f.checkpointId
        )
        return receipt()
      })
  }
}

export function interruptUnboundProofreading(
  db: Database.Database,
  operations: Database.Database,
  p: string
): void {
  const bound = new Set(bindings(operations).map((b) => b.attemptId))
  inWriteTransaction(db, () => {
    for (const row of db
      .prepare(
        "SELECT id FROM proofreading_runs WHERE project_id=? AND json_extract(body,'$.state') IN ('preparing','running','stopping')"
      )
      .all(p) as { id: string }[]) {
      if (bound.has(row.id)) continue
      const r = run(db, p, row.id)
      r.state = 'unknown'
      r.reason = 'outcome-unknown'
      r.validation = 'not-completed'
      r.finishedAt = new Date().toISOString()
      writeRun(db, p, r)
      advance(db, p)
    }
  })
}
export function validatePortableProofreading(db: Database.Database, p: string): void {
  const count = (table: string): number =>
    (db.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n
  for (const table of [
    'proofreading_captures',
    'proofreading_runs',
    'proofreading_findings',
    'proofreading_decisions'
  ])
    if (
      (db.prepare(`SELECT count(*) AS n FROM ${table} WHERE project_id<>?`).get(p) as { n: number })
        .n
    )
      corrupt()
  if (
    count('proofreading_runs') > 10000 ||
    count('proofreading_captures') !== count('proofreading_runs') ||
    count('proofreading_findings') > 1_000_000
  )
    corrupt()
  let findings = 0
  for (const row of db
    .prepare('SELECT id,capture_id FROM proofreading_runs WHERE project_id=?')
    .iterate(p) as Iterable<{ id: string; capture_id: string }>) {
    const b = bundle(db, p, row.id),
      c = b.capture
    if (
      b.attempt.id !== row.id ||
      b.attempt.captureId !== row.capture_id ||
      c.id !== row.capture_id ||
      captureDigest(c) !== c.digest ||
      c.prompt !== MECHANICS_PROMPT ||
      c.context[0].text !== mechanicsContext(c.targets)
    )
      corrupt()
    if (
      !db.prepare('SELECT id FROM commits WHERE project_id=? AND id=?').get(p, c.head) ||
      !db
        .prepare('SELECT id FROM documents WHERE project_id=? AND id=?')
        .get(p, c.source.documentId)
    )
      corrupt()
    for (let i = 0; i < c.targets.length; i++)
      if (
        c.targets
          .slice(0, i)
          .some(
            (t) =>
              t.blockId === c.targets[i].blockId &&
              t.from < c.targets[i].to &&
              t.to > c.targets[i].from
          )
      )
        corrupt()
    const suggestions =
      b.attempt.validation === 'valid' ? validateMechanicsResult(b.attempt.output, c) : []
    if (suggestions.length !== b.findings.length) corrupt()
    for (let i = 0; i < b.findings.length; i++) {
      const f = b.findings[i]
      if (requestDigest(suggestions[i]) !== requestDigest(findingSuggestion(f))) corrupt()
      const stored = db
        .prepare('SELECT id,run_id FROM proofreading_findings WHERE project_id=? AND id=?')
        .get(p, f.id) as { id: string; run_id: string } | undefined
      if (!stored || stored.run_id !== row.id) corrupt()
      const decision = db
        .prepare(
          'SELECT revision_id,decision,decided_at,checkpoint_id FROM proofreading_decisions WHERE project_id=? AND finding_id=? ORDER BY rowid DESC LIMIT 1'
        )
        .get(p, f.id) as
        | {
            revision_id: string
            decision: string
            decided_at: string
            checkpoint_id: string | null
          }
        | undefined
      if (
        decision
          ? decision.revision_id !== f.revisionId ||
            decision.decision !== f.decision ||
            decision.decided_at !== f.decidedAt ||
            decision.checkpoint_id !== f.checkpointId
          : f.decision !== 'pending' || f.decidedAt !== null || f.checkpointId !== null
      )
        corrupt()
    }
    findings += b.findings.length
  }
  if (findings !== count('proofreading_findings')) corrupt()
  for (const row of db
    .prepare(
      'SELECT operation_id,finding_id,revision_id,decision,decided_at,checkpoint_id FROM proofreading_decisions WHERE project_id=?'
    )
    .iterate(p) as Iterable<{
    operation_id: string
    finding_id: string
    revision_id: string
    decision: string
    decided_at: string
    checkpoint_id: string | null
  }>) {
    if (
      ![row.operation_id, row.finding_id, row.revision_id].every(isId) ||
      !Number.isFinite(Date.parse(row.decided_at)) ||
      !['pending', 'ignored', 'accepted'].includes(row.decision) ||
      (row.decision === 'accepted' ? !isId(row.checkpoint_id) : row.checkpoint_id !== null)
    )
      corrupt()
    if (
      row.checkpoint_id &&
      !db
        .prepare(
          "SELECT id FROM history_checkpoints WHERE project_id=? AND id=? AND reason='structural'"
        )
        .get(p, row.checkpoint_id)
    )
      corrupt()
  }
}
