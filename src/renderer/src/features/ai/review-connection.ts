import type { AiStatus } from '../../../../shared/ai'

export type ReviewConnection = {
  connectionId: string | null
  model: string | null
  reviewRevision: string | null
}
export function reviewConnection(
  status: AiStatus | null,
  action: 'conversation' | 'proofread' = 'conversation'
): ReviewConnection {
  return {
    connectionId: status?.activeConnectionId ?? null,
    model: status?.catalog?.state === 'loaded' ? status.catalog.selectedModelId : null,
    reviewRevision:
      (action === 'conversation' ? status?.reviewRevision : status?.proofreadReviewRevision) ?? null
  }
}
export function sameReviewConnection(a: ReviewConnection, b: ReviewConnection): boolean {
  return (
    a.connectionId === b.connectionId &&
    a.model === b.model &&
    a.reviewRevision === b.reviewRevision
  )
}
