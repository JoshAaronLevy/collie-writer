import { createHash } from 'node:crypto'
import type { AiPrepareInput } from '../../shared/ai'

/** Frozen I10 journal v1 canonical bytes. Never add route/session defaults here.
 * local-operation.ts owns the separate v2 digest for local execution. */
export function operationDigestV1(input: AiPrepareInput): string {
  const canonical = {
    scope: { projectId: input.scope.projectId, workspaceId: input.scope.workspaceId },
    operationId: input.operationId,
    connectionId: input.connectionId,
    model: input.model,
    action: input.action,
    prompt: input.prompt,
    context: input.context.map((c) => ({
      kind: c.kind,
      id: c.id,
      revision: c.revision,
      label: c.label,
      text: c.text
    }))
  }
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex')
}
