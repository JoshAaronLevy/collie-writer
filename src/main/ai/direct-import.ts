import { createHash } from 'node:crypto'
import { isId } from '../../domain/editor/schema'
import { exact, record } from '../../shared/projects'
import type { AiPrepareInput } from '../../shared/ai'
import {
  IMPORT_ANALYSIS_INSTRUCTIONS,
  IMPORT_ANALYSIS_PROMPT,
  isAnalysisPacket
} from '../../shared/import-analysis'
import { operationDigestV1 } from './operation-identity'
import type { DirectExecution } from './direct-operation'
export type DirectImportExecution = Omit<
  DirectExecution,
  'framingVersion' | 'template' | 'instructions'
> & {
  framingVersion: 4
  template: 'project-import-analysis-v1'
  instructions: typeof IMPORT_ANALYSIS_INSTRUCTIONS
}
export function importFrame(input: Pick<AiPrepareInput, 'prompt' | 'context'>): string {
  return JSON.stringify([{ role: 'user', content: input.context[0]?.text ?? '' }])
}
export function importFits(
  input: Pick<AiPrepareInput, 'prompt' | 'context'>,
  model = 'x'.repeat(100)
): boolean {
  if (input.prompt !== IMPORT_ANALYSIS_PROMPT || input.context.length !== 1) return false
  try {
    if (!isAnalysisPacket(JSON.parse(input.context[0].text))) return false
  } catch {
    return false
  }
  const body = JSON.stringify({
    model,
    instructions: IMPORT_ANALYSIS_INSTRUCTIONS,
    input: JSON.parse(importFrame(input)),
    store: false,
    stream: true
  })
  return (
    body.length <= 80000 &&
    Buffer.byteLength(body) <= 320000 &&
    Buffer.byteLength(input.context[0].text) <= 240000
  )
}
export function operationDigestV7(input: AiPrepareInput, execution: DirectImportExecution): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        domain: 'collie-chatgpt-plan-response',
        version: 7,
        inputDigest: operationDigestV1(input),
        execution
      })
    )
    .digest('hex')
}
export function isDirectImportExecution(
  v: unknown,
  input: AiPrepareInput
): v is DirectImportExecution {
  return (
    record(v) &&
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
    v.framingVersion === 4 &&
    v.template === 'project-import-analysis-v1' &&
    v.outputContract === 'responses-text-v1' &&
    [v.accountFingerprint, v.captureDigest].every(
      (d) => typeof d === 'string' && /^[a-f0-9]{64}$/.test(d)
    ) &&
    isId(v.sessionGeneration) &&
    isId(v.catalogRevision) &&
    v.framedText === importFrame(input) &&
    v.instructions === IMPORT_ANALYSIS_INSTRUCTIONS &&
    importFits(input, input.model)
  )
}
