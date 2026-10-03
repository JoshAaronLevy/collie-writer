import { isId } from '../../domain/editor/schema'
import { aiText } from '../../shared/ai'
import { exact, record } from '../../shared/projects'

/** Separate encrypted local envelope, reserved for CD02's session owner. This
 * metadata neither contains Codex credentials nor proves a live authenticated
 * session. No reader/writer or profile creation is activated by CD01. */
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
