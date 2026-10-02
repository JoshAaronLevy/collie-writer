import type { AiReason } from '../../shared/ai'

/** Never serialize provider messages, URLs, token responses or subprocess stderr. */
export class AiError extends Error {
  constructor(readonly reason: AiReason) { super(reason) }
}
export function aiReason(error: unknown): AiReason { return error instanceof AiError ? error.reason : 'provider-failed' }
