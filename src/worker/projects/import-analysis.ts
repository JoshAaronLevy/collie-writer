import { isCommitRequest } from '../../shared/import-commit'
import { importCommitCommand } from './import-commit'
import { bindingVersion } from '../../shared/conversations'
import { importPlanCommand, readPart, consolidatePart, validatePortablePlans } from './import-plans'
import { isReviewRequest } from '../../shared/import-review'
import { importReviewCommand, validatePortableReviews } from './import-review'
import { multiCapture, multiPacketDigest, validateMultiProposal } from './import-partition'
import { isMultiWorker, type MultiReview } from '../../shared/import-multipart'
import type Database from 'better-sqlite3'
import { ANALYSIS_RESERVE, analysisReservedBytes } from './import-analysis-budget'
import { IMPORT_LIMITS } from '../../shared/project-import'
import { LIMITS } from './manifest'
import { requireSpace } from './streams'
import { randomUUID } from 'node:crypto'
import { ProjectError } from '../../domain/projects/errors'
import { AI_LIMITS } from '../../shared/ai'
import {
  isAnalysisCapture,
  isAnalysisRun,
  type AnalysisCapture,
  type AnalysisCaptureV1,
  type AnalysisReview,
  type AnalysisRun,
  type AnalysisBundle,
  type AnalysisWorkerInput,
  type AnalysisValue
} from '../../shared/import-analysis'
import type { ImportGraph } from '../../shared/import-graph'
import { requestDigest } from '../storage/digest'
import { inWriteTransaction } from '../storage/driver'
import { captureDigest } from '../ai/capture'
import { activeBindings, localBinding, protectHandoff, retireBinding } from '../ai/handoff'
import {
  prepareAnalysis,
  packetDigest,
  validateProposal,
  type AnalysisContext
} from './import-analysis-capture'
const corrupt = (): never => {
  throw new ProjectError('CORRUPT_PROJECT')
}
function parse<T>(body: string, valid: (v: unknown) => v is T): T {
  if (body.length > 1100000) return corrupt()
  const v: unknown = JSON.parse(body)
  if (!valid(v) || JSON.stringify(v) !== body) return corrupt()
  return v
}
const head = (db: Database.Database, p: string): { head: string; updatedAt: string } =>
  db
    .prepare('SELECT head_commit_id AS head,updated_at AS updatedAt FROM projects WHERE id=?')
    .get(p) as { head: string; updatedAt: string }
function advance(db: Database.Database, p: string): void {
  const prior = head(db, p),
    id = randomUUID(),
    now = new Date().toISOString()
  db.prepare('INSERT INTO commits VALUES (?,?,?,?)').run(p, id, prior.head, now)
  db.prepare('UPDATE projects SET head_commit_id=?,updated_at=? WHERE id=?').run(id, now, p)
}
function run(db: Database.Database, p: string, id: string): AnalysisRun {
  const row = db
    .prepare(
      'SELECT substr(body,1,1100001) AS body FROM import_analysis_runs WHERE project_id=? AND id=?'
    )
    .get(p, id) as { body: string } | undefined
  if (!row) throw new ProjectError('NOT_FOUND')
  return parse(row.body, isAnalysisRun)
}
function bundle(db: Database.Database, p: string, id: string): AnalysisBundle {
  const attempt = run(db, p, id),
    row = db
      .prepare(
        'SELECT substr(body,1,1100001) AS body FROM import_analysis_captures WHERE project_id=? AND id=?'
      )
      .get(p, attempt.captureId) as { body: string } | undefined
  if (!row) return corrupt()
  const capture = parse(row.body, isAnalysisCapture),
    batch = db
      .prepare(
        'SELECT r.body FROM import_batches b JOIN import_batch_revisions r ON r.project_id=b.project_id AND r.id=b.current_revision_id WHERE b.project_id=? AND b.id=?'
      )
      .get(p, capture.packet.batchId) as { body: string } | undefined
  const current = batch ? JSON.parse(batch.body) : null
  return {
    attempt,
    capture,
    validity:
      current?.graphId === capture.packet.graphId && current?.phase === 'preparing'
        ? 'current'
        : 'stale'
  }
}
function write(db: Database.Database, p: string, r: AnalysisRun): void {
  r.revisionId = randomUUID()
  if (!isAnalysisRun(r)) throw new ProjectError('VALIDATION')
  db.prepare('UPDATE import_analysis_runs SET body=? WHERE project_id=? AND id=?').run(
    JSON.stringify(r),
    p,
    r.id
  )
  advance(db, p)
}
/** Reserve final raw output + proposal and SQLite/descriptor growth before dispatch. */
function capacity(db: Database.Database, p: string, batchId: string, version = 1): void {
  const count = (
    db
      .prepare(
        'SELECT count(*) AS n FROM import_analysis_captures WHERE project_id=? AND batch_id=?'
      )
      .get(p, batchId) as { n: number }
  ).n
  const graphBytes = (
    db
      .prepare(
        "SELECT coalesce(sum(json_extract(pg.body,'$.bytes')),0) AS n FROM import_graph_pages pg JOIN import_graphs g ON g.project_id=pg.project_id AND g.id=pg.graph_id WHERE g.project_id=? AND g.batch_id=?"
      )
      .get(p, batchId) as { n: number }
  ).n
  const intakeBytes = (
    db
      .prepare(
        'SELECT coalesce(sum(a.byte_size),0) AS n FROM managed_assets a JOIN import_artifacts i ON i.project_id=a.project_id AND i.asset_id=a.id WHERE i.project_id=? AND i.batch_id=?'
      )
      .get(p, batchId) as { n: number }
  ).n
  // Conservative 2 MiB reserved per attempt (including captures, raw result, proposal and bookkeeping).
  if (
    count >= 1024 ||
    graphBytes +
      intakeBytes +
      analysisReservedBytes(db, p, batchId) +
      (version === 2 ? 1024 ** 2 : ANALYSIS_RESERVE) +
      IMPORT_LIMITS.artifactBytes >
      IMPORT_LIMITS.derivedBytes
  )
    throw new ProjectError('LIMIT_EXCEEDED')
}
async function prepare(ctx: AnalysisContext, review: AnalysisReview): Promise<AnalysisCapture> {
  return 'version' in review
    ? multiCapture(
        ctx,
        review as MultiReview,
        readPart(ctx.db, ctx.projectId, review.planId, review.partId)
      )
    : prepareAnalysis(ctx, review)
}
export async function importAnalysisCommand(
  ctx: AnalysisContext,
  input: AnalysisWorkerInput
): Promise<AnalysisValue> {
  if (isCommitRequest(input)) return importCommitCommand(ctx, input)
  if (isReviewRequest(input)) return importReviewCommand(ctx, input)
  if (isMultiWorker(input)) return importPlanCommand(ctx, input)
  const { db, operations, projectId: p } = ctx
  const result = (id: string, fresh = false): AnalysisValue => ({
    type: 'turn',
    turn: bundle(db, p, id),
    fresh,
    ...head(db, p)
  })
  switch (input.action) {
    case 'review':
      capacity(db, p, input.batchId, 'version' in input ? input.version : 1)
      return { type: 'review', capture: await prepare(ctx, input) }
    case 'get':
      return result(input.attemptId)
    case 'list': {
      const rows = db
        .prepare(
          'SELECT r.id FROM import_analysis_runs r JOIN import_analysis_captures c ON c.project_id=r.project_id AND c.id=r.capture_id WHERE r.project_id=? AND c.batch_id=? ORDER BY r.rowid DESC LIMIT 20 OFFSET ?'
        )
        .all(p, input.batchId, input.offset) as { id: string }[]
      return {
        type: 'list',
        items: rows.map(({ id }) => {
          const r = run(db, p, id)
          return { id, state: r.state, validation: r.validation, createdAt: r.createdAt }
        }),
        total: (
          db
            .prepare(
              'SELECT count(*) AS n FROM import_analysis_captures WHERE project_id=? AND batch_id=?'
            )
            .get(p, input.batchId) as { n: number }
        ).n
      }
    }
    case 'bindings':
      return { type: 'bindings', bindings: activeBindings(operations, 'import') }
    case 'binding':
      return localBinding(ctx, 'import', input.attemptId)
    case 'retire':
      retireBinding(ctx, 'import', input.receipt)
      return { type: 'done' }
    case 'append': {
      const s = input.submission,
        existing = db
          .prepare('SELECT id FROM import_analysis_runs WHERE project_id=? AND id=?')
          .get(p, s.attemptId)
      if (existing) {
        if (run(db, p, s.attemptId).requestDigest !== requestDigest(s))
          throw new ProjectError('OPERATION_CONFLICT')
        return result(s.attemptId)
      }
      capacity(db, p, s.review.batchId, 'version' in s.review ? s.review.version : 1)
      if (activeBindings(operations, 'import').length >= AI_LIMITS.jobs)
        throw new ProjectError('LIMIT_EXCEEDED')
      const capture = await prepare(ctx, s.review)
      if (capture.digest !== s.digest) throw new ProjectError('STALE_REVISION')
      const databaseBytes =
        Number(db.pragma('page_count', { simple: true })) *
        Number(db.pragma('page_size', { simple: true }))
      if (
        !Number.isSafeInteger(databaseBytes) ||
        databaseBytes + ANALYSIS_RESERVE * 4 > LIMITS.database
      )
        throw new ProjectError('LIMIT_EXCEEDED')
      await requireSpace(ctx.workspace, ANALYSIS_RESERVE * 4)
      return inWriteTransaction(db, () => {
        const r: AnalysisRun = {
          version: capture.version,
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
          requestDigest: requestDigest(s),
          output: '',
          validation: 'pending',
          proposal: null
        }
        db.prepare('INSERT INTO import_analysis_captures VALUES (?,?,?,?,?)').run(
          p,
          capture.id,
          capture.packet.batchId,
          capture.packet.graphId,
          JSON.stringify(capture)
        )
        db.prepare('INSERT INTO import_analysis_runs VALUES (?,?,?,?)').run(
          p,
          r.id,
          r.captureId,
          JSON.stringify(r)
        )
        advance(db, p)
        return result(r.id, true)
      })
    }
    case 'bind': {
      const b = bundle(db, p, input.binding.attemptId),
        owned = localBinding(ctx, 'import', input.binding.attemptId)
      if (
        b.capture.digest !== input.binding.captureDigest ||
        bindingVersion(input.binding) !== (b.capture.version === 1 ? 7 : 8) ||
        (b.attempt.state !== 'not-sent' && !owned.binding) ||
        (owned.binding && requestDigest(owned.binding) !== requestDigest(input.binding))
      )
        throw new ProjectError('OPERATION_CONFLICT')
      if (!owned.binding) {
        if (activeBindings(operations, 'import').length >= AI_LIMITS.jobs)
          throw new ProjectError('LIMIT_EXCEEDED')
        operations
          .prepare('INSERT INTO jobs VALUES (?,?,?,?,?,?)')
          .run(
            input.binding.attemptId,
            input.binding.operationId,
            'import-binding',
            'bound',
            new Date().toISOString(),
            JSON.stringify(input.binding)
          )
      }
      return inWriteTransaction(db, () => {
        const r = run(db, p, b.attempt.id)
        if (r.state === 'not-sent') {
          r.state = 'preparing'
          r.model = input.binding.model
          r.provider = 'openai-codex'
          write(db, p, r)
        }
        return result(r.id)
      })
    }
    case 'settle':
      return inWriteTransaction(db, () => {
        const b = bundle(db, p, input.attemptId),
          r = b.attempt,
          owned = localBinding(ctx, 'import', r.id),
          binding = owned.binding,
          op = input.operation
        if (input.binding && requestDigest(binding) !== requestDigest(input.binding))
          throw new ProjectError('DENIED')
        if (owned.receipt) {
          if (!op || owned.receipt.resultDigest !== requestDigest(op))
            throw new ProjectError('OPERATION_CONFLICT')
          return result(r.id)
        }
        if (op) {
          if (
            !binding ||
            !input.binding ||
            op.scope.projectId !== p ||
            op.scope.workspaceId !== ctx.workspaceId ||
            op.operationId !== binding.operationId ||
            op.digest !== binding.digest ||
            op.connectionId !== binding.connectionId ||
            op.model !== binding.model ||
            op.action !== 'import'
          )
            throw new ProjectError('DENIED')
          if (op.sequence + 1 <= r.sequence || ['valid', 'invalid'].includes(r.validation))
            return result(r.id)
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
          r.validation = ['preparing', 'running', 'stopping'].includes(r.state)
            ? 'pending'
            : 'not-completed'
          if (op.state === 'completed') {
            if (r.version === 2 && b.capture.version === 2)
              r.proposal = validateMultiProposal(op.text, b.capture.packet)
            else if (r.version === 1 && b.capture.version === 1)
              r.proposal = validateProposal(op.text, b.capture.packet)
            else return corrupt()
            r.validation = r.proposal ? 'valid' : 'invalid'
          }
        } else if (r.state === 'not-sent' && !binding) {
          if (r.reason === input.reason && r.validation === 'not-completed') return result(r.id)
          r.reason = input.reason
          r.validation = 'not-completed'
        } else if (['preparing', 'running', 'stopping', 'not-sent'].includes(r.state)) {
          r.state = 'unknown'
          r.validation = 'not-completed'
          r.reason = 'outcome-unknown'
          r.finishedAt = new Date().toISOString()
        } else return result(r.id)
        write(db, p, r)
        if (r.validation === 'valid') consolidatePart(ctx, r.id)
        return result(r.id)
      })
    case 'handoff': {
      const b = bundle(db, p, input.binding.attemptId),
        r = b.attempt,
        op = input.operation
      if (
        b.capture.digest !== input.binding.captureDigest ||
        bindingVersion(input.binding) !== (b.capture.version === 1 ? 7 : 8) ||
        r.sequence !== op.sequence + 1 ||
        r.state !== op.state ||
        r.model !== op.model ||
        r.provider !== 'openai-codex' ||
        r.reason !== op.reason ||
        r.finishedAt !== new Date(op.finishedAt ?? 0).toISOString() ||
        r.output !== op.text
      )
        throw new ProjectError('OPERATION_CONFLICT')
      return {
        type: 'handoff',
        receipt: protectHandoff(ctx, 'import', input.binding, op, input.acknowledged, {
          revision: r.revisionId,
          head: head(db, p).head,
          body: { attempt: r, capture: b.capture }
        })
      }
    }
  }
}
export function interruptUnboundImportAnalysis(
  db: Database.Database,
  operations: Database.Database,
  p: string
): void {
  const bound = new Set(activeBindings(operations, 'import').map((b) => b.attemptId))
  inWriteTransaction(db, () => {
    for (const row of db
      .prepare(
        "SELECT id FROM import_analysis_runs WHERE project_id=? AND json_extract(body,'$.state') IN ('not-sent','preparing','running','stopping') AND json_extract(body,'$.validation')='pending'"
      )
      .all(p) as { id: string }[]) {
      if (bound.has(row.id)) continue
      const r = run(db, p, row.id)
      r.state = 'unknown'
      r.validation = 'not-completed'
      r.reason = 'outcome-unknown'
      r.finishedAt = new Date().toISOString()
      write(db, p, r)
    }
  })
}
export function analysisEvidence(
  db: Database.Database,
  p: string,
  graphId: string
): AnalysisCaptureV1[] {
  if (
    (db.prepare('SELECT schema_version AS v FROM format WHERE singleton=1').get() as { v: number })
      .v < 26
  )
    return []
  return (
    db
      .prepare(
        'SELECT substr(body,1,1100001) AS body FROM import_analysis_captures WHERE project_id=? AND graph_id=? LIMIT 1025'
      )
      .all(p, graphId) as { body: string }[]
  )
    .map((r) => parse(r.body, isAnalysisCapture))
    .filter((c): c is AnalysisCaptureV1 => c.version === 1)
}
export function validatePortableImportAnalysis(db: Database.Database, p: string): void {
  if (
    (db.prepare('SELECT schema_version AS v FROM format WHERE singleton=1').get() as { v: number })
      .v < 26
  )
    return
  validatePortablePlans(db, p)
  validatePortableReviews(db, p)
  for (const table of ['import_analysis_captures', 'import_analysis_runs'])
    if (db.prepare(`SELECT 1 FROM ${table} WHERE project_id<>? LIMIT 1`).get(p)) corrupt()
  let count = 0
  for (const row of db
    .prepare(
      'SELECT id,batch_id,graph_id,substr(body,1,1100001) AS body FROM import_analysis_captures WHERE project_id=?'
    )
    .iterate(p) as Iterable<{ id: string; batch_id: string; graph_id: string; body: string }>) {
    if (++count > 100000) return corrupt()
    const c = parse(row.body, isAnalysisCapture),
      g = db
        .prepare('SELECT body FROM import_graphs WHERE project_id=? AND id=?')
        .get(p, row.graph_id) as { body: string } | undefined
    if (!g) return corrupt()
    const graph = JSON.parse(g.body) as ImportGraph
    const revision = db
      .prepare('SELECT head_commit_id,body FROM import_batch_revisions WHERE project_id=? AND id=?')
      .get(p, graph.revisionId) as { head_commit_id: string; body: string } | undefined
    if (
      c.id !== row.id ||
      c.packet.graphId !== row.graph_id ||
      c.packet.batchId !== row.batch_id ||
      graph.batchId !== row.batch_id ||
      c.packet.graphDigest !== graph.digest ||
      c.digest !== captureDigest(c) ||
      c.packet.captureDigest !==
        (c.version === 1 ? packetDigest(c.packet) : multiPacketDigest(c.packet)) ||
      !revision ||
      c.head !== revision.head_commit_id ||
      requestDigest(c.packet.settings) !== requestDigest(JSON.parse(revision.body).settings) ||
      requestDigest(c.packet.files.map((f) => ({ fileId: f.id, sha256: f.sha256 }))) !==
        requestDigest(graph.files.map((f) => ({ fileId: f.fileId, sha256: f.sha256 })))
    )
      return corrupt()
    if (
      (c.version === 1 && c.packet.partId !== c.id) ||
      c.packet.files.some((f) => {
        const row = db
          .prepare('SELECT body FROM import_files WHERE project_id=? AND batch_id=? AND id=?')
          .get(p, c.packet.batchId, f.id) as { body: string } | undefined
        return !row || JSON.parse(row.body).originalName !== f.name
      })
    )
      return corrupt()
    if (
      c.version === 2 &&
      requestDigest(c.packet) !== requestDigest(readPart(db, p, c.packet.planId, c.packet.partId))
    )
      return corrupt()
    const rows = db
      .prepare(
        'SELECT id,capture_id,substr(body,1,1100001) AS body FROM import_analysis_runs WHERE project_id=? AND capture_id=?'
      )
      .all(p, c.id) as { id: string; capture_id: string; body: string }[]
    if (rows.length !== 1) return corrupt()
    const r = parse(rows[0].body, isAnalysisRun)
    if (r.version !== c.version || r.id !== rows[0].id || r.captureId !== c.id) return corrupt()
    if (
      ['valid', 'invalid'].includes(r.validation) &&
      requestDigest(
        c.version === 1
          ? validateProposal(r.output, c.packet)
          : validateMultiProposal(r.output, c.packet)
      ) !== requestDigest(r.proposal)
    )
      return corrupt()
  }
  if (
    (db.prepare('SELECT count(*) AS n FROM import_analysis_runs').get() as { n: number }).n !==
    count
  )
    return corrupt()
  for (const row of db
    .prepare(
      'SELECT batch_id,count(*) AS n FROM import_analysis_captures WHERE project_id=? GROUP BY batch_id'
    )
    .all(p) as { batch_id: string; n: number }[])
    if (row.n > 1024 || analysisReservedBytes(db, p, row.batch_id) > IMPORT_LIMITS.derivedBytes)
      return corrupt()
}
