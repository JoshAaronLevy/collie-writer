import { useEffect, useMemo, useSyncExternalStore } from 'react'
import type { OpenInput } from '../../../../../shared/projects'
import {
  DRAFT_LIMITS,
  type ChatDraft,
  type DraftRequest,
  type DraftView
} from '../../../../../shared/conversation-drafts'

type Snapshot = {
  drafts: Record<string, ChatDraft>
  chats: DraftView['chats']
  ready: boolean
  dirty: boolean
  issue: string
}
const empty = (): ChatDraft => ({ text: '', contextPolicy: 'project' })

/** Retained per-scope owner. Exact failed writes are retried before newer typing. */
class DraftSession {
  private snapshot: Snapshot = { drafts: {}, chats: [], ready: false, dirty: false, issue: '' }
  private listeners = new Set<() => void>()
  private revision = ''
  private version = 0
  private protectedVersion = 0
  private timer: ReturnType<typeof setTimeout> | undefined
  private writing: Promise<boolean> | null = null
  private reading: Promise<void> | null = null
  private pending: { request: DraftRequest; version: number } | null = null
  constructor(private readonly scope: OpenInput | null) {}
  read = (): Snapshot => this.snapshot
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
  private publish(patch: Partial<Snapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch }
    for (const listener of this.listeners) listener()
  }
  load = (): Promise<void> => {
    if (this.reading) return this.reading
    if (!this.scope || this.snapshot.ready) return Promise.resolve()
    this.reading = (async () => {
      try {
        const result = await window.collie.conversationDrafts({ ...this.scope!, action: 'read' })
        if (!result.ok) throw new Error('unavailable')
        this.revision = result.value.revision
        this.publish({
          ready: true,
          issue: '',
          chats: result.value.chats,
          drafts: Object.fromEntries(
            result.value.entries.map(({ conversationId, ...draft }) => [conversationId, draft])
          )
        })
      } catch {
        this.publish({
          issue:
            'Saved chat drafts could not be read. Retry draft recovery before editing; the saved copy has been kept.'
        })
      } finally {
        this.reading = null
      }
    })()
    return this.reading
  }
  change = (id: string, patch: Partial<ChatDraft>): void => {
    if (!this.snapshot.ready) return
    const drafts = {
      ...this.snapshot.drafts,
      [id]: { ...(this.snapshot.drafts[id] ?? empty()), ...patch }
    }
    if (!drafts[id].text && drafts[id].contextPolicy === 'project') delete drafts[id]
    if (Object.keys(drafts).length > DRAFT_LIMITS.scope) {
      this.publish({
        issue:
          'Twenty chats already have saved drafts or context choices. Open an existing draft and copy, send or discard it before adding another.'
      })
      return
    }
    this.version++
    this.publish({ drafts, dirty: true })
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.timer = undefined
      void this.flush()
    }, 600)
  }
  clear = (id: string): void => this.change(id, empty())
  flush = (): Promise<boolean> => {
    if (this.timer) clearTimeout(this.timer)
    this.timer = undefined
    if (this.writing) return this.writing
    this.writing = (async () => {
      await this.load()
      if (!this.scope) return true
      if (!this.snapshot.ready) return false
      while (this.version !== this.protectedVersion || this.pending) {
        const pending = this.pending ?? {
          version: this.version,
          request: {
            ...this.scope,
            action: 'write' as const,
            revision: this.revision,
            entries: Object.entries(this.snapshot.drafts)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([conversationId, draft]) => ({ conversationId, ...draft }))
          }
        }
        this.pending = pending
        try {
          const result = await window.collie.conversationDrafts(pending.request)
          if (!result.ok) {
            // These refusals occur before writing. Editing/discarding can replace
            // a rejected snapshot; uncertain storage writes still retry exactly.
            if (
              [
                'LIMIT_EXCEEDED',
                'VALIDATION',
                'NOT_FOUND',
                'ACCESS_BUSY',
                'STALE_REVISION'
              ].includes(result.error.code)
            )
              this.pending = null
            this.publish({
              issue:
                result.error.code === 'LIMIT_EXCEEDED'
                  ? 'Draft storage is full on this device. Copy your unsaved text, then discard a draft to free space. Nothing has been evicted.'
                  : 'Chat drafts could not be protected. Keep this window open and retry, or copy your text before discarding it.'
            })
            return false
          }
          this.revision = result.value.revision
          this.protectedVersion = pending.version
          this.pending = null
          this.publish({
            chats: result.value.chats,
            dirty: this.version !== this.protectedVersion,
            issue: ''
          })
        } catch {
          this.publish({
            issue:
              'Draft protection is not confirmed. Keep this window open and retry; your text is retained.'
          })
          return false
        }
      }
      return true
    })().finally(() => {
      this.writing = null
    })
    return this.writing
  }
  retry = (): void => {
    void this.flush()
  }
  detach = (): void => {
    if (this.timer) clearTimeout(this.timer)
    this.timer = undefined
    // Normal replacement/close has already awaited flush through the draft registry.
  }
}
export function useConversationDrafts(
  scope: OpenInput | null
): Snapshot & Pick<DraftSession, 'change' | 'clear' | 'flush' | 'retry'> {
  const owner = useMemo(() => new DraftSession(scope), [scope])
  const snapshot = useSyncExternalStore(owner.subscribe, owner.read)
  useEffect(() => {
    void owner.load()
    return owner.detach
  }, [owner])
  return {
    ...snapshot,
    change: owner.change,
    clear: owner.clear,
    flush: owner.flush,
    retry: owner.retry
  }
}
