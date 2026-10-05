import { Checkbox, TextInput } from '@mantine/core'
import { useEffect, useRef, useState } from 'react'
import type { OpenProject } from '../../../../shared/projects'
import type {
  EvidenceChange,
  EvidenceRole,
  ResearchItem,
  ResearchDecision
} from '../../../../shared/evidence'
import { AppButton, SelectField, TextareaField } from '../../components/ui/Controls'
import { EmptyState } from '../../components/ui/Feedback'
import { ResearchHeader, ResearchLayout } from '../research/ResearchLayout'
import { useResearchData } from '../research/ResearchData'
import { UsageStatus } from '../research/SourceUsage'
import { linkWarnings } from '../research/usage'
import { useRetainedDraft } from '../workspace/DraftOwner'
import { useWorkspaceSession } from '../workspace/WorkspaceSession'
import './EvidencePanel.css'

type ItemKind = 'question' | 'claim'
type ItemDraft = {
  kind: ItemKind
  original: ResearchItem | null
  text: string
  documentId: string
  noteId: string
}
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
  disabled,
  readOnly,
  onCommitted,
  navigate,
  inspect
}: {
  project: OpenProject
  focusItem: { kind: ItemKind | 'link'; id: string } | null
  focusSourceId?: string
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
    pending = useRef<{ operationId: string; change: EvidenceChange } | null>(null)
  const [tab, setTab] = useState<ItemKind | 'link'>('question'),
    [query, setQuery] = useState(''),
    [includeRemoved, setIncludeRemoved] = useState(false)
  const [draft, setDraft] = useState<ItemDraft | null>(null),
    [linkId, setLinkId] = useState<string | null>(null),
    [newLink, setNewLink] = useState(false)
  const [decisionSource, setDecisionSource] = useState(''),
    [decisionReason, setDecisionReason] = useState(''),
    [decisionBase, setDecisionBase] = useState<ResearchDecision | null>(null)
  const [linkSource, setLinkSource] = useState(''),
    [linkExcerpt, setLinkExcerpt] = useState(''),
    [targetKind, setTargetKind] = useState<'claim' | 'section'>('claim'),
    [targetId, setTargetId] = useState(''),
    [targetRevision, setTargetRevision] = useState(''),
    [role, setRole] = useState<EvidenceRole>('support')
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('')
  const itemDirty =
    !!draft &&
    (draft.text !== (draft.original?.text ?? '') ||
      draft.documentId !== (draft.original?.documentId ?? '') ||
      draft.noteId !== (draft.original?.noteId ?? ''))
  const decisionDirty = decisionReason !== (decisionBase?.reason ?? '')
  const dirty =
    itemDirty ||
    decisionDirty ||
    !!linkSource ||
    !!linkExcerpt ||
    !!targetId ||
    (newLink && role !== 'support')
  const locked = disabled || busy || !!pending.current || !data.fresh
  const link = view?.links.find((item) => item.id === linkId)
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
    setNewLink(false)
    setDecisionSource('')
    setDecisionReason('')
    setDecisionBase(null)
  }
  function selectDecision(sourceId: string): void {
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
    if (draft) setDraft(draftFor(draft.kind, item ?? null))
    const saved =
      view?.decisions.find(
        (row) => row.questionId === draft?.original?.id && row.sourceId === decisionSource
      ) ?? null
    setDecisionBase(saved)
    setDecisionReason(saved?.reason ?? '')
    setLinkSource('')
    setLinkExcerpt('')
    setTargetId('')
    setTargetRevision('')
    setRole('support')
    setError('')
  }
  useEffect(() => {
    if (!focusItem) {
      focused.current = ''
      return
    }
    const key = `${focusItem.kind}:${focusItem.id}:${focusSourceId ?? ''}:${session.focusRevision}`
    if (!view || dirty || busy || pending.current || focused.current === key) return
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
      setNewLink(false)
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
  }, [focusItem?.id, focusItem?.kind, focusSourceId, session.focusRevision, view, dirty, busy])

  async function mutate(change: EvidenceChange, retry = false): Promise<void> {
    if (readOnly || disabled) {
      setError('Editing is unavailable for this project right now.')
      return
    }
    if (pending.current && !retry) {
      setError('Retry the pending research change first.')
      return
    }
    if (session.composition.current) return
    pending.current ??= { operationId: crypto.randomUUID(), change }
    const operation = pending.current
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const result = await window.collie.changeEvidence({ ...scope, ...operation })
      if (!result.ok) {
        if (result.error.code !== 'UNAVAILABLE') pending.current = null
        setError(result.error.message)
        return
      }
      pending.current = null
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
        setNewLink(false)
        setLinkSource('')
        setLinkExcerpt('')
        setTargetId('')
        setTargetRevision('')
      }
      setMessage('Research change protected locally. Save or back up the project file separately.')
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
    if (!draft || !draft.text.trim()) return
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
    <section
      ref={panel}
      {...binding}
      tabIndex={-1}
      className="evidence-panel"
      aria-labelledby="evidence-title"
    >
      <ResearchHeader id="evidence-title" title="Questions & claims">
        Organize your argument and the evidence behind it. A manual relationship records your
        assessment; it does not insert a citation.
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
            {kind === 'question' ? 'Questions' : kind === 'claim' ? 'Claims' : 'Evidence links'}
          </AppButton>
        ))}
      </div>
      {dirty ? (
        <p role="status">
          You have unsaved research edits.{' '}
          <AppButton variant="subtle" disabled={busy || !!pending.current} onClick={discard}>
            Discard form edits
          </AppButton>
        </p>
      ) : null}
      {pending.current ? (
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
              disabled={locked || readOnly}
              onClick={() => {
                if (!canChangeContext()) return
                if (tab === 'link') {
                  setNewLink(true)
                  setLinkId(null)
                  setDraft(null)
                } else choose(tab, null)
              }}
            >
              Add {tab === 'link' ? 'evidence link' : tab}
            </AppButton>
            <ul className="research-item-list">
              {tab === 'link'
                ? visibleLinks.map((row) => (
                    <li key={row.id}>
                      <AppButton
                        variant="subtle"
                        classNames={{ inner: 'research-item-inner', label: 'research-item-label' }}
                        className="research-item-button"
                        aria-current={row.id === linkId ? 'true' : undefined}
                        disabled={busy}
                        onClick={() => {
                          if (canChangeContext()) {
                            setLinkId(row.id)
                            setNewLink(false)
                            setDraft(null)
                          }
                        }}
                      >
                        <strong>
                          {view?.sources.find((source) => source.id === row.sourceId)?.title ??
                            'Missing source'}
                        </strong>
                        <span>
                          {row.role.replace('_', ' ')} · {targetLabel(row.claimId, row.documentId)}
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
                        classNames={{ inner: 'research-item-inner', label: 'research-item-label' }}
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
                No matching {tab === 'link' ? 'evidence links' : `${tab}s`}. Add one or adjust the
                filter.
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
                    disabled={busy || !!pending.current}
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
                disabled={locked || readOnly}
                onChange={(event) => setDraft({ ...draft, text: event.target.value })}
              />
              <details className="research-disclosure">
                <summary>Related writing and note</summary>
                <SelectField
                  label="Related section"
                  value={draft.documentId}
                  disabled={locked || readOnly}
                  onChange={(event) => setDraft({ ...draft, documentId: event.target.value })}
                >
                  <option value="">None</option>
                  {view?.sections.map((row) => (
                    <option
                      key={row.id}
                      value={row.id}
                      disabled={row.state !== 'active' && row.id !== draft.documentId}
                    >
                      {row.title}
                      {row.state !== 'active' ? ` (${row.state})` : ''}
                    </option>
                  ))}
                </SelectField>
                <SelectField
                  label="Related note"
                  value={draft.noteId}
                  disabled={locked || readOnly}
                  onChange={(event) => setDraft({ ...draft, noteId: event.target.value })}
                >
                  <option value="">None</option>
                  {view?.notes.map((row) => (
                    <option
                      key={row.id}
                      value={row.id}
                      disabled={row.state !== 'active' && row.id !== draft.noteId}
                    >
                      {row.title}
                      {row.state !== 'active' ? ` (${row.state})` : ''}
                    </option>
                  ))}
                </SelectField>
              </details>
              <div className="research-actions">
                <AppButton type="submit" disabled={locked || readOnly || !draft.text.trim()}>
                  {draft.original ? 'Save changes' : `Create ${tab}`}
                </AppButton>
                {item ? (
                  <AppButton
                    variant="subtle"
                    disabled={locked || readOnly || dirty}
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
                {tab === 'question' ? (
                  <div className="research-form">
                    <h4>Sources considered for this question</h4>
                    <p>
                      Keep or reject a source for this question. Other questions, writing, and
                      citations keep their own relationships.
                    </p>
                    <ul className="research-item-list">
                      {view?.decisions
                        .filter((row) => row.questionId === item.id)
                        .map((row) => (
                          <li key={row.sourceId}>
                            <AppButton
                              variant="subtle"
                              classNames={{
                                inner: 'research-item-inner',
                                label: 'research-item-label'
                              }}
                              className="research-item-button"
                              disabled={locked}
                              onClick={() => {
                                if (!decisionDirty) selectDecision(row.sourceId)
                                else setError('Save or discard the current decision reason first.')
                              }}
                            >
                              <strong>
                                {view.sources.find((source) => source.id === row.sourceId)?.title ??
                                  'Missing source'}
                              </strong>
                              <span>
                                {row.state}
                                {row.reason ? ` · ${row.reason}` : ''}
                              </span>
                            </AppButton>
                          </li>
                        ))}
                    </ul>
                    <SelectField
                      label="Source"
                      value={decisionSource}
                      disabled={locked || decisionDirty}
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
                          label="Decision reason"
                          value={decisionReason}
                          maxLength={2000}
                          rows={3}
                          disabled={locked || readOnly}
                          onChange={(event) => setDecisionReason(event.target.value)}
                        />
                        <div className="research-actions">
                          {(['candidate', 'kept', 'rejected'] as const).map((state) => (
                            <AppButton
                              key={state}
                              variant={decisionBase?.state === state ? 'filled' : 'light'}
                              disabled={
                                locked ||
                                readOnly ||
                                itemDirty ||
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
                                ? 'Mark candidate'
                                : state === 'kept'
                                  ? 'Keep for this question'
                                  : 'Reject for this question'}
                            </AppButton>
                          ))}
                        </div>
                        <p>A rejection requires a reason and can be reversed here.</p>
                        {history('decision', `${item.id}|${decisionSource}`)}
                      </>
                    ) : null}
                  </div>
                ) : (
                  <div>
                    <h4>Evidence for this claim</h4>
                    <ul className="research-item-list">
                      {view?.links
                        .filter((row) => row.claimId === item.id)
                        .map((row) => (
                          <li key={row.id}>
                            <AppButton
                              variant="subtle"
                              onClick={() =>
                                session.research({
                                  kind: 'evidence',
                                  item: { kind: 'link', id: row.id }
                                })
                              }
                            >
                              {view.sources.find((source) => source.id === row.sourceId)?.title ??
                                'Missing source'}{' '}
                              · {row.role.replace('_', ' ')} · {row.state}
                            </AppButton>
                          </li>
                        ))}
                    </ul>
                  </div>
                )}
                {history(tab, item.id)}
              </>
            ) : null}
          </div>
        ) : tab === 'link' && newLink ? (
          <form
            className="research-detail-inner research-form"
            onSubmit={(event) => {
              event.preventDefault()
              if (linkSource && targetId && targetRevision)
                void mutate({
                  type: 'createLink',
                  id: crypto.randomUUID(),
                  sourceId: linkSource,
                  excerptId: linkExcerpt || null,
                  claimId: targetKind === 'claim' ? targetId : null,
                  documentId: targetKind === 'section' ? targetId : null,
                  expectedTargetRevisionId: targetRevision,
                  role
                })
            }}
          >
            <h3>New evidence link</h3>
            <SelectField
              label="Source"
              value={linkSource}
              disabled={locked || readOnly}
              onChange={(event) => {
                setLinkSource(event.target.value)
                setLinkExcerpt('')
              }}
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
              value={linkExcerpt}
              disabled={locked || readOnly || !linkSource}
              onChange={(event) => setLinkExcerpt(event.target.value)}
            >
              <option value="">Whole source</option>
              {view?.excerpts
                .filter((row) => row.sourceId === linkSource)
                .map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.quote.slice(0, 120)} · {row.kind}
                    {view.sources.find((source) => source.id === row.sourceId)?.activeVersionId !==
                    row.versionId
                      ? ' · earlier version'
                      : ''}
                  </option>
                ))}
            </SelectField>
            {linkExcerpt ? (
              <blockquote className="research-quote">
                {view?.excerpts.find((row) => row.id === linkExcerpt)?.quote}
              </blockquote>
            ) : null}
            <SelectField
              label="Link to"
              value={targetKind}
              disabled={locked || readOnly}
              onChange={(event) => {
                setTargetKind(event.target.value as 'claim' | 'section')
                setTargetId('')
                setTargetRevision('')
              }}
            >
              <option value="claim">Claim</option>
              <option value="section">Section</option>
            </SelectField>
            <SelectField
              label={targetKind === 'claim' ? 'Claim' : 'Section'}
              value={targetId}
              disabled={locked || readOnly}
              onChange={(event) => {
                const id = event.target.value
                setTargetId(id)
                setTargetRevision(
                  (targetKind === 'claim' ? view?.claims : view?.sections)?.find(
                    (row) => row.id === id
                  )?.revisionId ?? ''
                )
              }}
            >
              <option value="">Choose target</option>
              {targetKind === 'claim'
                ? view?.claims
                    .filter((row) => row.state === 'active')
                    .map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.text}
                      </option>
                    ))
                : view?.sections
                    .filter((row) => row.state === 'active')
                    .map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.title}
                      </option>
                    ))}
            </SelectField>
            <SelectField
              label="Evidence role"
              value={role}
              disabled={locked || readOnly}
              onChange={(event) => setRole(event.target.value as EvidenceRole)}
            >
              {roles.map((value) => (
                <option key={value} value={value}>
                  {value.replace('_', ' ')}
                </option>
              ))}
            </SelectField>
            <AppButton type="submit" disabled={locked || readOnly || !linkSource || !targetId}>
              Create evidence link
            </AppButton>
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
              disabled={locked || readOnly}
              onChange={(event) =>
                void mutate({
                  type: 'changeLink',
                  id: link.id,
                  expectedRevisionId: link.revisionId,
                  role: event.target.value as EvidenceRole,
                  review: 'needs_review',
                  state: link.state
                })
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
                disabled={locked || readOnly}
                onClick={() =>
                  void mutate({
                    type: 'changeLink',
                    id: link.id,
                    expectedRevisionId: link.revisionId,
                    role: link.role,
                    review: 'reviewed',
                    state: 'active'
                  })
                }
              >
                Confirm against current target
              </AppButton>
              <AppButton
                variant="light"
                disabled={locked || readOnly}
                onClick={() =>
                  void mutate({
                    type: 'changeLink',
                    id: link.id,
                    expectedRevisionId: link.revisionId,
                    role: link.role,
                    review: 'needs_review',
                    state: link.state
                  })
                }
              >
                Needs review
              </AppButton>
              <AppButton
                variant="subtle"
                disabled={locked || readOnly}
                onClick={() =>
                  void mutate({
                    type: 'changeLink',
                    id: link.id,
                    expectedRevisionId: link.revisionId,
                    role: link.role,
                    review: link.review,
                    state: link.state === 'active' ? 'removed' : 'active'
                  })
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
  )
}
