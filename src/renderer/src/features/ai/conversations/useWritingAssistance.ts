import { useRef } from 'react'
import {
  captureWritingSelection,
  insertWritingSelection,
  type WritingSelection
} from '../../../editor/writing-assistance'
import { sameScope } from '../../../../../shared/project-files'
import { scopeOf, type OpenProject } from '../../../../../shared/projects'
import type { WritingInput } from '../../../../../shared/writing-assistance'
import { effectiveState, isEditableKind } from '../../../../../shared/outline'
import type { useWorkspaceSession } from '../../workspace/workspaceContext'

type Target = WritingSelection & { project: OpenProject; title: string; used: boolean }
/** Only this mounted editor session owns insertion authority; none is serialized. */
export function useWritingAssistance(
  current: React.RefObject<ReturnType<typeof useWorkspaceSession>>
): {
  capture: () => Target
  input: (target: Target, saved: OpenProject) => WritingInput
  remember: (id: string, target: Target) => void
  insert: (id: string, text: string) => void
  target: (id: string) => Target | undefined
  retarget: (id: string) => void
} {
  const targets = useRef(new Map<string, Target>())
  function capture(): Target {
    const s = current.current,
      p = s.project,
      doc = p?.documents.find((d) => d.id === p.documentId)
    if (
      !p ||
      !doc ||
      !isEditableKind(doc.kind) ||
      effectiveState(doc, p.documents) !== 'active' ||
      s.destination.kind !== 'workspace' ||
      s.destination.view !== 'write' ||
      s.accessReadOnly ||
      s.accessTransition ||
      s.closing ||
      s.navigating ||
      s.busy ||
      s.acting ||
      s.fileActive ||
      s.proofreadingLocked ||
      s.composition.current ||
      s.storage.state !== 'ready'
    )
      throw new Error(
        'Return to an editable chapter in Write and choose a cursor position or selection.'
      )
    return {
      ...captureWritingSelection(s.editorRef.current),
      project: p,
      title: doc.title,
      used: false
    }
  }
  function input(target: Target, saved: OpenProject): WritingInput {
    if (
      !sameScope(saved, target.project) ||
      saved.documentId !== target.project.documentId ||
      target.editor !== current.current.editorRef.current ||
      target.editor.isDestroyed ||
      !target.document.eq(target.editor.state.doc)
    )
      throw new Error(
        'The writing changed during preparation. Your draft is kept; choose a position and Send again.'
      )
    target.project = saved
    return {
      version: 1,
      documentId: saved.documentId,
      revisionId: saved.revisionId,
      from: target.from,
      to: target.to
    }
  }
  function key(id: string): string {
    const p = current.current.project
    return `${p?.projectId}:${p?.workspaceId}:${id}`
  }
  function remember(id: string, target: Target): void {
    if (targets.current.size >= 64) targets.current.delete(targets.current.keys().next().value!)
    targets.current.set(key(id), target)
  }
  function insert(id: string, text: string): void {
    const target = targets.current.get(key(id)),
      live = capture()
    if (!target || target.used)
      throw new Error('Choose a cursor position or selection for this preview first.')
    if (
      !sameScope(scopeOf(live.project), target.project) ||
      live.project.documentId !== target.project.documentId
    )
      throw new Error(
        'This preview targets another chapter. Return to it or explicitly choose a new position.'
      )
    if (live.project.revisionId !== target.project.revisionId)
      throw new Error(
        'The chapter revision changed. Your preview is kept; explicitly choose a new position before inserting.'
      )
    insertWritingSelection(target, live.editor, text)
    target.used = true
  }
  return {
    capture,
    input,
    remember,
    insert,
    target: (id: string) => targets.current.get(key(id)),
    retarget: (id: string) => remember(id, capture())
  }
}
