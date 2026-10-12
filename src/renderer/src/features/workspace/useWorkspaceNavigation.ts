import { useRef, useState, type RefObject, type Dispatch, type SetStateAction } from 'react'
import type { Editor } from '@tiptap/core'
import { scopeOf, type OpenProject } from '../../../../shared/projects'
import { sameScope } from '../../../../shared/project-files'
import type { SearchHit } from '../../../../shared/search'
import { manuscriptAnchor } from '../../editor/anchors'
import {
  pageDestination,
  type AppDestination,
  type DestinationPresentation,
  type ResearchTarget
} from '../../app/navigation'
import { WritingPositions, bindWritingPosition, type PositionBinding } from './writing-positions'
import type { DraftRegistry } from './drafts'

type Navigate = (
  next: AppDestination,
  remember?: boolean,
  presentation?: 'top' | 'resume'
) => Promise<boolean>
type ReferenceAnchor = { id: string; documentId: string; request: number } | null
export type WorkspaceNavigation = {
  destination: AppDestination
  destinationRef: RefObject<AppDestination>
  focusRevision: number
  focusRequest: RefObject<DestinationPresentation | null>
  referenceAnchor: ReferenceAnchor
  setReferenceAnchor: Dispatch<SetStateAction<ReferenceAnchor>>
  backDestination: AppDestination | null
  backLabel: string
  goBack: () => Promise<boolean>
  resetNavigation: () => void
  showDestination: (
    next: AppDestination,
    focus?: () => void,
    mode?: DestinationPresentation['mode']
  ) => void
  captureOrigin: (previous: AppDestination) => AppDestination
  rememberOrigin: (previous: AppDestination) => void
  workspace: (view: 'write' | 'search' | 'export' | 'history' | 'details') => AppDestination | null
  research: (target: ResearchTarget) => void
  returnToWork: () => void
  navigateSection: (documentId: string, anchorId?: string) => Promise<void>
  navigateSearch: (hit: SearchHit) => void
  positions: WritingPositions
  positionBinding: RefObject<PositionBinding | null>
  anchorToFocus: RefObject<string | null>
  editorReady: (editor: Editor | null) => void
}

/** Presentation and writing-position hints; the session still guards every transition. */
export function useWorkspaceNavigation({
  current,
  editorRef,
  drafts,
  textProtected,
  navigate,
  setError
}: {
  current: RefObject<OpenProject | null>
  editorRef: RefObject<Editor | null>
  drafts: DraftRegistry
  textProtected: () => boolean
  navigate: Navigate
  setError: (message: string) => void
}): WorkspaceNavigation {
  const [destination, setDestination] = useState<AppDestination>({ kind: 'setup' })
  const destinationRef = useRef(destination)
  const [focusRevision, setFocusRevision] = useState(0)
  const focusRequest = useRef<DestinationPresentation | null>(null)
  const origin = useRef<AppDestination | null>(null)
  const [backTrail, setBackTrail] = useState<AppDestination[]>([])
  const [referenceAnchor, setReferenceAnchor] = useState<{
    id: string
    documentId: string
    request: number
  } | null>(null)
  const [positions] = useState(() => new WritingPositions())
  const positionBinding = useRef<PositionBinding | null>(null)
  const anchorToFocus = useRef<string | null>(null)
  function editorReady(editor: Editor | null): void {
    positionBinding.current?.dispose()
    positionBinding.current = null
    editorRef.current = editor
    const p = current.current
    if (!editor || !p) return
    const anchor = anchorToFocus.current
    positionBinding.current = bindWritingPosition(
      positions,
      editor,
      scopeOf(p),
      p.documentId,
      () => {
        const currentProject = current.current
        return currentProject &&
          sameScope(currentProject, p) &&
          currentProject.documentId === p.documentId &&
          textProtected()
          ? currentProject.revisionId
          : null
      },
      !!anchor,
      () => focusRequest.current?.mode === 'resume'
    )
    if (anchor) {
      anchorToFocus.current = null
      const target = manuscriptAnchor(editor, anchor)
      if (target) {
        if (target.footnote || target.reference) editor.commands.setNodeSelection(target.position)
        else
          editor.commands.setTextSelection(
            Math.min(target.position + 1, editor.state.doc.content.size)
          )
      } else setError('The exact passage is no longer present in this writing item.')
    }
  }
  function showDestination(
    next: AppDestination,
    focus?: () => void,
    mode: DestinationPresentation['mode'] = focus
      ? 'target'
      : next.kind === 'workspace' && next.view === 'write'
        ? 'resume'
        : 'top'
  ): void {
    if (destinationRef.current.kind === 'workspace' && next.kind !== 'workspace')
      origin.current = destinationRef.current
    destinationRef.current = next
    setDestination(next)
    positionBinding.current?.cancelScroll()
    if (mode === 'target') positionBinding.current?.cancelRestore()
    else setReferenceAnchor(null)
    focusRequest.current = {
      mode,
      focus:
        focus ?? (mode === 'resume' ? () => positionBinding.current?.resumeScroll() : undefined)
    }
    setFocusRevision((value) => value + 1)
  }
  function captureOrigin(previous: AppDestination): AppDestination {
    if (previous.kind === 'workspace' && previous.view === 'write' && editorRef.current) {
      const selection = editorRef.current.state.selection
      const node = (selection as { node?: { attrs: Record<string, unknown> } }).node
      const selectedAnchor =
        node?.attrs.footnoteId ?? node?.attrs.citationId ?? selection.$from.parent.attrs.blockId
      previous = {
        ...previous,
        documentId: current.current?.documentId,
        anchorId: typeof selectedAnchor === 'string' ? selectedAnchor : previous.anchorId
      }
    }
    if (previous.kind === 'workspace' && previous.view === 'research') {
      const owner = {
        sources: 'sources',
        notes: 'notes',
        evidence: 'research',
        inspector: 'transcription'
      }[previous.target.kind]
      const target = drafts.states().find((state) => state.id === owner)?.target
      if (target?.kind === 'workspace' && sameScope(target.scope, previous.scope)) previous = target
    }
    return previous
  }
  function rememberOrigin(previous: AppDestination): void {
    setBackTrail((trail) => [...trail.slice(-19), previous])
  }
  const backDestination = backTrail.at(-1) ?? null
  const backLabel =
    backDestination?.kind === 'workspace'
      ? backDestination.view === 'write'
        ? 'writing'
        : backDestination.view === 'research'
          ? 'research'
          : backDestination.view
      : backDestination?.kind === 'library'
        ? 'Projects'
        : 'previous view'
  async function goBack(): Promise<boolean> {
    if (!backDestination) return false
    if (!(await navigate(pageDestination(backDestination), false))) return false
    setBackTrail((trail) => trail.slice(0, -1))
    return true
  }
  function workspace(
    view: 'write' | 'search' | 'export' | 'history' | 'details'
  ): AppDestination | null {
    const p = current.current
    return p ? { kind: 'workspace', scope: scopeOf(p), view, documentId: p.documentId } : null
  }
  function research(target: ResearchTarget): void {
    const p = current.current
    if (p) void navigate({ kind: 'workspace', scope: scopeOf(p), view: 'research', target })
  }
  function returnToWork(): void {
    const target =
      origin.current?.kind === 'workspace' && sameScope(origin.current.scope, current.current)
        ? origin.current
        : workspace('write')
    if (target) void navigate(pageDestination(target))
  }
  async function navigateSection(documentId: string, anchorId?: string): Promise<void> {
    const p = current.current
    if (p)
      await navigate(
        { kind: 'workspace', scope: scopeOf(p), view: 'write', documentId, anchorId },
        true,
        'resume'
      )
  }
  function navigateSearch(hit: SearchHit): void {
    const p = current.current
    if (!p) return
    if (hit.kind === 'draft' && hit.documentId) {
      void navigateSection(hit.documentId, hit.anchorId ?? undefined)
      return
    }
    let target: ResearchTarget | null = null
    if (hit.kind === 'note') target = { kind: 'notes', noteId: hit.entityId }
    if (hit.kind === 'source') target = { kind: 'sources', sourceId: hit.entityId }
    if (hit.kind === 'question' || hit.kind === 'claim')
      target = { kind: 'evidence', item: { kind: hit.kind, id: hit.entityId } }
    if (hit.kind === 'page' && hit.sourceId && hit.versionId)
      target = {
        kind: 'inspector',
        sourceId: hit.sourceId,
        versionId: hit.versionId,
        pageIndex: hit.pageIndex ?? undefined
      }
    if (target) void navigate({ kind: 'workspace', scope: scopeOf(p), view: 'research', target })
  }
  function resetNavigation(): void {
    setBackTrail([])
    setReferenceAnchor(null)
  }
  return {
    destination,
    destinationRef,
    focusRevision,
    focusRequest,
    referenceAnchor,
    setReferenceAnchor,
    backDestination,
    backLabel,
    goBack,
    resetNavigation,
    showDestination,
    captureOrigin,
    rememberOrigin,
    workspace,
    research,
    returnToWork,
    navigateSection,
    navigateSearch,
    positions,
    positionBinding,
    anchorToFocus,
    editorReady
  }
}
