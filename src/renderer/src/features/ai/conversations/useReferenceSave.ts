import { useState, useRef } from 'react'
import type { ConversationTurn } from '../../../../../shared/conversations'
import type {
  ReferenceOrigin,
  ReferenceCandidate,
  ReferenceSave,
  ReferenceReceipt
} from '../../../../../shared/conversation-sources'
import type { SourceMetadata } from '../../../../../shared/sources'
import { isSourceMetadata } from '../../../../../shared/sources'
import type { OpenInput } from '../../../../../shared/projects'
import { sameScope } from '../../../../../shared/project-files'
import { captureSelection, restoreSelection } from '../../../editor/selection'
import { useWorkspaceSession } from '../../workspace/workspaceContext'
import { useRetainedDraft } from '../../workspace/DraftOwner'
import { useSynchronousState } from '../../../hooks/useSynchronousState'

type ReferenceDraft = {
  scope: OpenInput
  conversationId: string
  origin: ReferenceOrigin
  metadata: SourceMetadata
  verified: boolean
  authors: string
}
type ReferenceController = {
  draft: ReferenceDraft | null
  opened: boolean
  busy: boolean
  issue: string
  candidates: ReferenceCandidate[] | null
  receipt: ReferenceReceipt | null
  pending: ReferenceSave | null
  unavailable: boolean
  begin: (turn: ConversationTurn, reference: ReferenceOrigin['reference'], title: string) => void
  update: (metadata: SourceMetadata, verified?: boolean, authors?: string) => void
  check: () => Promise<void>
  save: (sourceId: string | null) => Promise<void>
  cite: (sourceId: string) => Promise<void>
  dismiss: () => void
  discard: () => void
  deliverCitation: () => void
  resume: () => void
  draftEvents: ReturnType<typeof useRetainedDraft>
  startComposition: () => void
  endComposition: () => void
}
export function useReferenceSave(): ReferenceController {
  const session = useWorkspaceSession()
  const [draft, setDraft, current] = useSynchronousState<ReferenceDraft | null>(null)
  const [opened, setOpened] = useState(false),
    [busy, setBusy] = useState(false),
    [issue, setIssue] = useState(''),
    [candidates, setCandidates] = useState<ReferenceCandidate[] | null>(null),
    [receipt, setReceipt] = useState<ReferenceReceipt | null>(null)
  const [pending, setPending, pendingRef] = useSynchronousState<ReferenceSave | null>(null)
  const lock = useRef(false),
    composing = useRef(false),
    reviewed = useRef('')
  const draftEvents = useRetainedDraft('chat-reference', {
    read: () => ({
      scope: current.current?.scope ?? { projectId: '', workspaceId: '' },
      kind: 'source',
      entityId: current.current?.conversationId ?? null,
      label: 'chat reference review',
      dirty: !!current.current && !receipt,
      composing: composing.current,
      busy,
      pendingOperation: pendingRef.current,
      policy: 'retain',
      issue,
      target: {
        kind: 'workspace',
        scope: current.current?.scope ?? { projectId: '', workspaceId: '' },
        view: 'write'
      }
    }),
    focus: () => setOpened(true)
  })
  const unavailable =
    session.accessReadOnly ||
    session.accessTransition ||
    session.closing ||
    session.busy ||
    session.storage.state !== 'ready'
  function begin(
    turn: ConversationTurn,
    reference: ReferenceOrigin['reference'],
    title: string
  ): void {
    if (current.current && !receipt) {
      setOpened(true)
      return
    }
    const p = session.project
    if (!p || unavailable || !turn.assistant || turn.attempt.state !== 'completed') return
    setDraft({
      scope: { projectId: p.projectId, workspaceId: p.workspaceId },
      conversationId: turn.attempt.conversationId,
      origin: { attemptId: turn.attempt.id, revisionId: turn.assistant.revisionId, reference },
      verified: false,
      authors: '',
      metadata: {
        type: reference.kind === 'web' ? 'webpage' : 'book',
        title: title.replace(/\s+/gu, ' ').trim().slice(0, 2000),
        author: [],
        issued: '',
        containerTitle: '',
        publisher: '',
        edition: '',
        volume: '',
        issue: '',
        page: '',
        DOI: '',
        URL: reference.kind === 'web' ? reference.url : '',
        ISBN: '',
        ISSN: ''
      }
    })
    setCandidates(null)
    setReceipt(null)
    setIssue('')
    reviewed.current = ''
    setOpened(true)
  }
  function update(
    metadata: SourceMetadata,
    verified = current.current?.verified ?? false,
    authors = current.current?.authors ?? ''
  ): void {
    if (!current.current || lock.current || pendingRef.current || receipt) return
    setDraft({ ...current.current, metadata, verified, authors })
    setCandidates(null)
    reviewed.current = ''
    setIssue('')
  }
  async function check(): Promise<void> {
    const d = current.current
    if (!d || lock.current || composing.current || pendingRef.current || unavailable) return
    if (!isSourceMetadata(d.metadata)) {
      setIssue('Enter a title and check the reference details.')
      return
    }
    lock.current = true
    setBusy(true)
    setIssue('')
    try {
      const result = await window.collie.conversation({
        ...d.scope,
        action: 'reference-preview',
        origin: d.origin,
        metadata: d.metadata
      })
      if (result.ok && result.value.type === 'reference-preview') {
        setCandidates(result.value.candidates)
        reviewed.current = JSON.stringify(d.metadata)
      } else setIssue(result.ok ? 'Could not review this reference.' : result.error.message)
    } catch {
      setIssue('Could not check for existing sources. Your edits are kept; try again.')
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  async function save(existingSourceId: string | null): Promise<void> {
    const d = current.current
    if (
      !d ||
      lock.current ||
      composing.current ||
      unavailable ||
      !sameScope(session.project, d.scope)
    )
      return
    let input = pendingRef.current
    if (!input) {
      if (candidates === null || reviewed.current !== JSON.stringify(d.metadata)) return
      input = {
        operationId: crypto.randomUUID(),
        origin: d.origin,
        metadata: d.metadata,
        verified: d.verified,
        existingSourceId,
        candidates
      }
      setPending(input)
    }
    lock.current = true
    setBusy(true)
    setIssue('')
    try {
      const result = await window.collie.conversation({
        ...d.scope,
        action: 'reference-save',
        save: input
      })
      if (!result.ok) {
        if (!['UNAVAILABLE', 'DISK_FULL', 'PROJECT_LOCKED'].includes(result.error.code)) {
          setPending(null)
          setCandidates(null)
          reviewed.current = ''
        }
        setIssue(
          result.error.code === 'STALE_REVISION'
            ? 'The source library changed. Check for matches again; your edits are kept.'
            : result.error.message
        )
        return
      }
      if (result.value.type !== 'reference-saved') throw new Error('Unexpected receipt')
      setReceipt(result.value.receipt)
      setPending(null)
      await session.refreshConversationHead(d.scope)
      const sources = await window.collie.readSources(d.scope)
      if (sources.ok && sameScope(session.current.current, d.scope))
        session.setCitationContext({
          projectId: d.scope.projectId,
          sources: sources.value.sources,
          view: null
        })
    } catch {
      setIssue(
        pendingRef.current
          ? 'Save is not confirmed. Retry this save to check its original receipt.'
          : 'Saved in Research. Reopen Research if its list has not refreshed.'
      )
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  async function cite(sourceId: string): Promise<void> {
    if (session.sectionReadOnly) {
      session.setError(
        'Open an editable manuscript item and select a position before choosing Cite.'
      )
      return
    }
    if (
      lock.current ||
      composing.current ||
      unavailable ||
      session.sectionReadOnly ||
      session.citationRequest
    )
      return
    const p = session.project,
      selection = captureSelection(session.editorRef.current),
      activeElement = document.activeElement
    if (!p || !selection || !selection.editor.isEditable || session.composition.current) {
      session.setError('Select an editable position in your manuscript, then choose Cite.')
      return
    }
    lock.current = true
    try {
      const sources = await window.collie.readSources({
        projectId: p.projectId,
        workspaceId: p.workspaceId
      })
      if (
        document.activeElement !== activeElement ||
        document.visibilityState !== 'visible' ||
        !sources.ok ||
        !sameScope(session.current.current, p) ||
        session.current.current?.documentId !== p.documentId ||
        !restoreSelection(selection, session.editorRef.current) ||
        !sources.value.sources.some((s) => s.id === sourceId && s.state === 'active')
      ) {
        session.setError(
          'The writing or source changed. Select the intended manuscript position and choose Cite again.'
        )
        return
      }
      session.setCitationContext({
        projectId: p.projectId,
        sources: sources.value.sources,
        view: null
      })
      setOpened(false)
      // The citation form is opened after this dialog has finished exiting.
      citationAfterClose.current = { sourceId, selection }
      if (!opened || !sameScope(session.project, current.current?.scope ?? null)) deliverCitation()
    } catch {
      session.setError('Could not load the source. Your writing is unchanged.')
    } finally {
      lock.current = false
    }
  }
  const citationAfterClose = useRef<NonNullable<typeof session.citationRequest> | null>(null)
  function deliverCitation(): void {
    const request = citationAfterClose.current
    citationAfterClose.current = null
    if (!request) return
    if (
      request.selection.editor !== session.editorRef.current ||
      request.selection.editor.isDestroyed ||
      !request.selection.editor.isEditable ||
      !request.selection.document.eq(request.selection.editor.state.doc)
    ) {
      session.setError('The writing changed. Select the intended position and choose Cite again.')
      return
    }
    session.setCitationRequest(request)
  }
  function dismiss(): void {
    if (!composing.current && !lock.current) setOpened(false)
  }
  function discard(): void {
    if (composing.current || lock.current || pendingRef.current) return
    setDraft(null)
    setReceipt(null)
    setCandidates(null)
    setIssue('')
    setOpened(false)
  }
  return {
    draft: sameScope(session.project, draft?.scope ?? null) ? draft : null,
    opened: opened && sameScope(session.project, draft?.scope ?? null),
    busy,
    issue,
    candidates,
    receipt,
    pending,
    unavailable,
    begin,
    update,
    check,
    save,
    cite,
    dismiss,
    discard,
    deliverCitation,
    resume: () => setOpened(true),
    draftEvents,
    startComposition: () => {
      composing.current = true
    },
    endComposition: () => {
      composing.current = false
    }
  }
}
