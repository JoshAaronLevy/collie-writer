import { randomUUID } from 'node:crypto'
import { AiStorage } from '../ai/storage'
import { ProjectError } from '../../domain/projects/errors'
import { sameScope } from '../../shared/project-files'
import {
  isDraftFile,
  type DraftFile,
  type DraftRequest,
  type DraftView
} from '../../shared/conversation-drafts'
import { requestDigest } from '../../worker/storage/digest'
import type { ConversationService } from './service'

/** One serialized owner for encrypted device-local drafts; never stores send authority. */
export class ConversationDrafts {
  private readonly storage: AiStorage
  private value: DraftFile | null = null
  private queue: Promise<unknown> = Promise.resolve()
  private pending = 0
  constructor(
    root: () => string | undefined,
    private readonly conversations: ConversationService
  ) {
    this.storage = new AiStorage(root)
  }
  hasPendingWork(): boolean {
    return this.pending > 0
  }
  async settle(): Promise<void> {
    while (this.pending) await this.queue
  }
  command(input: DraftRequest): Promise<DraftView> {
    if (this.pending >= 8) return Promise.reject(new ProjectError('ACCESS_BUSY'))
    this.pending++
    const task = this.queue
      .then(() => this.perform(input))
      .finally(() => {
        this.pending--
      })
    this.queue = task.catch(() => {})
    return task
  }
  private async perform(input: DraftRequest): Promise<DraftView> {
    if (this.storage.workspaceRetired(input)) throw new ProjectError('DENIED')
    const stored = this.value ?? (await this.storage.conversationDrafts())
    this.value = stored
    const previous = stored.entries
      .filter((d) => sameScope(d, input))
      .map(({ conversationId, text, contextPolicy }) => ({ conversationId, text, contextPolicy }))
    const entries = input.action === 'write' ? input.entries : previous
    // The worker checks the active project/workspace even for an empty list.
    const result = await this.conversations.command({
      projectId: input.projectId,
      workspaceId: input.workspaceId,
      action: 'summaries',
      ids: entries.map((d) => d.conversationId)
    })
    if (result.type !== 'list') throw new ProjectError('UNAVAILABLE')
    if (input.action === 'write' && requestDigest(entries) !== requestDigest(previous)) {
      if (input.revision !== stored.revision) throw new ProjectError('STALE_REVISION')
      if (
        entries.some(
          (d) =>
            !previous.some((p) => p.conversationId === d.conversationId) &&
            !result.items.some((c) => c.id === d.conversationId)
        )
      )
        throw new ProjectError('NOT_FOUND')
      const next: DraftFile = {
        version: 1,
        revision: randomUUID(),
        entries: [
          ...stored.entries.filter((d) => !sameScope(d, input)),
          ...entries.map((d) => ({
            ...d,
            projectId: input.projectId,
            workspaceId: input.workspaceId
          }))
        ]
      }
      if (!isDraftFile(next)) throw new ProjectError('LIMIT_EXCEEDED')
      await this.storage.saveConversationDrafts(next)
      this.value = next
    }
    return {
      revision: this.value.revision,
      entries,
      chats: result.items.map(({ id, title, state }) => ({ id, title, state }))
    }
  }
}
