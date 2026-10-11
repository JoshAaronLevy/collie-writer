import { isId } from '../../domain/editor/schema'
import { createHash } from 'node:crypto'
import type { AiPrepareInput } from '../../shared/ai'
import {
  isDiscoveryPacket,
  DISCOVERY_INSTRUCTIONS,
  DISCOVERY_PROMPT
} from '../../shared/import-discovery'
import { operationDigestV1 } from './operation-identity'
import { importFrame, type DirectImportExecution } from './direct-import'
import { exact, record } from '../../shared/projects'
export type DirectMappingExecution = Omit<
  DirectImportExecution,
  'framingVersion' | 'template' | 'instructions'
> & {
  template: 'project-import-mapping-v1'
  framingVersion: 8
  instructions: typeof DISCOVERY_INSTRUCTIONS
}
export function mappingFits(
  input: Pick<AiPrepareInput, 'prompt' | 'context'>,
  model = 'x'.repeat(100)
): boolean {
  if (input.prompt !== DISCOVERY_PROMPT || input.context.length !== 1) return false
  try {
    if (!isDiscoveryPacket(JSON.parse(input.context[0].text))) return false
  } catch {
    return false
  }
  const wire = JSON.stringify({
    model,
    instructions: DISCOVERY_INSTRUCTIONS,
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
export function operationDigestV10(
  input: AiPrepareInput,
  execution: DirectMappingExecution
): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        domain: 'collie-chatgpt-plan-response',
        version: 10,
        inputDigest: operationDigestV1(input),
        execution
      })
    )
    .digest('hex')
}
export function isDirectMappingExecution(
  v: unknown,
  input: AiPrepareInput
): v is DirectMappingExecution {
  if (
    !record(v) ||
    v.template !== 'project-import-mapping-v1' ||
    v.framingVersion !== 8 ||
    v.instructions !== DISCOVERY_INSTRUCTIONS ||
    v.framedText !== importFrame(input) ||
    !mappingFits(input, input.model)
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
