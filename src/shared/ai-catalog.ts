import { hasControlCharacters } from './control-characters'
import { isId } from '../domain/editor/schema'
import { exact, record } from './projects'

// Connection-only catalog data. Never part of a portable project or v1 journal.
// The pinned Codex protocol defines ReasoningEffort as an open string. Direct
// catalog entries use null/[] because this route reports no effort contract.
export type CodexReasoningEffort = string
export type AiCatalogModel = {
  id: string
  label: string
  isDefault: boolean
  inputModalities: ('text' | 'image')[]
  reasoningEfforts: CodexReasoningEffort[]
  defaultReasoningEffort: CodexReasoningEffort | null
}
export type AiCatalog =
  | { state: 'not-loaded' }
  | { state: 'loading' }
  | { state: 'failed'; reason: 'model-catalog-unavailable' | 'model-catalog-timeout' }
  | { state: 'loaded'; revision: string; models: AiCatalogModel[]; selectedModelId: string | null }
export type AiSelectModelInput = { connectionId: string; catalogRevision: string; modelId: string }
export type AiExecutionReadiness =
  | { state: 'available' }
  | {
      state: 'unavailable'
      blockers: ('local-tool-isolation-unavailable' | 'local-content-logging-unavailable')[]
    }
export const isCatalogModelId = (v: unknown): v is string =>
  typeof v === 'string' && /^[a-zA-Z0-9._-]{1,100}$/.test(v)
export const isCodexReasoningEffort = (v: unknown): v is CodexReasoningEffort =>
  typeof v === 'string' && /^[a-zA-Z0-9._-]{1,64}$/.test(v)
export function isAiCatalogModel(v: unknown): v is AiCatalogModel {
  return (
    record(v) &&
    exact(v, [
      'id',
      'label',
      'isDefault',
      'inputModalities',
      'reasoningEfforts',
      'defaultReasoningEffort'
    ]) &&
    isCatalogModelId(v.id) &&
    typeof v.label === 'string' &&
    v.label.trim().length > 0 &&
    v.label.length <= 200 &&
    !hasControlCharacters(v.label, false, 0x7f) &&
    typeof v.isDefault === 'boolean' &&
    Array.isArray(v.inputModalities) &&
    v.inputModalities.length > 0 &&
    v.inputModalities.length <= 2 &&
    v.inputModalities.includes('text') &&
    v.inputModalities.every((m) => m === 'text' || m === 'image') &&
    new Set(v.inputModalities).size === v.inputModalities.length &&
    Array.isArray(v.reasoningEfforts) &&
    v.reasoningEfforts.length <= 32 &&
    v.reasoningEfforts.every(isCodexReasoningEffort) &&
    new Set(v.reasoningEfforts).size === v.reasoningEfforts.length &&
    (v.defaultReasoningEffort === null
      ? v.reasoningEfforts.length === 0
      : isCodexReasoningEffort(v.defaultReasoningEffort) &&
        v.reasoningEfforts.includes(v.defaultReasoningEffort))
  )
}
export function isAiCatalog(v: unknown): v is AiCatalog {
  if (!record(v)) return false
  if (v.state === 'not-loaded' || v.state === 'loading') return exact(v, ['state'])
  if (v.state === 'failed')
    return (
      exact(v, ['state', 'reason']) &&
      ['model-catalog-unavailable', 'model-catalog-timeout'].includes(String(v.reason))
    )
  return (
    v.state === 'loaded' &&
    exact(v, ['state', 'revision', 'models', 'selectedModelId']) &&
    isId(v.revision) &&
    Array.isArray(v.models) &&
    v.models.length <= 100 &&
    v.models.every(isAiCatalogModel) &&
    new Set(v.models.map((m) => m.id)).size === v.models.length &&
    (v.selectedModelId === null || v.models.some((m) => m.id === v.selectedModelId))
  )
}
export function isAiSelectModel(v: unknown): v is AiSelectModelInput {
  return (
    record(v) &&
    exact(v, ['connectionId', 'catalogRevision', 'modelId']) &&
    isId(v.connectionId) &&
    isId(v.catalogRevision) &&
    isCatalogModelId(v.modelId)
  )
}
export function isAiExecutionReadiness(v: unknown): v is AiExecutionReadiness {
  if (record(v) && v.state === 'available') return exact(v, ['state'])
  return (
    record(v) &&
    exact(v, ['state', 'blockers']) &&
    v.state === 'unavailable' &&
    Array.isArray(v.blockers) &&
    v.blockers.length > 0 &&
    v.blockers.length <= 2 &&
    new Set(v.blockers).size === v.blockers.length &&
    v.blockers.every(
      (b) => b === 'local-tool-isolation-unavailable' || b === 'local-content-logging-unavailable'
    )
  )
}
