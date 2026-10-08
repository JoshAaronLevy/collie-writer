import type { AiStatus } from '../../shared/ai'
import type { AiConversationCapabilities } from '../../shared/ai-capabilities'

/** No network, cache or credential access. Catalog discovery establishes neither
 * tool eligibility nor a completed inference. Availability permits an explicit request. */
export function conversationCapabilities(
  status: Pick<
    AiStatus,
    'route' | 'activeConnectionId' | 'catalog' | 'reviewRevision' | 'features'
  >,
  observation: 'observed-success' | 'observed-refusal' | null = null
): AiConversationCapabilities {
  const direct = status.route.kind === 'local-chatgpt-plan'
  const catalog = status.catalog
  return {
    version: 2,
    binding: {
      route: status.route.kind,
      connectionId: status.activeConnectionId,
      model: catalog?.state === 'loaded' ? catalog.selectedModelId : null,
      catalogRevision: catalog?.state === 'loaded' ? catalog.revision : null,
      reviewRevision: status.reviewRevision
    },
    text: { ...status.features.conversation },
    webResearch: {
      state:
        direct && status.features.conversation.state === 'available' ? 'available' : 'unavailable',
      reason: direct
        ? status.features.conversation.state === 'available'
          ? null
          : 'text-unavailable'
        : 'route-not-established',
      contract: direct ? 'documented' : 'unestablished',
      eligibility:
        direct && observation
          ? { state: observation, reason: 'last-research-request' }
          : {
              state: 'unknown',
              reason: direct ? 'account-model-unverified' : 'route-unverified'
            }
    }
  }
}
