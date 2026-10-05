import type { StorageWorker } from '../storage-worker'
import type { AiService } from '../ai/service'
import { AiContentService } from '../ai/content-service'
import { ProjectError } from '../../domain/projects/errors'
import {
  isConversationValue,
  type ConversationRequest,
  type ConversationWorkerInput,
  type ConversationValue
} from '../../shared/conversations'
/** Conversation-specific public boundary over the shared durable AI run owner. */
export class ConversationService extends AiContentService {
  constructor(storage: StorageWorker, ai: AiService) {
    super(storage, ai, 'conversation')
  }
  override async worker(input: ConversationWorkerInput): Promise<ConversationValue> {
    const value = await super.worker(input)
    if (!isConversationValue(value)) throw new ProjectError('UNAVAILABLE')
    return value
  }
  override async command(
    input: Exclude<ConversationRequest, { action: 'export' }>
  ): Promise<ConversationValue> {
    const value = await super.command(input)
    if (!isConversationValue(value)) throw new ProjectError('UNAVAILABLE')
    return value
  }
}
