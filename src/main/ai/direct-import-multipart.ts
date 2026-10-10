import { isId } from '../../domain/editor/schema'
import { createHash } from 'node:crypto'
import type { AiPrepareInput } from '../../shared/ai'
import {
  isMultiPacket,
  MULTIPART_INSTRUCTIONS,
  MULTIPART_PROMPT
} from '../../shared/import-multipart'
import { operationDigestV1 } from './operation-identity'
import { importFrame, type DirectImportExecution } from './direct-import'
import { exact, record } from '../../shared/projects'
export type DirectMultiImportExecution = Omit<
  DirectImportExecution,
  'framingVersion' | 'template' | 'instructions'
> & {
  framingVersion: 5
  template: 'project-import-analysis-v2'
  instructions: typeof MULTIPART_INSTRUCTIONS
}
export function multipartFits(
  input: Pick<AiPrepareInput, 'prompt' | 'context'>,
  model = 'x'.repeat(100)
): boolean {
  if (input.prompt !== MULTIPART_PROMPT || input.context.length !== 1) return false
  try {
    if (!isMultiPacket(JSON.parse(input.context[0].text))) return false
  } catch {
    return false
  }
  const wire = JSON.stringify({
    model,
    instructions: MULTIPART_INSTRUCTIONS,
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
export function operationDigestV8(
  input: AiPrepareInput,
  execution: DirectMultiImportExecution
): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        domain: 'collie-chatgpt-plan-response',
        version: 8,
        inputDigest: operationDigestV1(input),
        execution
      })
    )
    .digest('hex')
}
export function isDirectMultiImportExecution(
  v: unknown,
  input: AiPrepareInput
): v is DirectMultiImportExecution {
  if (
    !record(v) ||
    v.template !== 'project-import-analysis-v2' ||
    v.framingVersion !== 5 ||
    v.instructions !== MULTIPART_INSTRUCTIONS ||
    v.framedText !== importFrame(input) ||
    !multipartFits(input, input.model)
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
