import { isAiHandoffReceipt, type AiHandoffReceipt } from '../../shared/ai-handoff'
import { requestDigest } from '../../worker/storage/digest'
import { contentOperation, type RetainedOperation } from './local-operation'

export function handoffMatches(item: RetainedOperation, receipt: AiHandoffReceipt): boolean {
  const op = contentOperation(item)
  return (
    isAiHandoffReceipt(receipt) &&
    receipt.operationId === op.operationId &&
    receipt.operationVersion === item.version &&
    receipt.scope.projectId === op.scope.projectId &&
    receipt.scope.workspaceId === op.scope.workspaceId &&
    receipt.purpose === op.action &&
    receipt.payloadDigest === op.digest &&
    receipt.sequence === op.sequence &&
    receipt.state === op.state &&
    op.finishedAt !== null &&
    receipt.resultDigest === requestDigest(op) &&
    (item.version === 1 || receipt.captureDigest === item.execution.captureDigest)
  )
}
