import type { AiStatus } from '../../shared/ai'
import type { AiConversationCapabilities } from '../../shared/ai-capabilities'

/** No network, cache or credential access. Catalog discovery establishes neither
 * tool eligibility nor a completed inference. AC06 owns the research adapter. */
export function conversationCapabilities(
  status: Pick<AiStatus, 'route' | 'activeConnectionId' | 'catalog' | 'reviewRevision' | 'features'>
): AiConversationCapabilities {
  const direct = status.route.kind === 'local-chatgpt-plan'
  const catalog = status.catalog
  return {
    version: 1,
    binding: {
      route: status.route.kind,
      connectionId: status.activeConnectionId,
      model: catalog?.state === 'loaded' ? catalog.selectedModelId : null,
      catalogRevision: catalog?.state === 'loaded' ? catalog.revision : null,
      reviewRevision: status.reviewRevision
    },
    text: { ...status.features.conversation },
    webResearch: {
      state: 'unavailable',
      reason: direct ? 'research-adapter-not-ready' : 'route-not-established',
      contract: direct ? 'documented' : 'unestablished',
      eligibility: {
        state: 'unknown',
        reason: direct ? 'account-model-unverified' : 'route-unverified'
      }
    }
  }
}
