import { createContext, useContext, useLayoutEffect, useRef } from 'react'
import { DraftRegistry, type DraftHandle } from './drafts'

export const DraftContext = createContext<DraftRegistry | null>(null)

export function useDraftRegistry(): DraftRegistry {
  const registry = useContext(DraftContext)
  if (!registry) throw new Error('Workspace draft owner is missing')
  return registry
}

/** Must be used only by an instance retained by WorkspaceViews until a guarded scope replacement. */
export function useRetainedDraft(id: string, handle: DraftHandle): {
  onCompositionStartCapture: () => void
  onCompositionEndCapture: () => void
} {
  const registry = useDraftRegistry()
  const latest = useRef(handle), composing = useRef(false)
  latest.current = handle
  useLayoutEffect(() => registry.register(id, {
    read: () => { const state = latest.current.read(); return { ...state, composing: state.composing || composing.current } },
    flush: mode => latest.current.flush?.(mode) ?? Promise.resolve(false),
    focus: () => latest.current.focus?.()
  }), [id, registry])
  useLayoutEffect(() => { registry.changed() })
  return {
    onCompositionStartCapture: () => { composing.current = true; registry.changed() },
    onCompositionEndCapture: () => { composing.current = false; registry.changed() }
  }
}
