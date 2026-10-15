import PresentationBoundary from '../../components/PresentationBoundary'
import { useEffectEvent } from 'react'
import { useSynchronousState } from '../../hooks/useSynchronousState'
import { Checkbox, TextInput } from '@mantine/core'
import { useEffect, useRef, useState } from 'react'
import type { OpenProject } from '../../../../shared/projects'
import type {
  EvidenceChange,
  EvidenceRole,
  EvidenceLink,
  ResearchItem,
  ResearchDecision
} from '../../../../shared/evidence'
import { AppButton, SelectField, TextareaField } from '../../components/ui/Controls'
import { EmptyState } from '../../components/ui/Feedback'
import { ResearchHeader, ResearchLayout } from '../research/ResearchLayout'
import { useResearchData } from '../research/researchContext'
import { UsageStatus } from '../research/SourceUsage'
import { linkWarnings } from '../research/usage'
import { useRetainedDraft } from '../workspace/DraftOwner'
import { useWorkspaceSession } from '../workspace/workspaceContext'
import './EvidencePanel.css'

type ItemKind = 'question' | 'claim'
type ItemDraft = {
  kind: ItemKind
  original: ResearchItem | null
  text: string
  documentId: string
  noteId: string
}
type LinkDraft = {
  sourceId: string
  excerptId: string
  targetKind: 'claim' | 'section'
  targetId: string
  targetRevisionId: string
  role: EvidenceRole
}
const linkFor = (claim?: ResearchItem): LinkDraft => ({
  sourceId: '',
  excerptId: '',
  targetKind: 'claim',
  targetId: claim?.id ?? '',
  targetRevisionId: claim?.revisionId ?? '',
  role: 'support'
})
const roles: EvidenceRole[] = ['support', 'challenge', 'background', 'potential_use']
const draftFor = (kind: ItemKind, item: ResearchItem | null): ItemDraft => ({
  kind,
  original: item,
  text: item?.text ?? '',
  documentId: item?.documentId ?? '',
  noteId: item?.noteId ?? ''
})
const oldValue = (snapshot: string): string => {
  try {
    const value = JSON.parse(snapshot) as Record<string, unknown>
    return String(
      value.text ?? [value.state, value.role, value.reason].filter(Boolean).join(' · ')
    ).slice(0, 400)
  } catch {
    return 'Prior revision retained'
  }
}

export default function EvidencePanel({
  project,
  focusItem,
  focusSourceId,
  createRequested,
  disabled,
  readOnly,
  onCommitted,
  navigate,
  inspect
}: {
  project: OpenProject
  focusItem: { kind: ItemKind | 'link'; id: string } | null
  focusSourceId?: string
  createRequested?: { id: string; text: string; documentId?: string }
  disabled: boolean
  readOnly: boolean
  onCommitted: () => Promise<void>
  navigate: (id: string, anchor?: string) => Promise<void>
  inspect: (sourceId: string, excerptId: string) => void
}): React.JSX.Element {
  const session = useWorkspaceSession(),
    data = useResearchData(),
    { view } = data
  const scope = { projectId: project.projectId, workspaceId: project.workspaceId }
  const panel = useRef<HTMLElement>(null),
    focused = useRef(''),
    [pendingValue, setPendingValue, pending] = useSynchronousState<{
      operationId: string
      change: EvidenceChange
    } | null>(null)
  const [tab, setTab] = useState<ItemKind | 'link'>('question'),
    [query, setQuery] = useState(''),
    [includeRemoved, setIncludeRemoved] = useState(false)
  const [draft, setDraft] = useState<ItemDraft | null>(null),
    [linkId, setLinkId] = useState<string | null>(null),
    [linkDraft, setLinkDraft] = useState<LinkDraft | null>(null)
  const [decisionSource, setDecisionSource] = useState<string | null>(null),
    [decisionReason, setDecisionReason] = useState(''),
    [decisionBase, setDecisionBase] = useState<ResearchDecision | null>(null)
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('')
  const contextualLink = !!linkDraft && draft?.kind === 'claim' && !!draft.original
  const itemDirty =
    !!draft &&
    (draft.text !== (draft.original?.text ?? '') ||
      draft.documentId !== (draft.original?.documentId ?? '') ||
      draft.noteId !== (draft.original?.noteId ?? ''))
  const decisionReasonDirty = decisionReason !== (decisionBase?.reason ?? '')
  const decisionDirty = decisionReasonDirty || (!!decisionSource && !decisionBase)
  const dirty =
    itemDirty ||
    decisionDirty ||
    !!(
      linkDraft &&
      (linkDraft.sourceId ||
        linkDraft.excerptId ||
        linkDraft.role !== 'support' ||
        (!contextualLink && linkDraft.targetId))
    )
  const locked = disabled || busy || !!pendingValue || !data.fresh
  const editsLocked = locked || readOnly
  const link = view?.links.find((item) => item.id === linkId)
  function changeLink(change: Partial<Pick<EvidenceLink, 'role' | 'review' | 'state'>>): void {
    if (!link) return
    void mutate({
      type: 'changeLink',
      id: link.id,
      expectedRevisionId: link.revisionId,
      role: change.role ?? link.role,
      review: change.review ?? link.review,
      state: change.state ?? link.state
    })
  }
  const item = draft?.original
    ? (draft.kind === 'question' ? view?.questions : view?.claims)?.find(
        (row) => row.id === draft.original?.id
      )
    : null
  const canChangeContext = (): boolean => {
    if (session.composition.current || dirty || busy || pending.current) {
      setError('Save or explicitly discard the current research form before choosing another item.')
      return false
    }
    setError('')
    return true
  }
  function choose(kind: ItemKind, selected: ResearchItem | null): void {
    setTab(kind)
    setDraft(draftFor(kind, selected))
    setLinkId(null)
    setLinkDraft(null)
    setDecisionSource(null)
    setDecisionReason('')
    setDecisionBase(null)
  }
  function selectDecision(sourceId: string | null): void {
    if (session.composition.current || busy || pending.current) return
    const saved =
      view?.decisions.find(
        (row) => row.questionId === draft?.original?.id && row.sourceId === sourceId
      ) ?? null
    setDecisionSource(sourceId)
    setDecisionBase(saved)
    setDecisionReason(saved?.reason ?? '')
  }
  function discard(): void {
    if (session.composition.current) return
    if (draft && !contextualLink) setDraft(draftFor(draft.kind, item ?? null))
    const saved =
      view?.decisions.find(
        (row) => row.questionId === draft?.original?.id && row.sourceId === decisionSource
      ) ?? null
    setDecisionBase(saved)
    setDecisionReason(saved?.reason ?? '')
    if (!saved) setDecisionSource(null)
    if (linkDraft)
      setLinkDraft({
        ...linkDraft,
        sourceId: '',
        excerptId: '',
        role: 'support',
        ...(!contextualLink ? { targetId: '', targetRevisionId: '' } : {})
      })
    setError('')
  }
  function startLink(claim?: ResearchItem): void {
    if (!canChangeContext()) return
    choose('claim', claim ?? null)
    setTab('link')
    setLinkDraft(linkFor(claim))
  }
  function cancelLink(): void {
    if (session.composition.current || busy || pending.current) return
    setLinkDraft(null)
    if (contextualLink && item) choose('claim', item)
    setError('')
  }
  const consumedCreation = useRef(new Set<string>())
  const onEvidenceNavigation = useEffectEvent(() => {
    if (
      createRequested &&
      !consumedCreation.current.has(createRequested.id) &&
      view &&
      !dirty &&
      !busy &&
      !pending.current &&
      !readOnly &&
      !session.composition.current
    ) {
      consumedCreation.current.add(createRequested.id)
      if (consumedCreation.current.size > 64)
        consumedCreation.current.delete(consumedCreation.current.values().next().value!)
      choose('question', null)
      setDraft({
        ...draftFor('question', null),
        text: createRequested.text.slice(0, 10000),
        documentId: createRequested.documentId ?? ''
      })
      return
    }

    if (!focusItem) {
      focused.current = ''
      return
    }
    const key = `${focusItem.kind}:${focusItem.id}:${focusSourceId ?? ''}:${session.focusRevision}`
    if (
      !view ||
      dirty ||
      busy ||
      pending.current ||
      session.composition.current ||
      focused.current === key
    )
      return
    focused.current = key
    setIncludeRemoved(true)
    setQuery('')
    setError('')
    if (focusItem.kind === 'link') {
      if (!view.links.some((row) => row.id === focusItem.id)) {
        setError('This evidence link is no longer available.')
        return
      }
      setTab('link')
      setLinkId(focusItem.id)
      setDraft(null)
      setLinkDraft(null)
      return
    }
    const found = (focusItem.kind === 'question' ? view.questions : view.claims).find(
      (row) => row.id === focusItem.id
    )
    if (!found) {
      setError('This question or claim is no longer available.')
      return
    }
    choose(focusItem.kind, found)
    if (focusSourceId && focusItem.kind === 'question') {
      const saved =
        view.decisions.find(
          (row) => row.questionId === found.id && row.sourceId === focusSourceId
        ) ?? null
      setDecisionSource(focusSourceId)
      setDecisionBase(saved)
      setDecisionReason(saved?.reason ?? '')
    }
  })
  // Present only the latest committed navigation request, after retained regions update.
  useEffect(() => {
    const frame = requestAnimationFrame(() => onEvidenceNavigation())
    return () => cancelAnimationFrame(frame)
  }, [
    focusItem,
    focusSourceId,
    createRequested,
    session.focusRevision,
    view,
    dirty,
    busy,
    pendingValue,
    readOnly
  ])

  async function mutate(change: EvidenceChange, retry = false): Promise<void> {
    if (readOnly || disabled || busy || (!retry && !data.fresh)) {
      setError('Editing is unavailable for this project right now.')
      return
    }
    if (pending.current && !retry) {
      setError('Retry the pending research change first.')
      return
    }
    if (session.composition.current) return
    const operation = pending.current ?? { operationId: crypto.randomUUID(), change }
    setPendingValue(operation)
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const result = await window.collie.changeEvidence({ ...scope, ...operation })
      if (!result.ok) {
        if (result.error.code !== 'UNAVAILABLE') setPendingValue(null)
        setError(result.error.message)
        return
      }
      setPendingValue(null)
      data.accept(result.value)
      const savedChange = operation.change
      if (
        savedChange.type === 'createQuestion' ||
        savedChange.type === 'updateQuestion' ||
        savedChange.type === 'createClaim' ||
        savedChange.type === 'updateClaim'
      ) {
        const kind = savedChange.type.endsWith('Question') ? 'question' : 'claim'
        const saved = (kind === 'question' ? result.value.questions : result.value.claims).find(
          (row) => row.id === savedChange.id
        )
        if (saved) setDraft(draftFor(kind, saved))
      } else if (savedChange.type === 'decide') {
        const saved =
          result.value.decisions.find(
            (row) =>
              row.questionId === savedChange.questionId && row.sourceId === savedChange.sourceId
          ) ?? null
        setDecisionBase(saved)
        setDecisionReason(saved?.reason ?? '')
      } else if (savedChange.type === 'createLink') {
        setLinkId(savedChange.id)
        setLinkDraft(null)
      }
      setMessage('Saved.')
      await onCommitted()
    } catch {
      setError(
        pending.current
          ? 'The change has an unknown outcome. Retry the same research change.'
          : 'The change was saved, but the workspace could not refresh. Reopen Research to refresh it.'
      )
    } finally {
      setBusy(false)
    }
  }
  function saveItem(): void {
    if (!draft || !draft.text.trim() || decisionDirty) return
    const { kind, original, text, documentId, noteId } = draft
    if (original)
      void mutate({
        type: kind === 'question' ? 'updateQuestion' : 'updateClaim',
        id: original.id,
        expectedRevisionId: original.revisionId,
        text,
        documentId: documentId || null,
        noteId: noteId || null,
        state: original.state
      })
    else
      void mutate({
        type: kind === 'question' ? 'createQuestion' : 'createClaim',
        id: crypto.randomUUID(),
        text,
        documentId: documentId || null,
        noteId: noteId || null
      })
  }
  const binding = useRetainedDraft('research', {
    read: () => ({
      scope,
      kind: 'questions-claims-decisions',
      entityId: draft?.original?.id ?? linkId,
      label: 'research form edits',
      dirty: dirty || !!pending.current,
      composing: false,
      busy,
      pendingOperation: pending.current,
      policy: 'explicit',
      issue: error,
      target: {
        kind: 'workspace',
        scope,
        view: 'research',
        target: {
          kind: 'evidence',
          item:
            tab === 'link' && linkId
              ? { kind: 'link', id: linkId }
              : contextualLink && draft?.original
                ? { kind: 'claim', id: draft.original.id }
                : draft?.original && draft.kind === tab
                  ? { kind: draft.kind, id: draft.original.id }
                  : undefined,
          sourceId: decisionSource || undefined
        }
      }
    }),
    focus: () => panel.current?.focus()
  })
  const history = (
    entityType: 'question' | 'claim' | 'link' | 'decision',
    key: string
  ): React.JSX.Element | null => {
    const rows =
      view?.revisions.filter((row) => row.entityType === entityType && row.entityKey === key) ?? []
    return rows.length ? (
      <details className="research-disclosure">
        <summary>Earlier revisions ({rows.length})</summary>
        <ol>
          {rows.map((row) => (
            <li key={row.revisionId}>
              {new Date(row.createdAt).toLocaleString()} · {oldValue(row.snapshot)}
            </li>
          ))}
        </ol>
      </details>
    ) : null
  }
  const openSection = (id: string): React.JSX.Element => {
    const section = view?.sections.find((row) => row.id === id)
    return (
      <>
        <AppButton
          variant="subtle"
          disabled={section?.state !== 'active'}
          onClick={() => void navigate(id)}
        >
          {section?.title || 'Missing section'}
          {section?.state !== 'active' ? ` (${section?.state ?? 'missing'})` : ''}
        </AppButton>
        {section?.replacementId ? (
          <AppButton variant="subtle" onClick={() => void navigate(section.replacementId!)}>
            Open merged section’s replacement
          </AppButton>
        ) : null}
      </>
    )
  }
  const openNote = (id: string): React.JSX.Element => {
    const note = view?.notes.find((row) => row.id === id)
    return (
      <AppButton
        variant="subtle"
        disabled={!note}
        onClick={() => session.research({ kind: 'notes', noteId: id })}
      >
        {note?.title || 'Missing note'}
        {note?.state !== 'active' ? ` (${note?.state ?? 'missing'})` : ''}
      </AppButton>
    )
  }
  const relatedEvidence = item
    ? tab === 'question'
      ? view?.decisions.filter((row) => row.questionId === item.id)
      : view?.links.filter((row) => row.claimId === item.id)
    : []
  const selectedExcerpt = view?.excerpts.find((row) => row.id === link?.excerptId)
  const targetLabel = (claimId: string | null, documentId: string | null): string =>
    claimId
      ? (view?.claims.find((row) => row.id === claimId)?.text ?? 'Missing claim')
      : (view?.sections.find((row) => row.id === documentId)?.title ?? 'Missing section')
  const visibleItems =
    (tab === 'question' ? view?.questions : view?.claims)?.filter(
      (row) =>
        (includeRemoved || row.state === 'active') &&
        row.text.toLocaleLowerCase().includes(query.toLocaleLowerCase())
    ) ?? []
  const visibleLinks =
    view?.links.filter(
      (row) =>
        (includeRemoved || row.state === 'active') &&
        `${view.sources.find((source) => source.id === row.sourceId)?.title} ${targetLabel(row.claimId, row.documentId)} ${row.role}`
          .toLocaleLowerCase()
          .includes(query.toLocaleLowerCase())
    ) ?? []
  return (
    <PresentationBoundary
      label="Questions and claims"
      render={() => (
        <section
          ref={panel}
          {...binding}
          tabIndex={-1}
          className="evidence-panel"
          aria-labelledby="evidence-title"
        >
          <ResearchHeader id="evidence-title" title="Questions & claims">
            Connect sources to your questions and claims. Evidence records your assessment;
            citations stay in your writing.
          </ResearchHeader>
          <UsageStatus />
          <div className="research-actions" aria-label="Research collections">
            {(['question', 'claim', 'link'] as const).map((kind) => (
              <AppButton
                key={kind}
                variant={tab === kind ? 'filled' : 'subtle'}
                aria-pressed={tab === kind}
                onClick={() => {
                  if (canChangeContext()) {
                    setTab(kind)
                    setQuery('')
                  }
                }}
              >
                {kind === 'question' ? 'Questions' : kind === 'claim' ? 'Claims' : 'All evidence'}
              </AppButton>
            ))}
          </div>
          {dirty ? (
            <p role="status">
              You have unsaved research edits.{' '}
              <AppButton variant="subtle" disabled={busy || !!pendingValue} onClick={discard}>
                Discard form edits
              </AppButton>
            </p>
          ) : null}
          {pendingValue ? (
            <AppButton
              disabled={busy || disabled || readOnly}
              onClick={() => {
                if (pending.current) void mutate(pending.current.change, true)
              }}
            >
              Retry pending research change
            </AppButton>
          ) : null}
          {error ? <p role="alert">{error}</p> : null}
          {message ? <p role="status">{message}</p> : null}
          <ResearchLayout
            sidebar={
              <>
                <TextInput
                  label="Find in this collection"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  type="search"
                />
                <Checkbox
                  label="Include archived or removed items"
                  checked={includeRemoved}
                  onChange={(event) => setIncludeRemoved(event.currentTarget.checked)}
                />
                <AppButton
                  disabled={editsLocked}
                  onClick={() => {
                    if (tab === 'link') startLink()
                    else if (canChangeContext()) choose(tab, null)
                  }}
                >
                  {tab === 'link' ? 'Link evidence across project' : `Add ${tab}`}
                </AppButton>
                <ul className="research-item-list">
                  {tab === 'link'
                    ? visibleLinks.map((row) => (
                        <li key={row.id}>
                          <AppButton
                            variant="subtle"
                            classNames={{
                              inner: 'research-item-inner',
                              label: 'research-item-label'
                            }}
                            className="research-item-button"
                            aria-current={row.id === linkId ? 'true' : undefined}
                            disabled={busy}
                            onClick={() => {
                              if (canChangeContext()) {
                                setLinkId(row.id)
                                setLinkDraft(null)
                                setDraft(null)
                              }
                            }}
                          >
                            <strong>
                              {view?.sources.find((source) => source.id === row.sourceId)?.title ??
                                'Missing source'}
                            </strong>
                            <span>
                              {row.role.replace('_', ' ')} ·{' '}
                              {targetLabel(row.claimId, row.documentId)}
                            </span>
                            <span className="research-state">
                              {row.state === 'removed' ? 'Removed · ' : ''}
                              {view && linkWarnings(view, row).length ? 'Needs review' : 'Reviewed'}
                            </span>
                          </AppButton>
                        </li>
                      ))
                    : visibleItems.map((row) => (
                        <li key={row.id}>
                          <AppButton
                            variant="subtle"
                            classNames={{
                              inner: 'research-item-inner',
                              label: 'research-item-label'
                            }}
                            className="research-item-button"
                            aria-current={row.id === draft?.original?.id ? 'true' : undefined}
                            disabled={busy}
                            onClick={() => {
                              if (canChangeContext()) choose(tab as ItemKind, row)
                            }}
                          >
                            <strong>{row.text}</strong>
                            <span className="research-state">
                              {row.state}
                              {row.documentId
                                ? ` · ${view?.sections.find((section) => section.id === row.documentId)?.title ?? 'Missing section'}`
                                : ''}
                            </span>
                          </AppButton>
                        </li>
                      ))}
                </ul>
                {(tab === 'link' ? visibleLinks : visibleItems).length === 0 ? (
                  <p>
                    No matching {tab === 'link' ? 'evidence links' : `${tab}s`}. Add one or adjust
                    the filter.
                  </p>
                ) : null}
              </>
            }
          >
            {tab !== 'link' && draft?.kind === tab ? (
              <div className="research-detail-inner">
                <form
                  className="research-form"
                  onSubmit={(event) => {
                    event.preventDefault()
                    saveItem()
                  }}
                >
                  <h3>{draft.original ? `Edit ${tab}` : `New ${tab}`}</h3>
                  {item?.state === 'archived' ? (
                    <p role="status">
                      This {tab} is archived. Its relationships and revisions are retained.
                    </p>
                  ) : null}
                  {item && item.revisionId !== draft.original?.revisionId ? (
                    <p role="status">
                      This item changed since you opened the form. Your edits remain here.{' '}
                      <AppButton
                        variant="subtle"
                        disabled={busy || !!pendingValue}
                        onClick={discard}
                      >
                        Discard edits and reload saved item
                      </AppButton>
                    </p>
                  ) : null}
                  <TextareaField
                    label={tab === 'question' ? 'Question' : 'Claim'}
                    value={draft.text}
                    maxLength={10000}
                    rows={4}
                    disabled={editsLocked}
                    onChange={(event) => setDraft({ ...draft, text: event.target.value })}
                  />
                  <details className="research-disclosure">
                    <summary>Related writing and note</summary>
                    {(['documentId', 'noteId'] as const).map((field) => (
                      <SelectField
                        key={field}
                        label={field === 'documentId' ? 'Related section' : 'Related note'}
                        value={draft[field]}
                        disabled={editsLocked}
                        onChange={(event) => setDraft({ ...draft, [field]: event.target.value })}
                      >
                        <option value="">None</option>
                        {(field === 'documentId' ? view?.sections : view?.notes)?.map((row) => (
                          <option
                            key={row.id}
                            value={row.id}
                            disabled={row.state !== 'active' && row.id !== draft[field]}
                          >
                            {row.title}
                            {row.state !== 'active' ? ` (${row.state})` : ''}
                          </option>
                        ))}
                      </SelectField>
                    ))}
                  </details>
                  <div className="research-actions">
                    <AppButton
                      type="submit"
                      disabled={editsLocked || decisionDirty || !draft.text.trim()}
                    >
                      {draft.original ? 'Save changes' : `Create ${tab}`}
                    </AppButton>
                    {item ? (
                      <AppButton
                        variant="subtle"
                        disabled={editsLocked || dirty}
                        onClick={() =>
                          void mutate({
                            type: tab === 'question' ? 'updateQuestion' : 'updateClaim',
                            id: item.id,
                            expectedRevisionId: item.revisionId,
                            text: item.text,
                            documentId: item.documentId,
                            noteId: item.noteId,
                            state: item.state === 'active' ? 'archived' : 'active'
                          })
                        }
                      >
                        {item.state === 'active' ? 'Archive' : 'Restore'}
                      </AppButton>
                    ) : null}
                  </div>
                </form>
                {item ? (
                  <>
                    {item.documentId ? (
                      <div>
                        <h4>Writing context</h4>
                        {openSection(item.documentId)}
                        {view?.sections.find((row) => row.id === item.documentId)?.revisionId !==
                        item.documentRevisionId ? (
                          <p role="status">
                            The related section has changed since this {tab} was saved.
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                    {item.noteId ? (
                      <div>
                        <h4>Related note</h4>
                        {openNote(item.noteId)}
                      </div>
                    ) : null}
                    <div className="research-form">
                      <h4>
                        {tab === 'question'
                          ? 'Sources considered for this question'
                          : 'Evidence for this claim'}
                      </h4>
                      <AppButton
                        disabled={editsLocked || dirty || item.state !== 'active'}
                        onClick={() => {
                          if (tab === 'question') selectDecision('')
                          else startLink(item)
                        }}
                      >
                        Add evidence
                      </AppButton>
                      <ul className="research-item-list">
                        {relatedEvidence?.map((row) => (
                          <li key={'id' in row ? row.id : row.sourceId}>
                            <AppButton
                              variant="subtle"
                              className="research-item-button"
                              classNames={{
                                inner: 'research-item-inner',
                                label: 'research-item-label'
                              }}
                              disabled={locked || itemDirty}
                              onClick={() => {
                                if ('questionId' in row) {
                                  if (!decisionReasonDirty) selectDecision(row.sourceId)
                                  else
                                    setError('Save or discard the current decision reason first.')
                                } else
                                  session.research({
                                    kind: 'evidence',
                                    item: { kind: 'link', id: row.id }
                                  })
                              }}
                            >
                              <strong>
                                {view?.sources.find((source) => source.id === row.sourceId)
                                  ?.title ?? 'Missing source'}
                              </strong>
                              <span>
                                {row.state}
                                {'role' in row
                                  ? ` · ${row.role.replace('_', ' ')}`
                                  : row.reason
                                    ? ` · ${row.reason}`
                                    : ''}
                              </span>
                            </AppButton>
                          </li>
                        ))}
                      </ul>
                      {tab === 'question' && decisionSource !== null ? (
                        <>
                          <SelectField
                            label="Source"
                            value={decisionSource}
                            disabled={
                              locked || decisionReasonDirty || readOnly || item.state !== 'active'
                            }
                            onChange={(event) => selectDecision(event.target.value)}
                          >
                            <option value="">Choose a source</option>
                            {view?.sources.map((row) => (
                              <option key={row.id} value={row.id} disabled={row.state === 'merged'}>
                                {row.title}
                                {row.state !== 'active' ? ` (${row.state})` : ''}
                              </option>
                            ))}
                          </SelectField>
                          {decisionSource ? (
                            <>
                              <AppButton
                                variant="subtle"
                                onClick={() =>
                                  session.research({
                                    kind: 'sources',
                                    sourceId: decisionSource,
                                    page: 'usage'
                                  })
                                }
                              >
                                View source and all uses
                              </AppButton>
                              <TextareaField
                                label="Reason (required to reject)"
                                value={decisionReason}
                                maxLength={2000}
                                rows={3}
                                disabled={editsLocked || item.state !== 'active'}
                                onChange={(event) => setDecisionReason(event.target.value)}
                              />
                              <div className="research-actions">
                                {(['candidate', 'kept', 'rejected'] as const).map((state) => (
                                  <AppButton
                                    key={state}
                                    variant={decisionBase?.state === state ? 'filled' : 'light'}
                                    disabled={
                                      editsLocked ||
                                      itemDirty ||
                                      item.state !== 'active' ||
                                      (state === 'rejected' && !decisionReason.trim())
                                    }
                                    onClick={() =>
                                      void mutate({
                                        type: 'decide',
                                        questionId: item.id,
                                        sourceId: decisionSource,
                                        expectedRevisionId: decisionBase?.revisionId ?? null,
                                        state,
                                        reason: decisionReason
                                      })
                                    }
                                  >
                                    {state === 'candidate'
                                      ? 'Save as candidate'
                                      : state === 'kept'
                                        ? 'Keep source'
                                        : 'Reject source'}
                                  </AppButton>
                                ))}
                              </div>
                              <p>A rejection requires a reason and can be reversed here.</p>
                              {history('decision', `${item.id}|${decisionSource}`)}
                            </>
                          ) : null}
                          <AppButton
                            variant="default"
                            disabled={busy || !!pendingValue}
                            onClick={() => {
                              if (session.composition.current) return
                              selectDecision(null)
                            }}
                          >
                            Cancel
                          </AppButton>
                        </>
                      ) : null}
                    </div>
                    {history(tab, item.id)}
                  </>
                ) : null}
              </div>
            ) : tab === 'link' && linkDraft ? (
              <form
                className="research-detail-inner research-form"
                onSubmit={(event) => {
                  event.preventDefault()
                  if (linkDraft.sourceId && linkDraft.targetId && linkDraft.targetRevisionId)
                    void mutate({
                      type: 'createLink',
                      id: crypto.randomUUID(),
                      sourceId: linkDraft.sourceId,
                      excerptId: linkDraft.excerptId || null,
                      claimId: linkDraft.targetKind === 'claim' ? linkDraft.targetId : null,
                      documentId: linkDraft.targetKind === 'section' ? linkDraft.targetId : null,
                      expectedTargetRevisionId: linkDraft.targetRevisionId,
                      role: linkDraft.role
                    })
                }}
              >
                <h3>
                  {contextualLink
                    ? 'Add evidence to this claim'
                    : 'Link evidence across the project'}
                </h3>
                {contextualLink ? (
                  <p className="research-quote">{draft?.original?.text}</p>
                ) : (
                  <>
                    <SelectField
                      label="Link to"
                      value={linkDraft.targetKind}
                      disabled={editsLocked}
                      onChange={(event) =>
                        setLinkDraft({
                          ...linkDraft,
                          targetKind: event.target.value as 'claim' | 'section',
                          targetId: '',
                          targetRevisionId: ''
                        })
                      }
                    >
                      <option value="claim">Claim</option>
                      <option value="section">Section</option>
                    </SelectField>
                    <SelectField
                      label={linkDraft.targetKind === 'claim' ? 'Claim' : 'Section'}
                      value={linkDraft.targetId}
                      disabled={editsLocked}
                      onChange={(event) => {
                        const target = (
                          linkDraft.targetKind === 'claim' ? view?.claims : view?.sections
                        )?.find((row) => row.id === event.target.value)
                        setLinkDraft({
                          ...linkDraft,
                          targetId: target?.id ?? '',
                          targetRevisionId: target?.revisionId ?? ''
                        })
                      }}
                    >
                      <option value="">Choose target</option>
                      {(linkDraft.targetKind === 'claim' ? view?.claims : view?.sections)
                        ?.filter((row) => row.state === 'active')
                        .map((row) => (
                          <option key={row.id} value={row.id}>
                            {'text' in row ? row.text : row.title}
                          </option>
                        ))}
                    </SelectField>
                  </>
                )}
                <SelectField
                  label="Source"
                  value={linkDraft.sourceId}
                  disabled={editsLocked}
                  onChange={(event) =>
                    setLinkDraft({ ...linkDraft, sourceId: event.target.value, excerptId: '' })
                  }
                >
                  <option value="">Choose source</option>
                  {view?.sources
                    .filter((row) => row.state === 'active')
                    .map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.title}
                      </option>
                    ))}
                </SelectField>
                <SelectField
                  label="Exact excerpt (optional)"
                  value={linkDraft.excerptId}
                  disabled={editsLocked || !linkDraft.sourceId}
                  onChange={(event) =>
                    setLinkDraft({ ...linkDraft, excerptId: event.target.value })
                  }
                >
                  <option value="">Whole source</option>
                  {view?.excerpts
                    .filter((row) => row.sourceId === linkDraft.sourceId)
                    .map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.quote.slice(0, 120)} · {row.kind}
                        {view.sources.find((source) => source.id === row.sourceId)
                          ?.activeVersionId !== row.versionId
                          ? ' · earlier version'
                          : ''}
                      </option>
                    ))}
                </SelectField>
                {linkDraft.excerptId ? (
                  <blockquote className="research-quote">
                    {view?.excerpts.find((row) => row.id === linkDraft.excerptId)?.quote}
                  </blockquote>
                ) : null}
                <SelectField
                  label="How it relates"
                  value={linkDraft.role}
                  disabled={editsLocked}
                  onChange={(event) =>
                    setLinkDraft({ ...linkDraft, role: event.target.value as EvidenceRole })
                  }
                >
                  {roles.map((value) => (
                    <option key={value} value={value}>
                      {value.replace('_', ' ')}
                    </option>
                  ))}
                </SelectField>
                <div className="research-actions">
                  <AppButton
                    type="submit"
                    disabled={
                      locked ||
                      readOnly ||
                      !linkDraft.sourceId ||
                      !linkDraft.targetId ||
                      !linkDraft.targetRevisionId
                    }
                  >
                    Save evidence
                  </AppButton>
                  <AppButton
                    variant="default"
                    disabled={busy || !!pendingValue}
                    onClick={cancelLink}
                  >
                    Cancel
                  </AppButton>
                </div>
              </form>
            ) : tab === 'link' && link ? (
              <div className="research-detail-inner">
                <h3>
                  {view?.sources.find((row) => row.id === link.sourceId)?.title ?? 'Missing source'}
                </h3>
                <p>
                  {link.role.replace('_', ' ')} → {targetLabel(link.claimId, link.documentId)}
                </p>
                <p>
                  {link.state} · human {link.review.replace('_', ' ')}. This manual relationship is
                  separate from manuscript citations.
                </p>
                {view && linkWarnings(view, link).length ? (
                  <p role="status">Review needed: {linkWarnings(view, link).join('; ')}.</p>
                ) : null}
                {selectedExcerpt ? (
                  <>
                    <blockquote className="research-quote">{selectedExcerpt.quote}</blockquote>
                    <p>
                      {selectedExcerpt.kind} ·{' '}
                      {selectedExcerpt.pageIndex === 0
                        ? 'plain text'
                        : selectedExcerpt.pageIndex === null
                          ? 'page unavailable'
                          : `PDF page ${selectedExcerpt.pageIndex}`}
                    </p>
                    <AppButton
                      variant="light"
                      onClick={() => inspect(selectedExcerpt.sourceId, selectedExcerpt.id)}
                    >
                      Open exact excerpt and original
                    </AppButton>
                  </>
                ) : (
                  <p>
                    {link.excerptId
                      ? 'The linked excerpt is unavailable. Its identity has not been replaced.'
                      : 'Whole source; no exact excerpt attached.'}
                  </p>
                )}
                <div className="research-actions">
                  <AppButton
                    variant="subtle"
                    onClick={() =>
                      session.research({ kind: 'sources', sourceId: link.sourceId, page: 'usage' })
                    }
                  >
                    View all source uses
                  </AppButton>
                  {link.claimId ? (
                    <AppButton
                      variant="subtle"
                      onClick={() =>
                        session.research({
                          kind: 'evidence',
                          item: { kind: 'claim', id: link.claimId! }
                        })
                      }
                    >
                      Open claim
                    </AppButton>
                  ) : link.documentId ? (
                    openSection(link.documentId)
                  ) : null}
                </div>
                <SelectField
                  label="Evidence role"
                  value={link.role}
                  disabled={editsLocked}
                  onChange={(event) =>
                    changeLink({ role: event.target.value as EvidenceRole, review: 'needs_review' })
                  }
                >
                  {roles.map((value) => (
                    <option key={value} value={value}>
                      {value.replace('_', ' ')}
                    </option>
                  ))}
                </SelectField>
                <div className="research-actions">
                  <AppButton
                    disabled={editsLocked}
                    onClick={() => changeLink({ review: 'reviewed', state: 'active' })}
                  >
                    Confirm against current target
                  </AppButton>
                  <AppButton
                    variant="light"
                    disabled={editsLocked}
                    onClick={() => changeLink({ review: 'needs_review' })}
                  >
                    Needs review
                  </AppButton>
                  <AppButton
                    variant="subtle"
                    disabled={editsLocked}
                    onClick={() =>
                      changeLink({ state: link.state === 'active' ? 'removed' : 'active' })
                    }
                  >
                    {link.state === 'active' ? 'Remove link' : 'Restore link'}
                  </AppButton>
                </div>
                <details className="research-disclosure">
                  <summary>Provenance and history</summary>
                  <p>
                    Linked {new Date(link.createdAt).toLocaleString()}; last changed{' '}
                    {new Date(link.updatedAt).toLocaleString()}.
                  </p>
                  {selectedExcerpt ? (
                    <p>
                      Retained original SHA-256: <code>{selectedExcerpt.sha256}</code>
                    </p>
                  ) : null}
                  {history('link', link.id)}
                </details>
              </div>
            ) : (
              <EmptyState title={tab === 'link' ? 'Follow the evidence' : `Choose a ${tab}`}>
                {tab === 'link'
                  ? 'Select an evidence link or add one to connect a source to your argument.'
                  : 'Choose an item to see its writing context, sources, and history, or add your first one.'}
              </EmptyState>
            )}
          </ResearchLayout>
        </section>
      )}
    />
  )
}
