import { isId } from '../domain/editor/schema'
import { AI_LIMITS, type AiContext } from './ai'
import { exact, record } from './projects'

/** v2 stores complete exchanges in one bounded envelope, independent of UI pages. */
export type ConversationContextPolicy = 'project' | 'chat' | 'message'
export const AUTOMATIC_HISTORY_LIMIT = 256
export type ContextMessage = {
  id: string
  revision: string
  role: 'user' | 'assistant'
  text: string
}
export const isContextPolicy = (v: unknown): v is ConversationContextPolicy =>
  v === 'project' || v === 'chat' || v === 'message'
export function readContextHistory(
  context: Pick<AiContext, 'kind' | 'text'>[]
): ContextMessage[] | null {
  const chunks = context.filter((c) => c.kind === 'history')
  if (!chunks.length) return []
  if (chunks.length !== 1 || chunks[0].text.length > AI_LIMITS.context) return null
  try {
    const v: unknown = JSON.parse(chunks[0].text)
    if (
      !record(v) ||
      !exact(v, ['version', 'messages']) ||
      v.version !== 1 ||
      !Array.isArray(v.messages) ||
      !v.messages.length ||
      v.messages.length > AUTOMATIC_HISTORY_LIMIT ||
      v.messages.length % 2 !== 0 ||
      !v.messages.every(
        (m, i) =>
          record(m) &&
          exact(m, ['id', 'revision', 'role', 'text']) &&
          isId(m.id) &&
          isId(m.revision) &&
          m.role === (i % 2 ? 'assistant' : 'user') &&
          typeof m.text === 'string' &&
          !m.text.includes('\0') &&
          m.text.length <= (i % 2 ? AI_LIMITS.output : AI_LIMITS.prompt)
      ) ||
      new Set(v.messages.map((m) => m.id)).size !== v.messages.length
    )
      return null
    return v.messages as ContextMessage[]
  } catch {
    return null
  }
}
