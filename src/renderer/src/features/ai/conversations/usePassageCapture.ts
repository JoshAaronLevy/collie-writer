import { useState } from 'react'
import { useSynchronousState } from '../../../hooks/useSynchronousState'
import type { NoteChangeInput } from '../../../../../shared/notes'
import type { PassageSelection } from '../../../../../shared/note-passage'
import { sameScope } from '../../../../../shared/project-files'
import { scopeOf } from '../../../../../shared/projects'
import { useWorkspaceSession } from '../../workspace/workspaceContext'
import { useRetainedDraft } from '../../workspace/DraftOwner'
import type { OpenInput } from '../../../../../shared/projects'

type PassageCapture = {
  keep: (passage?: PassageSelection) => Promise<void>
  pending: NoteChangeInput | null
  busy: boolean
  issue: string
  saved: (OpenInput & { noteId: string }) | null
  unavailable: boolean
}

/** One exact retained write for all mounted native and imported messages. */
export function usePassageCapture(): PassageCapture {
  const session = useWorkspaceSession()
  const [pending, setPending, retained] = useSynchronousState<NoteChangeInput | null>(null)
  const [busy, setBusy, running] = useSynchronousState(false)
  const [issue, setIssue] = useState('')
  const [saved, setSaved] = useState<{
    projectId: string
    workspaceId: string
    noteId: string
  } | null>(null)
  const unavailable =
    session.accessReadOnly ||
    session.accessTransition ||
    session.closing ||
    session.navigating ||
    session.fileActive ||
    session.busy ||
    session.storage.state !== 'ready'
  async function keep(passage?: PassageSelection): Promise<void> {
    if (!session.project || unavailable || running.current || session.composition.current) return
    const input =
      retained.current ??
      (passage
        ? {
            ...scopeOf(session.project),
            operationId: crypto.randomUUID(),
            change: {
              type: 'capturePassage' as const,
              id: crypto.randomUUID(),
              passage: structuredClone(passage)
            }
          }
        : null)
    if (!input || !sameScope(session.project, input)) return
    if (retained.current && passage) {
      setIssue('Retry the pending passage before keeping another.')
      return
    }
    setPending(input)
    setBusy(true)
    setIssue('')
    setSaved(null)
    try {
      const result = await window.collie.changeNote(input)
      if (!result.ok) {
        const rejected = [
          'STALE_REVISION',
          'VALIDATION',
          'NOT_FOUND',
          'OPERATION_CONFLICT'
        ].includes(result.error.code)
        if (rejected) setPending(null)
        setIssue(
          rejected
            ? `${result.error.message} Select the passage again to keep its current text.`
            : result.error.message
        )
        return
      }
      if (!result.value.notes.some((n) => n.id === input.change.id && n.passage))
        throw new Error('The kept passage could not be confirmed. Retry this same save.')
      setPending(null)
      setSaved({
        projectId: input.projectId,
        workspaceId: input.workspaceId,
        noteId: input.change.id
      })
      await session.refreshConversationHead(input)
    } catch (error) {
      setIssue(
        error instanceof Error ? error.message : 'Could not confirm this passage. Retry its save.'
      )
    } finally {
      setBusy(false)
    }
  }
  useRetainedDraft('chat-passage', {
    read: () => ({
      scope: retained.current ?? { projectId: '', workspaceId: '' },
      kind: 'note',
      entityId: retained.current?.change.id ?? null,
      label: 'kept chat passage',
      dirty: false,
      composing: false,
      busy: running.current,
      pendingOperation: retained.current,
      policy: 'retain',
      issue,
      target: {
        kind: 'workspace',
        scope: retained.current ?? { projectId: '', workspaceId: '' },
        view: 'write'
      }
    }),
    focus: () => session.writingView.revealPanel('ai')
  })
  return {
    keep,
    pending,
    busy,
    issue,
    saved: sameScope(session.project, saved) ? saved : null,
    unavailable
  }
}
