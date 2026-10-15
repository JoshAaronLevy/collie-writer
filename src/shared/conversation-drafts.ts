import { isPlanningScope, type PlanningScope } from './planning-conversation'
import { isId } from '../domain/editor/schema'
import { aiText, AI_LIMITS } from './ai'
import { isContextPolicy, type ConversationContextPolicy } from './conversation-context'
import { exact, record, isOpenInput, type OpenInput, type ProjectResult } from './projects'

export const CONVERSATION_DRAFTS = 'conversations.drafts'
export const DRAFT_LIMITS = { scope: 20, total: 128, characters: 500000 } as const
export type ChatDraft = {
  text: string
  previews?: { attemptId: string; messageRevision: string; text: string }[]
  contextPolicy: ConversationContextPolicy
  planning?: (
    | { version: 1 }
    | { version: 3 }
    | { version: 2; outline: { version: 1; baseVersionId: string | null } }
  ) & { scope: PlanningScope; mode: 'collection' | 'question'; search: boolean }
}
export type StoredChatDraft = ChatDraft & { conversationId: string }
export type DraftFile = {
  version: 1 | 2 | 3 | 4
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
    exact(v, [
      'conversationId',
      'text',
      'contextPolicy',
      ...(v.planning === undefined ? [] : ['planning']),
      ...(v.previews === undefined ? [] : ['previews'])
    ]) &&
    (v.previews === undefined ||
      (Array.isArray(v.previews) &&
        v.previews.length <= 20 &&
        v.previews.every(
          (p) =>
            record(p) &&
            exact(p, ['attemptId', 'messageRevision', 'text']) &&
            isId(p.attemptId) &&
            isId(p.messageRevision) &&
            aiText(p.text, 128000)
        ) &&
        new Set(v.previews.map((p) => p.attemptId)).size === v.previews.length)) &&
    (v.planning === undefined ||
      (record(v.planning) &&
        exact(v.planning, [
          'version',
          'scope',
          'mode',
          'search',
          ...(v.planning.version === 2 ? ['outline'] : [])
        ]) &&
        (v.planning.version === 1 ||
          (v.planning.version === 3 && v.planning.mode === 'question') ||
          (v.planning.version === 2 &&
            record(v.planning.outline) &&
            exact(v.planning.outline, ['version', 'baseVersionId']) &&
            v.planning.outline.version === 1 &&
            (v.planning.outline.baseVersionId === null ||
              isId(v.planning.outline.baseVersionId)))) &&
        isPlanningScope(v.planning.scope) &&
        ['question', 'collection'].includes(String(v.planning.mode)) &&
        (v.planning.version !== 2 || v.planning.mode === 'collection') &&
        typeof v.planning.search === 'boolean')) &&
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
    (v.version !== 1 && v.version !== 2 && v.version !== 3 && v.version !== 4) ||
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
    if (
      !isOpenInput({ projectId, workspaceId }) ||
      !isStoredChatDraft(draft) ||
      (v.version === 1 && draft.planning !== undefined) ||
      (v.version < 3 && draft.planning?.version === 2) ||
      (v.version < 4 && (draft.planning?.version === 3 || draft.previews !== undefined))
    )
      return false
    const scope = `${projectId}:${workspaceId}`,
      key = `${scope}:${draft.conversationId}`
    const count = (scopes.get(scope) ?? 0) + 1
    if (
      keys.has(key) ||
      count > DRAFT_LIMITS.scope ||
      (characters +=
        draft.text.length + (draft.previews?.reduce((n, p) => n + p.text.length, 0) ?? 0)) >
        DRAFT_LIMITS.characters
    )
      return false
    keys.add(key)
    scopes.set(scope, count)
  }
  return true
}
