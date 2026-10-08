import type { AiStatus } from './ai'
import { isCatalogModelId } from './ai-catalog'
import { isId } from '../domain/editor/schema'
import { exact, record } from './projects'
import { isAiActionAvailability, type AiActionAvailability, type AiRoute } from './ai-route'

/** Transient main-owned presentation, never a dispatch grant or portable record.
 * Account IDs are local registration IDs, not provider subjects or credentials. */
export type AiConversationCapabilities = {
  version: 1
  binding: {
    route: AiRoute['kind']
    connectionId: string | null
    model: string | null
    catalogRevision: string | null
    reviewRevision: string
  }
  text: AiActionAvailability
  webResearch: {
    state: 'unavailable'
    reason: 'research-adapter-not-ready' | 'route-not-established'
    contract: 'documented' | 'unestablished'
    eligibility: {
      state: 'unknown'
      reason: 'account-model-unverified' | 'route-unverified'
    }
  }
}

export function isAiConversationCapabilities(v: unknown): v is AiConversationCapabilities {
  if (!record(v) || !exact(v, ['version', 'binding', 'text', 'webResearch'])) return false
  const b = v.binding,
    web = v.webResearch
  return (
    v.version === 1 &&
    record(b) &&
    exact(b, ['route', 'connectionId', 'model', 'catalogRevision', 'reviewRevision']) &&
    ['local-chatgpt-plan', 'local-codex-chatgpt', 'registered-openai', 'unavailable'].includes(
      String(b.route)
    ) &&
    (b.connectionId === null || isId(b.connectionId)) &&
    (b.model === null || isCatalogModelId(b.model)) &&
    (b.catalogRevision === null || isId(b.catalogRevision)) &&
    typeof b.reviewRevision === 'string' &&
    /^[a-f0-9]{64}$/.test(b.reviewRevision) &&
    isAiActionAvailability(v.text) &&
    record(web) &&
    exact(web, ['state', 'reason', 'contract', 'eligibility']) &&
    web.state === 'unavailable' &&
    record(web.eligibility) &&
    exact(web.eligibility, ['state', 'reason']) &&
    web.eligibility.state === 'unknown' &&
    (b.route === 'local-chatgpt-plan'
      ? web.contract === 'documented' &&
        web.reason === 'research-adapter-not-ready' &&
        web.eligibility.reason === 'account-model-unverified'
      : web.contract === 'unestablished' &&
        web.reason === 'route-not-established' &&
        web.eligibility.reason === 'route-unverified')
  )
}

/** Reject stale/mixed capability envelopes at the existing status IPC boundary. */
export function capabilitiesMatchStatus(
  capabilities: AiConversationCapabilities,
  status: Pick<AiStatus, 'route' | 'activeConnectionId' | 'catalog' | 'reviewRevision' | 'features'>
): boolean {
  const b = capabilities.binding,
    catalog = status.catalog
  const text = capabilities.text,
    feature = status.features.conversation
  return (
    b.route === status.route.kind &&
    b.connectionId === status.activeConnectionId &&
    b.model === (catalog?.state === 'loaded' ? catalog.selectedModelId : null) &&
    b.catalogRevision === (catalog?.state === 'loaded' ? catalog.revision : null) &&
    b.reviewRevision === status.reviewRevision &&
    (text.state === 'available'
      ? feature.state === 'available' &&
        text.connectionId === feature.connectionId &&
        text.model === feature.model
      : feature.state === 'unavailable' && text.reason === feature.reason)
  )
}
