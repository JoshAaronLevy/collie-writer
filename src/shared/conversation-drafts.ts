import { isId } from '../domain/editor/schema'
import { aiText, AI_LIMITS } from './ai'
import { isContextPolicy, type ConversationContextPolicy } from './conversation-context'
import { exact, record, isOpenInput, type OpenInput, type ProjectResult } from './projects'

export const CONVERSATION_DRAFTS = 'conversations.drafts'
export const DRAFT_LIMITS = { scope: 20, total: 128, characters: 500000 } as const
export type ChatDraft = { text: string; contextPolicy: ConversationContextPolicy }
export type StoredChatDraft = ChatDraft & { conversationId: string }
export type DraftFile = {
  version: 1
  revision: string
  entries: (OpenInput & StoredChatDraft)[]
}
export type DraftRequest = OpenInput &
  ({ action: 'read' } | { action: 'write'; revision: string; entries: StoredChatDraft[] })
export type DraftView = {
  revision: string
  entries: StoredChatDraft[]
  chats: { id: string; title: string; state: 'active' | 'archived' }[]
}
export type ConversationDraftAPI = {
  conversationDrafts(input: DraftRequest): Promise<ProjectResult<DraftView>>
}
export function isStoredChatDraft(v: unknown): v is StoredChatDraft {
  return (
    record(v) &&
    exact(v, ['conversationId', 'text', 'contextPolicy']) &&
    isId(v.conversationId) &&
    aiText(v.text, AI_LIMITS.prompt) &&
    isContextPolicy(v.contextPolicy)
  )
}
function entries(v: unknown): v is StoredChatDraft[] {
  return (
    Array.isArray(v) &&
    v.length <= DRAFT_LIMITS.scope &&
    v.every(isStoredChatDraft) &&
    new Set(v.map((d) => d.conversationId)).size === v.length
  )
}
export function isDraftRequest(v: unknown): v is DraftRequest {
  if (!record(v) || !isOpenInput({ projectId: v.projectId, workspaceId: v.workspaceId }))
    return false
  const fields = ['projectId', 'workspaceId', 'action']
  return v.action === 'read'
    ? exact(v, fields)
    : v.action === 'write' &&
        exact(v, [...fields, 'revision', 'entries']) &&
        isId(v.revision) &&
        entries(v.entries)
}
export function isDraftView(v: unknown): v is DraftView {
  return (
    record(v) &&
    exact(v, ['revision', 'entries', 'chats']) &&
    isId(v.revision) &&
    entries(v.entries) &&
    Array.isArray(v.chats) &&
    v.chats.length <= DRAFT_LIMITS.scope &&
    v.chats.every(
      (c) =>
        record(c) &&
        exact(c, ['id', 'title', 'state']) &&
        isId(c.id) &&
        aiText(c.title, 160) &&
        (c.state === 'active' || c.state === 'archived')
    )
  )
}
export function isDraftFile(v: unknown): v is DraftFile {
  if (
    !record(v) ||
    !exact(v, ['version', 'revision', 'entries']) ||
    v.version !== 1 ||
    !isId(v.revision) ||
    !Array.isArray(v.entries) ||
    v.entries.length > DRAFT_LIMITS.total
  )
    return false
  let characters = 0
  const keys = new Set<string>(),
    scopes = new Map<string, number>()
  for (const item of v.entries) {
    if (!record(item)) return false
    const { projectId, workspaceId, ...draft } = item
    if (!isOpenInput({ projectId, workspaceId }) || !isStoredChatDraft(draft)) return false
    const scope = `${projectId}:${workspaceId}`,
      key = `${scope}:${draft.conversationId}`
    const count = (scopes.get(scope) ?? 0) + 1
    if (
      keys.has(key) ||
      count > DRAFT_LIMITS.scope ||
      (characters += draft.text.length) > DRAFT_LIMITS.characters
    )
      return false
    keys.add(key)
    scopes.set(scope, count)
  }
  return true
}
