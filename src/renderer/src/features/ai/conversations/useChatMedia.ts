import { createContext, useEffect, useState } from 'react'
import type { MediaItem, MediaTarget, MediaValue } from '../../../../../shared/chat-media'
import type { ConversationValue } from '../../../../../shared/conversations'
import type { ProjectResult } from '../../../../../shared/projects'

type Asset = Extract<MediaValue, { type: 'media-asset' }>
type State = {
  key: string
  items: MediaItem[]
  assets: Record<number, Asset | null>
  more: boolean
  failed: boolean
}
const empty: State = { key: '', items: [], assets: {}, more: false, failed: false }
export const ChatMediaContext = createContext<State>(empty)
// Bound ephemeral reads across the mounted timeline, including downloads; no persistent cache.
const waiting: Array<() => void> = []
let active = 0
function read(
  target: MediaTarget,
  index: number | null,
  signal: AbortSignal
): Promise<ProjectResult<ConversationValue> | null> {
  return new Promise((resolve) => {
    const run = (): void => {
      if (signal.aborted) {
        resolve(null)
        waiting.shift()?.()
        return
      }
      active++
      void window.collie
        .conversation({ ...target, action: 'media', index })
        .then(resolve, () => resolve(null))
        .finally(() => {
          active--
          waiting.shift()?.()
        })
    }
    if (active < 3) run()
    else waiting.push(run)
  })
}
export function useChatMedia(target?: MediaTarget): State {
  const projectId = target?.projectId,
    workspaceId = target?.workspaceId,
    messageId = target?.messageId,
    messageRevision = target?.messageRevision
  const key = `${projectId}:${workspaceId}:${messageId}:${messageRevision}`
  const [state, setState] = useState<State>(empty)
  useEffect(() => {
    if (!projectId || !workspaceId || !messageId || !messageRevision) return
    const scope = { projectId, workspaceId, messageId, messageRevision }
    const controller = new AbortController(),
      urls: string[] = []
    void (async () => {
      const listed = await read(scope, null, controller.signal)
      if (controller.signal.aborted) return
      if (!listed?.ok || listed.value.type !== 'media-list') {
        setState({ ...empty, key, failed: true })
        return
      }
      const { items, more } = listed.value
      setState({ ...empty, key, items, more })
      for (const item of items) {
        if (controller.signal.aborted) break
        const result = await read(scope, item.index, controller.signal)
        const asset = result?.ok && result.value.type === 'media-asset' ? result.value : null
        if (asset) {
          if (controller.signal.aborted)
            void window.collie.conversationPresentation('release-media', asset.url)
          else urls.push(asset.url)
        }
        if (!controller.signal.aborted)
          setState((s) =>
            s.key === key ? { ...s, assets: { ...s.assets, [item.index]: asset } } : s
          )
      }
    })()
    return () => {
      controller.abort()
      for (const url of urls) void window.collie.conversationPresentation('release-media', url)
    }
  }, [projectId, workspaceId, messageId, messageRevision, key])
  if (!target) return { ...empty, key: 'unavailable' }
  return state.key === key ? state : empty
}
