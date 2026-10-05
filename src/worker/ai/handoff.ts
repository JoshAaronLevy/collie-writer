import type Database from 'better-sqlite3'
import { ProjectError } from '../../domain/projects/errors'
import { AI_LIMITS, type AiOperation } from '../../shared/ai'
import { isAiHandoffReceipt, type AiHandoffReceipt } from '../../shared/ai-handoff'
import {
  bindingVersion,
  isProofreadingBinding,
  isConversationBinding,
  type ConversationBinding
} from '../../shared/conversations'
import type { OpenInput } from '../../shared/projects'
import { requestDigest } from '../storage/digest'
import { inWriteTransaction } from '../storage/driver'

type Purpose = AiHandoffReceipt['purpose']
type Context = OpenInput & { db: Database.Database; operations: Database.Database }
const kind = (purpose: Purpose): string =>
  purpose === 'conversation' ? 'conversation-binding' : 'proofreading-binding'
function parse<T>(raw: unknown, valid: (v: unknown) => v is T): T {
  if (typeof raw !== 'string' || raw.length > 16000) throw new ProjectError('CORRUPT_PROJECT')
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    throw new ProjectError('CORRUPT_PROJECT')
  }
  if (!valid(value)) throw new ProjectError('CORRUPT_PROJECT')
  return value
}
export function activeBindings(
  operations: Database.Database,
  purpose: Purpose
): ConversationBinding[] {
  const rows = operations
    .prepare(
      "SELECT id,operation_id,substr(result,1,16001) AS result FROM jobs WHERE kind=? AND state='bound' ORDER BY created_at,id LIMIT ?"
    )
    .all(kind(purpose), AI_LIMITS.jobs + 1) as {
    id: string
    operation_id: string
    result: string
  }[]
  if (rows.length > AI_LIMITS.jobs) throw new ProjectError('CORRUPT_PROJECT')
  return rows.map((row) => {
    const b = parse(
      row.result,
      purpose === 'conversation' ? isConversationBinding : isProofreadingBinding
    )
    if (b.attemptId !== row.id || b.operationId !== row.operation_id)
      throw new ProjectError('CORRUPT_PROJECT')
    return b
  })
}
/** Exact indexed read also finds retained bindings; never scans cold history. */
export function localBinding(
  context: Context,
  purpose: Purpose,
  attemptId: string
): {
  type: 'binding'
  binding: ConversationBinding | null
  receipt: AiHandoffReceipt | null
  retired: boolean
} {
  const row = context.operations
    .prepare('SELECT kind,state,operation_id,substr(result,1,16001) AS result FROM jobs WHERE id=?')
    .get(attemptId) as
    { kind: string; state: string; operation_id: string; result: string } | undefined
  if (!row) return { type: 'binding', binding: null, receipt: null, retired: false }
  if (row.kind !== kind(purpose) || !['bound', 'retained-v1'].includes(row.state))
    throw new ProjectError('CORRUPT_PROJECT')
  const binding = parse(
    row.result,
    purpose === 'conversation' ? isConversationBinding : isProofreadingBinding
  )
  if (binding.attemptId !== attemptId || binding.operationId !== row.operation_id)
    throw new ProjectError('CORRUPT_PROJECT')
  const saved = context.operations
    .prepare('SELECT kind,state,operation_id,substr(result,1,16001) AS result FROM jobs WHERE id=?')
    .get(binding.operationId) as
    { kind: string; state: string; operation_id: string; result: string } | undefined
  let receipt: AiHandoffReceipt | null = null
  if (saved) {
    if (
      saved.kind !== 'ai-handoff-v1' ||
      saved.state !== 'committed' ||
      saved.operation_id !== binding.operationId
    )
      throw new ProjectError('CORRUPT_PROJECT')
    receipt = parse(saved.result, isAiHandoffReceipt)
    if (
      receipt.scope.projectId !== context.projectId ||
      receipt.scope.workspaceId !== context.workspaceId ||
      receipt.purpose !== purpose ||
      receipt.attemptId !== attemptId ||
      receipt.operationId !== binding.operationId ||
      receipt.operationVersion !== bindingVersion(binding) ||
      receipt.payloadDigest !== binding.digest ||
      receipt.captureDigest !== binding.captureDigest
    )
      throw new ProjectError('DENIED')
  }
  if (row.state === 'retained-v1' && !receipt) throw new ProjectError('CORRUPT_PROJECT')
  return { type: 'binding', binding, receipt, retired: row.state === 'retained-v1' }
}
/** Called only after the feature compares its committed portable result with
 * the protected operation. FULL-synchronous operations SQLite owns this receipt. */
export function protectHandoff(
  context: Context,
  purpose: Purpose,
  binding: ConversationBinding,
  operation: AiOperation,
  acknowledged: boolean,
  portable: { revision: string; head: string; body: unknown }
): AiHandoffReceipt {
  const owned = localBinding(context, purpose, binding.attemptId)
  if (
    !owned.binding ||
    requestDigest(owned.binding) !== requestDigest(binding) ||
    operation.scope.projectId !== context.projectId ||
    operation.scope.workspaceId !== context.workspaceId ||
    operation.operationId !== binding.operationId ||
    operation.digest !== binding.digest ||
    operation.connectionId !== binding.connectionId ||
    operation.model !== binding.model ||
    operation.action !== purpose ||
    operation.finishedAt === null ||
    !['completed', 'cancelled', 'failed', 'unknown'].includes(operation.state) ||
    (operation.state !== 'completed' && !acknowledged)
  )
    throw new ProjectError('DENIED')
  const receipt: AiHandoffReceipt = {
    version: 1,
    scope: { projectId: context.projectId, workspaceId: context.workspaceId },
    purpose,
    attemptId: binding.attemptId,
    operationId: operation.operationId,
    operationVersion: bindingVersion(binding),
    payloadDigest: operation.digest,
    captureDigest: binding.captureDigest,
    resultDigest: requestDigest(operation),
    sequence: operation.sequence,
    state: operation.state as AiHandoffReceipt['state'],
    acknowledged,
    portableRevision: portable.revision,
    portableHead: portable.head,
    portableDigest: requestDigest(portable.body)
  }
  if (!isAiHandoffReceipt(receipt)) throw new ProjectError('VALIDATION')
  if (owned.receipt) {
    const prior = owned.receipt
    if (
      prior.resultDigest !== receipt.resultDigest ||
      prior.portableDigest !== receipt.portableDigest ||
      prior.portableRevision !== receipt.portableRevision ||
      !context.db
        .prepare('SELECT id FROM commits WHERE project_id=? AND id=?')
        .get(context.projectId, prior.portableHead)
    )
      throw new ProjectError('OPERATION_CONFLICT')
    return prior
  }
  inWriteTransaction(context.operations, () =>
    context.operations
      .prepare('INSERT INTO jobs VALUES (?,?,?,?,?,?)')
      .run(
        receipt.operationId,
        receipt.operationId,
        'ai-handoff-v1',
        'committed',
        new Date().toISOString(),
        JSON.stringify(receipt)
      )
  )
  return receipt
}
export function retireBinding(context: Context, purpose: Purpose, receipt: AiHandoffReceipt): void {
  const owned = localBinding(context, purpose, receipt.attemptId)
  if (!owned.receipt || requestDigest(owned.receipt) !== requestDigest(receipt))
    throw new ProjectError('DENIED')
  inWriteTransaction(context.operations, () =>
    context.operations
      .prepare("UPDATE jobs SET state='retained-v1' WHERE id=? AND kind=?")
      .run(receipt.attemptId, kind(purpose))
  )
}
