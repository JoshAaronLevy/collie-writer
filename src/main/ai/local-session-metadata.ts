import { isId } from '../../domain/editor/schema'
import { aiText } from '../../shared/ai'
import { exact, record } from '../../shared/projects'

/** CD01's separate v1 declaration stays exact as a read-only compatibility
 * input. Metadata contains no credentials and proves no live session. CD02
 * writes the v2 lifecycle envelope below, retaining any original v1 file. */
export const LOCAL_CODEX_METADATA_FILE = 'codex-local-session-v1.json'
export type LocalCodexMetadataV1 = {
  version: 1
  route: 'local-codex-chatgpt'
  policyRevision: 1
  profileId: string
  account: { connectionId: string; label: string } | null
}

export function isLocalCodexMetadataV1(value: unknown): value is LocalCodexMetadataV1 {
  return record(value) && exact(value, ['version', 'route', 'policyRevision', 'profileId', 'account']) &&
    value.version === 1 && value.route === 'local-codex-chatgpt' && value.policyRevision === 1 && isId(value.profileId) &&
    (value.account === null || record(value.account) && exact(value.account, ['connectionId', 'label']) &&
      isId(value.account.connectionId) && aiText(value.account.label, 200) && value.account.label.trim().length > 0 &&
      !/[\u0000-\u001f\u007f]/u.test(value.account.label))
}

/** V1 remains readable and is never rewritten. V2 protects candidate/retired
 * namespaces before any credential mutation; only active can ever be resumed. */
export const LOCAL_CODEX_SESSION_FILE = 'codex-local-session-v2.json'
export type LocalCodexProfile = { profileId: string; account: { connectionId: string; label: string } }
export type LocalCodexSessionV2 = {
  version: 2
  route: 'local-codex-chatgpt'
  policyRevision: 1
  active: LocalCodexProfile | null
  retired: string[]
  lastAttempt: { attemptId: string; connectionId: string | null } | null
}
export const emptyLocalSession = (): LocalCodexSessionV2 => ({ version: 2, route: 'local-codex-chatgpt', policyRevision: 1, active: null, retired: [], lastAttempt: null })
export function isLocalCodexSessionV2(value: unknown): value is LocalCodexSessionV2 {
  if (!record(value) || !exact(value, ['version', 'route', 'policyRevision', 'active', 'retired', 'lastAttempt']) ||
    value.version !== 2 || value.route !== 'local-codex-chatgpt' || value.policyRevision !== 1) return false
  const active = value.active
  return (active === null || record(active) && exact(active, ['profileId', 'account']) &&
    isLocalCodexMetadataV1({ version: 1, route: value.route, policyRevision: 1, ...active }) && active.account !== null) &&
    Array.isArray(value.retired) && value.retired.length <= 8 && value.retired.every(isId) &&
    new Set(value.retired).size === value.retired.length && (!record(active) || !value.retired.some(id=>id===active.profileId)) &&
    (value.lastAttempt === null || record(value.lastAttempt) && exact(value.lastAttempt, ['attemptId', 'connectionId']) &&
      isId(value.lastAttempt.attemptId) && (value.lastAttempt.connectionId === null || isId(value.lastAttempt.connectionId)))
}
