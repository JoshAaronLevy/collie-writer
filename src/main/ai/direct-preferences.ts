import { isId } from '../../domain/editor/schema'
import { isCatalogModelId } from '../../shared/ai-catalog'
import { exact, record } from '../../shared/projects'

export const PLAN_PREFERENCES_FILE = 'chatgpt-plan-preferences-v1.json'
/** Device-local, encrypted, and keyed by the stable saved registration ID. */
export type PlanPreferences = {
  version: 1
  accounts: { connectionId: string; modelId: string }[]
}
export const emptyPlanPreferences = (): PlanPreferences => ({ version: 1, accounts: [] })
export function isPlanPreferences(value: unknown): value is PlanPreferences {
  return (
    record(value) &&
    exact(value, ['version', 'accounts']) &&
    value.version === 1 &&
    Array.isArray(value.accounts) &&
    value.accounts.length <= 8 &&
    value.accounts.every(
      (entry) =>
        record(entry) &&
        exact(entry, ['connectionId', 'modelId']) &&
        isId(entry.connectionId) &&
        isCatalogModelId(entry.modelId)
    ) &&
    new Set(value.accounts.map((entry) => entry.connectionId)).size === value.accounts.length
  )
}
