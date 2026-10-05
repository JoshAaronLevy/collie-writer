import { useId, useRef } from 'react'
import { useWorkspaceSession } from '../features/workspace/WorkspaceSession'
import { useRetainedDraft } from '../features/workspace/DraftOwner'
import { scopeOf } from '../features/workspace/useWorkspaceController'

/** Dialog values must be applied or explicitly cancelled before native close or scope replacement. */
export function useEditorFormDraft(label: string, open: boolean, noteMode = false) {
  const { project } = useWorkspaceSession()
  const id = useId(),
    composing = useRef(false)
  const composition = useRetainedDraft(`editor-form-${id}`, {
    read: () => ({
      scope: scopeOf(project!),
      entityId: project!.documentId,
      kind: 'editor-form',
      label,
      dirty: open,
      composing: composing.current,
      busy: false,
      pendingOperation: null,
      policy: 'explicit',
      target: noteMode
        ? {
            kind: 'workspace',
            scope: scopeOf(project!),
            view: 'research',
            target: { kind: 'notes' }
          }
        : {
            kind: 'workspace',
            scope: scopeOf(project!),
            view: 'write',
            documentId: project!.documentId
          }
    })
  })
  return {
    canClose: () => !composing.current,
    events: {
      onCompositionStartCapture: () => {
        composing.current = true
        composition.onCompositionStartCapture()
      },
      onCompositionEndCapture: () => {
        composing.current = false
        composition.onCompositionEndCapture()
      }
    }
  }
}
