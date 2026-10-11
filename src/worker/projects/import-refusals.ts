import { localBinding } from '../ai/handoff'
import type { AnalysisContext } from './import-analysis-capture'
import { isAnalysisCapture, isAnalysisRun } from '../../shared/import-analysis'
import type Database from 'better-sqlite3'
import { ProjectError } from '../../domain/projects/errors'
import { isId } from '../../domain/editor/schema'
import { exact, record } from '../../shared/projects'
import { importHash } from '../../shared/project-import'
import {
  isImportRefusal,
  importRefusalMessage,
  IMPORT_TASK_ATTEMPTS,
  type ImportRefusal
} from '../../shared/import-recovery'
import type { AnalysisRun, AnalysisCapture } from '../../shared/import-analysis'
import type { AiOperation } from '../../shared/ai'
import { requestDigest } from '../storage/digest'
type RefusalRecord = {
  version: 1
  attemptId: string
  captureDigest: string
  operationId: string
  payloadDigest: string
  sequence: number
  refusal: ImportRefusal
  digest: string
}
function digest(r: RefusalRecord): string {
  const { digest: _, ...body } = r
  void _
  return requestDigest({ contract: 'import-refusal-v1', ...body })
}
function isRecord(v: unknown): v is RefusalRecord {
  return (
    record(v) &&
    exact(v, [
      'version',
      'attemptId',
      'captureDigest',
      'operationId',
      'payloadDigest',
      'sequence',
      'refusal',
      'digest'
    ]) &&
    v.version === 1 &&
    [v.attemptId, v.operationId].every(isId) &&
    [v.captureDigest, v.payloadDigest, v.digest].every(importHash) &&
    Number.isSafeInteger(v.sequence) &&
    Number(v.sequence) >= 0 &&
    isImportRefusal(v.refusal)
  )
}
export function retainedImportRefusal(
  db: Database.Database,
  projectId: string,
  r: AnalysisRun,
  c: AnalysisCapture
): ImportRefusal | null {
  const row = db
    .prepare(
      'SELECT substr(body,1,4001) AS body FROM import_analysis_refusals WHERE project_id=? AND attempt_id=?'
    )
    .get(projectId, r.id) as { body: string } | undefined
  if (!row) return null
  const v: unknown = JSON.parse(row.body)
  if (
    !isRecord(v) ||
    JSON.stringify(v) !== row.body ||
    v.digest !== digest(v) ||
    v.attemptId !== r.id ||
    v.captureDigest !== c.digest ||
    v.sequence + 1 !== r.sequence ||
    ![3, 4].includes(c.version) ||
    r.state !== 'failed' ||
    r.validation !== 'not-completed' ||
    r.reason !== (v.refusal.kind === 'usage-limit' ? 'quota-exhausted' : 'provider-failed')
  )
    throw new ProjectError('CORRUPT_PROJECT')
  return v.refusal
}
export function saveImportRefusal(
  db: Database.Database,
  projectId: string,
  r: AnalysisRun,
  c: AnalysisCapture,
  op: AiOperation
): void {
  if (!op.importRefusal) return
  const v: RefusalRecord = {
    version: 1,
    attemptId: r.id,
    captureDigest: c.digest,
    operationId: op.operationId,
    payloadDigest: op.digest,
    sequence: op.sequence,
    refusal: op.importRefusal,
    digest: ''
  }
  v.digest = digest(v)
  const prior = db
    .prepare('SELECT body FROM import_analysis_refusals WHERE project_id=? AND attempt_id=?')
    .get(projectId, r.id) as { body: string } | undefined
  if (prior && prior.body !== JSON.stringify(v)) throw new ProjectError('OPERATION_CONFLICT')
  if (!prior)
    db.prepare('INSERT INTO import_analysis_refusals VALUES (?,?,?)').run(
      projectId,
      r.id,
      JSON.stringify(v)
    )
  retainedImportRefusal(db, projectId, r, c)
}
/** Retired handoff or an independently reopened/copy-owned terminal record only. */
export function taskRefusal(
  db: Database.Database,
  projectId: string,
  r: AnalysisRun,
  c: AnalysisCapture,
  attempts: number
): { state: 'quota-paused' | 'rate-limited' | 'retry-exhausted'; reason: string } | null {
  const f = retainedImportRefusal(db, projectId, r, c)
  if (!f) return null
  return {
    state:
      attempts >= IMPORT_TASK_ATTEMPTS
        ? 'retry-exhausted'
        : f.kind === 'usage-limit'
          ? 'quota-paused'
          : 'rate-limited',
    reason:
      attempts >= IMPORT_TASK_ATTEMPTS
        ? `This task reached its limit of three attempts. Its last request was refused ${f.kind === 'usage-limit' ? 'because of a ChatGPT plan or app usage limit' : 'by a temporary request limit'}. Your saved findings are kept. Accepting available findings finishes this selection; omitted content afterward needs a new import.`
        : importRefusalMessage(f)
  }
}

export function assertTaskAttempt(ctx: AnalysisContext, capture: AnalysisCapture): void {
  const rows = ctx.db
    .prepare(
      'SELECT c.body AS capture,r.body AS run FROM import_analysis_captures c JOIN import_analysis_runs r ON r.project_id=c.project_id AND r.capture_id=c.id WHERE c.project_id=? AND c.graph_id=? ORDER BY r.rowid'
    )
    .all(ctx.projectId, capture.packet.graphId) as { capture: string; run: string }[]
  let latest: { capture: AnalysisCapture; run: AnalysisRun } | null = null,
    attempts = 0
  for (const row of rows) {
    const c: unknown = JSON.parse(row.capture),
      r: unknown = JSON.parse(row.run)
    if (!isAnalysisCapture(c) || !isAnalysisRun(r)) throw new ProjectError('CORRUPT_PROJECT')
    if (c.version === capture.version && c.packet.captureDigest === capture.packet.captureDigest) {
      attempts++
      if (r.validation === 'valid') throw new ProjectError('OPERATION_CONFLICT')
      latest = { capture: c, run: r }
    }
  }
  if (!latest) return
  const owned = localBinding(ctx, 'import', latest.run.id)
  if (owned.binding && !owned.retired) throw new ProjectError('ACCESS_BUSY')
  const refusal = retainedImportRefusal(ctx.db, ctx.projectId, latest.run, latest.capture)
  if (!refusal || attempts >= IMPORT_TASK_ATTEMPTS) throw new ProjectError('OPERATION_CONFLICT')
  if (refusal.retryNotBefore !== null && Date.now() < refusal.retryNotBefore)
    throw new ProjectError('ACCESS_BUSY')
}
