import { isId } from '../../../../../domain/editor/schema'
import { exact, record, isOpenInput, type OpenInput } from '../../../../../shared/projects'
import { sameScope } from '../../../../../shared/project-files'
const key = 'collie.selected-chat.v1'
type Hint = OpenInput & { conversationId: string; updatedAt: number }
function read(): Hint[] {
  try {
    const raw = localStorage.getItem(key)
    if (!raw || raw.length > 65536) return []
    const value: unknown = JSON.parse(raw)
    if (
      !record(value) ||
      !exact(value, ['version', 'items']) ||
      value.version !== 1 ||
      !Array.isArray(value.items) ||
      value.items.length > 128
    )
      return []
    if (
      !value.items.every(
        (h) =>
          record(h) &&
          exact(h, ['projectId', 'workspaceId', 'conversationId', 'updatedAt']) &&
          isOpenInput({ projectId: h.projectId, workspaceId: h.workspaceId }) &&
          isId(h.conversationId) &&
          Number.isSafeInteger(h.updatedAt) &&
          Number(h.updatedAt) >= 0
      )
    )
      return []
    const items = value.items as Hint[]
    if (new Set(items.map((h) => `${h.projectId}:${h.workspaceId}`)).size !== items.length)
      return []
    return items
  } catch {
    return []
  }
}
export function selectedChat(scope: OpenInput): string | null {
  return read().find((h) => sameScope(h, scope))?.conversationId ?? null
}
export function rememberChat(scope: OpenInput, conversationId: string | null): boolean {
  const items = read().filter((h) => !sameScope(h, scope))
  if (conversationId)
    items.push({
      projectId: scope.projectId,
      workspaceId: scope.workspaceId,
      conversationId,
      updatedAt: Date.now()
    })
  items.sort((a, b) => b.updatedAt - a.updatedAt)
  try {
    localStorage.setItem(key, JSON.stringify({ version: 1, items: items.slice(0, 128) }))
    return true
  } catch {
    return false
  }
}
