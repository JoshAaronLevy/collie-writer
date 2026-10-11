import { createHash } from 'node:crypto'
import type { AiPrepareInput } from '../../shared/ai'
import { operationDigestV1 } from './operation-identity'
import { isDirectMappingExecution, type DirectMappingExecution } from './direct-import-mapping'
import { isDirectSemanticExecution, type DirectSemanticExecution } from './direct-import-semantic'
export type DirectHybridExecution = DirectMappingExecution | DirectSemanticExecution
export function isDirectHybridExecution(
  v: unknown,
  input: AiPrepareInput
): v is DirectHybridExecution {
  return isDirectMappingExecution(v, input) || isDirectSemanticExecution(v, input)
}
export function operationDigestV12(
  input: AiPrepareInput,
  execution: DirectHybridExecution
): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        domain: 'collie-chatgpt-plan-response',
        version: 12,
        inputDigest: operationDigestV1(input),
        execution
      })
    )
    .digest('hex')
}
