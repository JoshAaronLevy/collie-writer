import { isId } from '../../domain/editor/schema'
import { createHash } from 'node:crypto'
import type { AiPrepareInput } from '../../shared/ai'
import {
  isSemanticPacket,
  SEMANTIC_INSTRUCTIONS,
  SEMANTIC_PROMPT
} from '../../shared/import-semantic'
import { operationDigestV1 } from './operation-identity'
import { importFrame, type DirectImportExecution } from './direct-import'
import { exact, record } from '../../shared/projects'
export type DirectSemanticExecution = Omit<
  DirectImportExecution,
  'framingVersion' | 'template' | 'instructions'
> & {
  template: 'project-import-semantic-v1'
  framingVersion: 9
  instructions: typeof SEMANTIC_INSTRUCTIONS
}
export function semanticFits(
  input: Pick<AiPrepareInput, 'prompt' | 'context'>,
  model = 'x'.repeat(100)
): boolean {
  if (input.prompt !== SEMANTIC_PROMPT || input.context.length !== 1) return false
  try {
    if (!isSemanticPacket(JSON.parse(input.context[0].text))) return false
  } catch {
    return false
  }
  const wire = JSON.stringify({
    model,
    instructions: SEMANTIC_INSTRUCTIONS,
    input: JSON.parse(importFrame(input)),
    store: false,
    stream: true
  })
  return (
    wire.length <= 80000 &&
    Buffer.byteLength(wire) <= 320000 &&
    Buffer.byteLength(input.context[0].text) <= 240000
  )
}
export function operationDigestV11(
  input: AiPrepareInput,
  execution: DirectSemanticExecution
): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        domain: 'collie-chatgpt-plan-response',
        version: 11,
        inputDigest: operationDigestV1(input),
        execution
      })
    )
    .digest('hex')
}
export function isDirectSemanticExecution(
  v: unknown,
  input: AiPrepareInput
): v is DirectSemanticExecution {
  if (
    !record(v) ||
    v.template !== 'project-import-semantic-v1' ||
    v.framingVersion !== 9 ||
    v.instructions !== SEMANTIC_INSTRUCTIONS ||
    v.framedText !== importFrame(input) ||
    !semanticFits(input, input.model)
  )
    return false
  return (
    exact(v, [
      'route',
      'policyRevision',
      'framingVersion',
      'template',
      'outputContract',
      'accountFingerprint',
      'sessionGeneration',
      'catalogRevision',
      'captureDigest',
      'framedText',
      'instructions'
    ]) &&
    input.action === 'import' &&
    v.route === 'local-chatgpt-plan' &&
    v.policyRevision === 1 &&
    v.outputContract === 'responses-text-v1' &&
    [v.accountFingerprint, v.captureDigest].every(
      (d) => typeof d === 'string' && /^[a-f0-9]{64}$/.test(d)
    ) &&
    isId(v.sessionGeneration) &&
    isId(v.catalogRevision)
  )
}
