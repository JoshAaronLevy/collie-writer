import PresentationBoundary from '../../components/PresentationBoundary'
import { useEffectEvent } from 'react'
import { useLayoutEffect } from 'react'
import { useSynchronousState } from '../../hooks/useSynchronousState'
import { Checkbox, TextInput } from '@mantine/core'
import { AppButton, SelectField } from '../../components/ui/Controls'
import { EmptyState } from '../../components/ui/Feedback'
import { ResearchHeader, ResearchLayout } from '../research/ResearchLayout'
import { SourceUsage, UsageSummary } from '../research/SourceUsage'
import { useWorkspaceSession } from '../workspace/workspaceContext'
import './SourcesPanel.css'
import { useRetainedDraft } from '../workspace/DraftOwner'
import { useEffect, useRef, useState } from 'react'
import type { OpenProject } from '../../../../shared/projects'
import type {
  SourceMetadata,
  SourceRecord,
  SourcesView,
  SourceImportPreview,
  SourceImportChoice,
  SourceChangeInput,
  BibliographyFormat,
  SourceAttachmentInput
} from '../../../../shared/sources'
import { SOURCE_TYPES } from '../../../../shared/sources'

const blank = (): SourceMetadata => ({
  type: 'article-journal',
  title: '',
  author: [],
  issued: '',
  containerTitle: '',
  publisher: '',
  edition: '',
  volume: '',
  issue: '',
  page: '',
  DOI: '',
  URL: '',
  ISBN: '',
  ISSN: ''
})

const creators = (metadata: SourceMetadata): string =>
  metadata.author.map((a) => a.literal || `${a.family}${a.given ? `, ${a.given}` : ''}`).join('; ')
const parseCreators = (text: string): SourceMetadata['author'] =>
  text
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      if (!s.includes(',')) return { family: '', given: '', literal: s }
      const [family, ...given] = s.split(',')
      return { family: family.trim(), given: given.join(',').trim(), literal: '' }
    })

export default function SourcesPanel({
  project,
  focusSourceId,
  focusPage,
  disabled,
  readOnly,
  onCommitted,
  onInspect
}: {
  project: OpenProject
  focusSourceId: string | null
  focusPage?: 'details' | 'usage' | 'files'
  disabled: boolean
  readOnly: boolean
  onCommitted: () => Promise<void>
  onInspect: (sourceId: string) => void
}): React.JSX.Element {
  const session = useWorkspaceSession()
  const [page, setPage] = useState<'details' | 'usage' | 'files'>('details'),
    [creating, setCreating] = useState(false),
    [query, setQuery] = useState(''),
    [showRemoved, setShowRemoved] = useState(false)
  const readSequence = useRef(0),
    [attachmentPendingValue, setAttachmentPendingValue, attachmentPending] =
      useSynchronousState<SourceAttachmentInput | null>(null)
  const [baseRevisionValue, setBaseRevisionValue, baseRevision] = useSynchronousState<
      string | null
    >(null),
    [mutationValue, setMutationValue, mutation] = useSynchronousState<SourceChangeInput | null>(
      null
    )
  const panel = useRef<HTMLElement>(null),
    focusedRequest = useRef<string | null>(null),
    saveTask = useRef<Promise<boolean> | null>(null)
  const [view, setView] = useState<SourcesView | null>(null),
    [selected, setSelected] = useState<string | null>(null)
  const [draft, setDraft] = useState<SourceMetadata>(blank),
    [creatorText, setCreatorText] = useState(''),
    [verified, setVerified] = useState(false),
    [linked, setLinked] = useState<string[]>([])
  const [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('')
  const [preview, setPreview] = useState<SourceImportPreview | null>(null),
    [choices, setChoices] = useState<SourceImportChoice[]>([]),
    [exportFormat, setExportFormat] = useState<BibliographyFormat>('csl-json'),
    [exportSelection, setExportSelection] = useState<string[]>([]),
    [exportLosses, setExportLosses] = useState<string[]>([]),
    [mergeTarget, setMergeTarget] = useState('')
  const [attachmentProgress, setAttachmentProgress] = useState<{
      transferred: number
      total: number
    } | null>(null),
    attachmentOperation = useRef<string | null>(null)
  const [pendingValue, setPendingValue, pending] = useSynchronousState<SourceChangeInput | null>(
      null
    ),
    [pendingImportValue, setPendingImportValue, pendingImport] = useSynchronousState<string | null>(
      null
    ),
    latest = useRef({
      selected: null as string | null,
      draft: blank(),
      verified: false,
      linked: [] as string[],
      dirty: false,
      view: null as SourcesView | null
    })
  useLayoutEffect(() => {
    latest.current = {
      selected,
      draft: { ...draft, author: parseCreators(creatorText) },
      verified,
      linked,
      dirty,
      view
    }
  })
  function acceptView(next: SourcesView): void {
    readSequence.current++
    latest.current.view = next
    setView(next)
  }
  useEffect(() => {
    let active = true
    const request = ++readSequence.current
    void window.collie
      .readSources({ projectId: project.projectId, workspaceId: project.workspaceId })
      .then((result) => {
        if (!active || request !== readSequence.current) return
        if (result.ok) {
          latest.current.view = result.value
          setView(result.value)
        } else setError(result.error.message)
      })
      .catch(() => {
        if (active)
          setError(
            'Sources could not be loaded. Reopen this project to retry; existing drafts are retained.'
          )
      })
    return () => {
      active = false
    }
  }, [project.projectId, project.workspaceId, project.headCommitId])
  useEffect(
    () =>
      window.collie.onSourceProgress((progress) => {
        if (progress.operationId === attachmentOperation.current)
          setAttachmentProgress({ transferred: progress.transferred, total: progress.total })
      }),
    []
  )
  function change(next: SourceMetadata, authors = creatorText): void {
    setDraft(next)
    setCreatorText(authors)
    setDirty(true)
    setPendingValue(null)
  }
  function choose(row: SourceRecord | null): void {
    if (
      latest.current.dirty ||
      session.composition.current ||
      pending.current ||
      mutation.current ||
      attachmentPending.current
    )
      return
    setBaseRevisionValue(row?.revisionId ?? null)
    setCreating(!row)
    setPage('details')
    setSelected(row?.id ?? null)
    setDraft(row?.metadata ?? blank())
    setCreatorText(row ? creators(row.metadata) : '')
    setVerified(row?.verified ?? false)
    setLinked(row?.documentIds ?? [])
    setMergeTarget('')
    setError('')
    setMessage('')
  }
  const onSourceNavigation = useEffectEvent(() => {
    if (!focusSourceId) {
      focusedRequest.current = null
      return
    }
    if (
      !view ||
      dirty ||
      focusedRequest.current === `${focusSourceId}:${focusPage}:${session.focusRevision}`
    )
      return
    if (pending.current || mutation.current || attachmentPending.current || pendingImport.current) {
      setError('Retry the pending source operation before choosing a different source.')
      return
    }
    const target = view.sources.find((source) => source.id === focusSourceId)
    if (target) {
      focusedRequest.current = `${focusSourceId}:${focusPage}:${session.focusRevision}`
      choose(target)
      setPage(focusPage ?? 'details')
      setQuery('')
      if (target.state !== 'active') setShowRemoved(true)
    } else setError('The requested source is no longer available.')
  })
  // Present only the latest committed navigation request, after retained regions update.
  useEffect(() => {
    const frame = requestAnimationFrame(() => onSourceNavigation())
    return () => cancelAnimationFrame(frame)
  }, [
    focusSourceId,
    focusPage,
    session.focusRevision,
    view,
    dirty,
    pendingValue,
    mutationValue,
    attachmentPendingValue,
    pendingImportValue
  ])
  async function save(): Promise<boolean> {
    if (saveTask.current) return saveTask.current
    const task = saveOnce()
    saveTask.current = task
    try {
      return await task
    } finally {
      if (saveTask.current === task) saveTask.current = null
    }
  }

  async function saveOnce(): Promise<boolean> {
    if (session.composition.current) {
      setError('Finish composing source details before saving.')
      return false
    }
    const state = latest.current
    if (!state.dirty && !pending.current) return true
    const current = state.view?.sources.find((s) => s.id === state.selected)
    const input = pending.current ?? {
      ...{ projectId: project.projectId, workspaceId: project.workspaceId },
      operationId: crypto.randomUUID(),
      change: current
        ? {
            type: 'update' as const,
            id: current.id,
            expectedRevisionId: baseRevision.current ?? current.revisionId,
            metadata: state.draft,
            verified: state.verified,
            documentIds: state.linked
          }
        : {
            type: 'create' as const,
            id: crypto.randomUUID(),
            metadata: state.draft,
            verified: state.verified,
            documentIds: state.linked
          }
    }
    setPendingValue(input)
    setBusy(true)
    setError('')
    try {
      const result = await window.collie.changeSource(input)
      if (!result.ok) {
        setError(result.error.message)
        if (result.error.code !== 'UNAVAILABLE') setPendingValue(null)
        return false
      }
      setPendingValue(null)
      acceptView(result.value)
      latest.current.dirty = false
      setDirty(false)
      if (input.change.type === 'create' || input.change.type === 'update') {
        const saved = result.value.sources.find((row) => row.id === input.change.id)
        if (saved) {
          setBaseRevisionValue(saved.revisionId)
          latest.current = {
            selected: saved.id,
            draft: saved.metadata,
            verified: saved.verified,
            linked: saved.documentIds,
            dirty: false,
            view: result.value
          }
          setSelected(saved.id)
          setDraft(saved.metadata)
          setCreatorText(creators(saved.metadata))
          setVerified(saved.verified)
          setLinked(saved.documentIds)
          setCreating(false)
        }
      }
      setMessage('Source protected in local recovery. Save the project file separately.')
      await onCommitted()
      return true
    } catch {
      setError(
        pending.current
          ? 'The source result is unknown. Retry the same source save.'
          : 'Source saved, but the workspace could not refresh. Reopen Research to refresh its status.'
      )
      return false
    } finally {
      setBusy(false)
    }
  }
  async function mutate(change: SourceChangeInput['change'], retry = false): Promise<void> {
    if (readOnly || (mutation.current && !retry)) return
    if (!retry && !(await save())) return
    const input = mutation.current ?? {
      ...{ projectId: project.projectId, workspaceId: project.workspaceId },
      operationId: crypto.randomUUID(),
      change
    }
    setMutationValue(input)
    setBusy(true)
    setError('')
    try {
      const result = await window.collie.changeSource(input)
      if (!result.ok) {
        if (result.error.code !== 'UNAVAILABLE') setMutationValue(null)
        setError(result.error.message)
        return
      }
      setMutationValue(null)
      acceptView(result.value)
      const id = input.change.id
      const saved = result.value.sources.find((row) => row.id === id)
      if (saved) {
        setBaseRevisionValue(saved.revisionId)
        setSelected(saved.id)
        setDraft(saved.metadata)
        setCreatorText(creators(saved.metadata))
        setVerified(saved.verified)
        setLinked(saved.documentIds)
      }
      setMergeTarget('')
      setMessage('Source change protected locally.')
      await onCommitted()
    } catch {
      setError(
        'This source change has an unknown outcome. Retry the same operation before continuing.'
      )
    } finally {
      setBusy(false)
    }
  }
  async function pickImport(): Promise<void> {
    if (!(await save())) return
    setBusy(true)
    setError('')
    try {
      const pick = await window.collie.pickSourceImport({
        projectId: project.projectId,
        workspaceId: project.workspaceId
      })
      if (!pick.ok) {
        setError(pick.error.message)
        return
      }
      if (!pick.value) return
      const result = await window.collie.previewSourceImport({
        ...{ projectId: project.projectId, workspaceId: project.workspaceId },
        token: pick.value.token
      })
      if (!result.ok) {
        setError(result.error.message)
        return
      }
      setPendingImportValue(null)
      setPreview(result.value)
      setChoices(
        result.value.rows.map((r) => ({
          index: r.index,
          action: r.error || r.candidates.length ? ('skip' as const) : ('create' as const),
          targetId: null
        }))
      )
      setMessage('Review every row. Similar titles are never merged automatically.')
    } catch {
      setError('The bibliography could not be opened. Sources and current edits were kept.')
    } finally {
      setBusy(false)
    }
  }
  async function commitPreview(): Promise<void> {
    if (!preview) return
    setBusy(true)
    setError('')
    const operationId = pendingImport.current ?? crypto.randomUUID()
    setPendingImportValue(operationId)
    try {
      const result = await window.collie.commitSourceImport({
        ...{ projectId: project.projectId, workspaceId: project.workspaceId },
        operationId,
        token: preview.token,
        digest: preview.digest,
        choices
      })
      if (result.ok) {
        setPendingImportValue(null)
        acceptView(result.value)
        setPreview(null)
        setMessage('Bibliography imported. Review the retained report and unknown fields.')
        await onCommitted()
      } else {
        if (result.error.code !== 'UNAVAILABLE') setPendingImportValue(null)
        setError(result.error.message)
      }
    } catch {
      setError('The import has an unknown outcome. Retry the same reviewed import.')
    } finally {
      setBusy(false)
    }
  }
  async function attach(sourceId: string, retry = false): Promise<void> {
    if (readOnly || busy || (!retry && !(await save()))) return
    setBusy(true)
    setError('')
    setMessage('Copying the selected original into local managed storage…')
    try {
      if (!attachmentPending.current) {
        const pick = await window.collie.pickSourceAttachment({
          projectId: project.projectId,
          workspaceId: project.workspaceId
        })
        if (!pick.ok) {
          setError(pick.error.message)
          return
        }
        if (!pick.value) return
        setAttachmentPendingValue({
          ...{ projectId: project.projectId, workspaceId: project.workspaceId },
          operationId: crypto.randomUUID(),
          sourceId,
          token: pick.value.token
        })
      }
      const input = attachmentPending.current
      if (!input) throw new Error('Source attachment request was not retained')
      attachmentOperation.current = input.operationId
      setAttachmentProgress(null)
      const result = await window.collie.attachSourceFile(input)
      if (result.ok) {
        setAttachmentPendingValue(null)
        acceptView(result.value)
        const saved = result.value.sources.find((row) => row.id === latest.current.selected)
        if (saved) {
          setBaseRevisionValue(saved.revisionId)
          setDraft(saved.metadata)
          setCreatorText(creators(saved.metadata))
          setVerified(saved.verified)
          setLinked(saved.documentIds)
        }
        setMessage('Managed original copied. Project backups include this local copy.')
        await onCommitted()
      } else {
        if (result.error.code !== 'UNAVAILABLE') setAttachmentPendingValue(null)
        setError(result.error.message)
      }
    } catch {
      setError(
        attachmentPending.current
          ? 'The attachment copy has an unknown outcome. Retry the same copy.'
          : 'Original copied, but the workspace could not refresh. Reopen Research.'
      )
    } finally {
      attachmentOperation.current = null
      setAttachmentProgress(null)
      setBusy(false)
    }
  }
  async function selectSource(id: string): Promise<void> {
    if (
      session.composition.current ||
      busy ||
      mutation.current ||
      attachmentPending.current ||
      !(await save())
    )
      return
    const saved = latest.current.view?.sources.find((row) => row.id === id)
    if (saved) {
      choose(saved)
      setPage('usage')
    }
  }
  async function exportLibrary(): Promise<void> {
    if (!(await save())) return
    setBusy(true)
    setError('')
    try {
      const result = await window.collie.exportSources({
        ...{ projectId: project.projectId, workspaceId: project.workspaceId },
        operationId: crypto.randomUUID(),
        format: exportFormat,
        sourceIds: exportSelection
      })
      if (result.ok) {
        setExportLosses(result.value.losses)
        setMessage(
          `Exported ${result.value.count} sources to ${result.value.path}. Review the declared losses below.`
        )
      } else if (result.error.code !== 'CANCELLED') setError(result.error.message)
    } catch {
      setError('Bibliography export could not finish. Your sources remain stored.')
    } finally {
      setBusy(false)
    }
  }
  const current = view?.sources.find((s) => s.id === selected)
  const locked = disabled || busy || !!mutationValue || !!attachmentPendingValue
  const fieldsLocked = locked || !!pendingValue || !!mutationValue || current?.state === 'merged'
  const draftBinding = useRetainedDraft('sources', {
    read: () => ({
      scope: { projectId: project.projectId, workspaceId: project.workspaceId },
      kind: 'source',
      entityId: selected,
      label: 'source metadata',
      dirty: latest.current.dirty,
      composing: false,
      busy,
      pendingOperation: pending.current,
      policy: 'flush',
      issue: error,
      target: {
        kind: 'workspace',
        scope: { projectId: project.projectId, workspaceId: project.workspaceId },
        view: 'research',
        target: { kind: 'sources', sourceId: selected ?? undefined, page }
      }
    }),
    flush: save,
    focus: () => panel.current?.focus()
  })
  useRetainedDraft('source-operations', {
    read: () => ({
      scope: { projectId: project.projectId, workspaceId: project.workspaceId },
      kind: 'source-operation',
      entityId: selected,
      label: 'source import or attachment',
      dirty: false,
      composing: false,
      busy,
      pendingOperation: pendingImport.current ?? mutation.current ?? attachmentPending.current,
      policy: 'operation',
      issue:
        pendingImport.current || mutation.current || attachmentPending.current ? error : undefined,
      status: busy ? 'Working…' : message || undefined,
      target: {
        kind: 'workspace',
        scope: { projectId: project.projectId, workspaceId: project.workspaceId },
        view: 'research',
        target: { kind: 'sources' }
      }
    })
  })
  useRetainedDraft('source-import-review', {
    read: () => ({
      scope: { projectId: project.projectId, workspaceId: project.workspaceId },
      kind: 'import-review',
      entityId: null,
      label: 'bibliography import choices',
      dirty: !!preview && !pendingImport.current,
      composing: false,
      busy: false,
      pendingOperation: null,
      policy: 'explicit',
      target: {
        kind: 'workspace',
        scope: { projectId: project.projectId, workspaceId: project.workspaceId },
        view: 'research',
        target: { kind: 'sources' }
      }
    })
  })
  const rows =
    view?.sources.filter(
      (row) =>
        (showRemoved || row.state === 'active') &&
        `${row.metadata.title} ${creators(row.metadata)}`
          .toLocaleLowerCase()
          .includes(query.toLocaleLowerCase())
    ) ?? []
  return (
    <PresentationBoundary
      label="Sources"
      render={() => (
        <section
          ref={panel}
          tabIndex={-1}
          {...draftBinding}
          className="sources-panel"
          aria-label="Sources and bibliography"
        >
          <ResearchHeader title="Sources">
            Keep originals, citation details and research connections together.
          </ResearchHeader>
          {error ? <p role="alert">{error}</p> : null}
          {message ? <p role="status">{message}</p> : null}
          {attachmentPendingValue ? (
            <AppButton
              disabled={disabled || busy || readOnly}
              onClick={() => {
                if (attachmentPending.current) void attach(attachmentPending.current.sourceId, true)
              }}
            >
              Retry original copy
            </AppButton>
          ) : null}
          {mutationValue ? (
            <AppButton
              disabled={disabled || busy || readOnly}
              onClick={() => {
                if (mutation.current) void mutate(mutation.current.change, true)
              }}
            >
              Retry source action
            </AppButton>
          ) : null}
          <div className="research-actions">
            <AppButton
              disabled={locked || readOnly || dirty || !!preview}
              onClick={() => choose(null)}
            >
              Add source
            </AppButton>
            <AppButton
              variant="default"
              disabled={locked || readOnly || !!pendingImportValue || !!preview}
              onClick={() => void pickImport()}
            >
              Import bibliography…
            </AppButton>
          </div>
          {preview ? (
            <section className="source-import-review" aria-label="Bibliography import review">
              <h2>Review {preview.count} imported records</h2>
              <p>
                CSL JSON, BibTeX and RIS only. Similar records are never merged automatically.
                Cancel leaves the library unchanged.
              </p>
              <ol>
                {preview.rows.map((row) => {
                  const choice = choices[row.index]
                  return (
                    <li key={row.index}>
                      <strong>{row.metadata?.title || `Record ${row.index + 1}`}</strong>
                      {row.error ? <p role="alert">{row.error}</p> : null}
                      {row.losses.length ? <p>Declared losses: {row.losses.join(' ')}</p> : null}
                      <SelectField
                        label={`Action for record ${row.index + 1}`}
                        value={`${choice?.action || 'skip'}:${choice?.targetId || ''}`}
                        disabled={locked || !!row.error || !!pendingImportValue}
                        onChange={(event) => {
                          const [action, targetId] = event.target.value.split(':')
                          setChoices((old) =>
                            old.map((item) =>
                              item.index === row.index
                                ? {
                                    ...item,
                                    action: action as SourceImportChoice['action'],
                                    targetId: targetId || null
                                  }
                                : item
                            )
                          )
                        }}
                      >
                        <option value="skip:">Skip</option>
                        <option value="create:">Keep separate</option>
                        {row.candidates.flatMap((candidate) =>
                          ['merge', 'link'].map((action) => (
                            <option
                              key={`${action}:${candidate.id}`}
                              value={`${action}:${candidate.id}`}
                            >
                              {action === 'merge' ? 'Merge into' : 'Link imported ID to'}{' '}
                              {view?.sources.find((item) => item.id === candidate.id)?.metadata
                                .title ?? 'Retained source'}{' '}
                              · {candidate.reason}
                            </option>
                          ))
                        )}
                      </SelectField>
                    </li>
                  )
                })}
              </ol>
              <div className="research-actions">
                <AppButton disabled={locked || readOnly} onClick={() => void commitPreview()}>
                  {pendingImportValue ? 'Retry reviewed import' : 'Commit reviewed import'}
                </AppButton>
                <AppButton
                  variant="default"
                  disabled={locked || !!pendingImportValue}
                  onClick={() => {
                    setPreview(null)
                    setChoices([])
                    setMessage('Import cancelled. No source changed.')
                  }}
                >
                  Cancel import
                </AppButton>
              </div>
            </section>
          ) : null}
          <ResearchLayout
            sidebar={
              <>
                <TextInput
                  label="Find a source"
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.currentTarget.value)}
                />
                <Checkbox
                  label="Include trashed and merged sources"
                  checked={showRemoved}
                  onChange={(event) => setShowRemoved(event.currentTarget.checked)}
                />
                {!view ? (
                  <p role="status">Loading sources…</p>
                ) : !rows.length ? (
                  <p>
                    {query
                      ? 'No matching sources. Change the search.'
                      : 'No sources in this view. Add a source or import your bibliography.'}
                  </p>
                ) : null}
                <ul className="research-item-list">
                  {rows.map((source) => (
                    <li key={source.id}>
                      <AppButton
                        variant="subtle"
                        className="research-item-button"
                        classNames={{ label: 'research-item-label', inner: 'research-item-inner' }}
                        disabled={locked || !!preview}
                        aria-current={selected === source.id ? 'true' : undefined}
                        onClick={() => void selectSource(source.id)}
                      >
                        <span>{source.metadata.title}</span>
                        <small>
                          {source.state} ·{' '}
                          {source.verified ? 'Metadata reviewed' : 'Metadata needs review'}
                        </small>
                        <UsageSummary sourceId={source.id} />
                      </AppButton>
                    </li>
                  ))}
                </ul>
              </>
            }
          >
            {current || creating ? (
              <>
                <h2>{current?.metadata.title || 'New source'}</h2>
                {current ? (
                  <>
                    <div className="research-actions" role="group" aria-label="Source detail views">
                      {(['usage', 'details', 'files'] as const).map((value) => (
                        <AppButton
                          key={value}
                          variant={page === value ? 'default' : 'subtle'}
                          aria-pressed={page === value}
                          onClick={() => {
                            if (!session.composition.current) setPage(value)
                          }}
                        >
                          {value === 'usage'
                            ? 'Usage and context'
                            : value === 'details'
                              ? 'Citation details'
                              : 'Originals and history'}
                        </AppButton>
                      ))}
                    </div>
                    <p className="research-state">
                      {current.state} ·{' '}
                      {current.verified ? 'Metadata manually reviewed' : 'Metadata not reviewed'}
                      {baseRevisionValue !== current.revisionId
                        ? ' · Stored metadata changed; save will require resolving the revision.'
                        : ''}
                    </p>
                  </>
                ) : null}
                {current ? (
                  <div hidden={page !== 'usage'} inert={page !== 'usage'}>
                    <SourceUsage sourceId={current.id} />
                  </div>
                ) : null}
                <form
                  className="research-form"
                  hidden={!!current && page !== 'details'}
                  inert={!!current && page !== 'details'}
                  onSubmit={(event) => {
                    event.preventDefault()
                    if (!readOnly) void save()
                  }}
                >
                  <fieldset disabled={readOnly || fieldsLocked}>
                    <SelectField
                      label="Work type"
                      value={draft.type}
                      onChange={(event) =>
                        change({ ...draft, type: event.target.value as SourceMetadata['type'] })
                      }
                    >
                      {SOURCE_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {type === 'article-journal'
                            ? 'Journal article'
                            : type === 'webpage'
                              ? 'Web page'
                              : type[0].toUpperCase() + type.slice(1)}
                        </option>
                      ))}
                    </SelectField>
                    <TextInput
                      label="Title"
                      required
                      maxLength={2000}
                      value={draft.title}
                      onChange={(event) => change({ ...draft, title: event.currentTarget.value })}
                    />
                    <TextInput
                      label="Authors or organizations"
                      description="Family, Given; separate authors with semicolons. Enter an organization without a comma."
                      value={creatorText}
                      onChange={(event) => change(draft, event.currentTarget.value)}
                    />
                    <TextInput
                      label="Publication date"
                      description="YYYY, YYYY-MM or YYYY-MM-DD"
                      maxLength={2000}
                      value={draft.issued}
                      onChange={(event) => change({ ...draft, issued: event.currentTarget.value })}
                    />
                    <details className="research-disclosure">
                      <summary>Publication details and identifiers</summary>
                      <div className="source-metadata-fields">
                        {(
                          [
                            ['containerTitle', 'Journal / book title'],
                            ['publisher', 'Publisher'],
                            ['edition', 'Edition'],
                            ['volume', 'Volume'],
                            ['issue', 'Issue'],
                            ['page', 'Pages'],
                            ['DOI', 'DOI'],
                            ['URL', 'URL'],
                            ['ISBN', 'ISBN'],
                            ['ISSN', 'ISSN']
                          ] as const
                        ).map(([field, label]) => (
                          <TextInput
                            key={field}
                            label={label}
                            maxLength={2000}
                            value={draft[field]}
                            onChange={(event) =>
                              change({ ...draft, [field]: event.currentTarget.value })
                            }
                          />
                        ))}
                      </div>
                      <p>
                        DOI and URL are saved identifiers. They do not fetch an article or look up
                        metadata.
                      </p>
                    </details>
                    <Checkbox
                      label="I manually reviewed this metadata"
                      checked={verified}
                      onChange={(event) => {
                        setVerified(event.currentTarget.checked)
                        setDirty(true)
                      }}
                    />
                    <details className="research-disclosure">
                      <summary>Manual section associations ({linked.length})</summary>
                      <p>These links organize research; they do not insert manuscript citations.</p>
                      <div className="research-checklist">
                        {project.documents
                          .filter((item) => item.kind === 'text')
                          .map((item) => (
                            <Checkbox
                              key={item.id}
                              label={`${item.title} · ${item.state}`}
                              checked={linked.includes(item.id)}
                              onChange={(event) => {
                                const checked = event.currentTarget.checked
                                setLinked((old) =>
                                  checked ? [...old, item.id] : old.filter((id) => id !== item.id)
                                )
                                setDirty(true)
                              }}
                            />
                          ))}
                      </div>
                    </details>
                  </fieldset>
                  <div className="research-actions">
                    <AppButton type="submit" disabled={locked || readOnly || !dirty}>
                      {pendingValue ? 'Retry source save' : 'Save source'}
                    </AppButton>
                    {!pendingValue ? (
                      <AppButton
                        variant="default"
                        disabled={locked}
                        onClick={() => {
                          setDirty(false)
                          setBaseRevisionValue(current?.revisionId ?? null)
                          setDraft(current?.metadata ?? blank())
                          setCreatorText(current ? creators(current.metadata) : '')
                          setVerified(current?.verified ?? false)
                          setLinked(current?.documentIds ?? [])
                          if (!current) setCreating(false)
                        }}
                      >
                        {current ? 'Reload saved details' : 'Cancel new source'}
                      </AppButton>
                    ) : null}
                  </div>
                </form>
                {current ? (
                  <div hidden={page !== 'files'} inert={page !== 'files'}>
                    <h3>Managed originals</h3>
                    <p>
                      Attach PDF, text or an image. PDF/text inspection is local; scanned pages have
                      no OCR.
                    </p>
                    <div className="research-actions">
                      <AppButton
                        variant="default"
                        disabled={locked || readOnly || dirty || current.state !== 'active'}
                        onClick={() => void attach(current.id)}
                      >
                        Attach local original…
                      </AppButton>
                      <AppButton
                        variant="default"
                        disabled={locked || dirty}
                        onClick={() => onInspect(current.id)}
                      >
                        Inspect versions and excerpts
                      </AppButton>
                    </div>
                    {!current.attachments.length ? (
                      <p>No originals attached yet.</p>
                    ) : (
                      <ul className="source-attachments">
                        {current.attachments.map((attachment) => (
                          <li key={attachment.id}>
                            <strong>{attachment.name}</strong> · {attachment.mediaType} ·{' '}
                            {Math.round(attachment.bytes / 1024).toLocaleString()} KiB ·{' '}
                            {attachment.state}
                            <div className="research-actions">
                              <AppButton
                                variant="subtle"
                                disabled={locked}
                                onClick={() =>
                                  void window.collie
                                    .exportSourceAttachment({
                                      ...{
                                        projectId: project.projectId,
                                        workspaceId: project.workspaceId
                                      },
                                      attachmentId: attachment.id,
                                      suggestedName: attachment.name
                                    })
                                    .then((result) => {
                                      if (result.ok)
                                        setMessage(
                                          `Managed original copied to ${result.value.path}`
                                        )
                                      else if (result.error.code !== 'CANCELLED')
                                        setError(result.error.message)
                                    })
                                }
                              >
                                Save copy…
                              </AppButton>
                              {attachment.state === 'active' ? (
                                <AppButton
                                  variant="subtle"
                                  disabled={locked || readOnly || dirty}
                                  onClick={() =>
                                    void mutate({
                                      type: 'removeAttachment',
                                      id: current.id,
                                      attachmentId: attachment.id,
                                      expectedRevisionId: current.revisionId
                                    })
                                  }
                                >
                                  Remove attachment link
                                </AppButton>
                              ) : null}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                    <details className="research-disclosure">
                      <summary>Provenance and retained import data</summary>
                      <p>{current.provenance}</p>
                      <p>Source identity: {current.id}</p>
                      {current.aliases.length ? (
                        <p>Retained aliases: {current.aliases.join(', ')}</p>
                      ) : null}
                      {current.rawImport ? <pre>{current.rawImport}</pre> : null}
                      {current.unknownFields.length ? (
                        <p>Retained unknown fields: {current.unknownFields.join(', ')}</p>
                      ) : null}
                    </details>
                    <details className="research-disclosure">
                      <summary>Trash, restore or merge source</summary>
                      <p>
                        Trashing or merging keeps history and does not rewrite existing citations.
                        Review their original source identities in Usage and context.
                      </p>
                      {current.state !== 'merged' ? (
                        <>
                          <AppButton
                            variant="default"
                            disabled={locked || readOnly || dirty}
                            onClick={() =>
                              void mutate({
                                type: 'state',
                                id: current.id,
                                expectedRevisionId: current.revisionId,
                                state: current.state === 'trashed' ? 'active' : 'trashed'
                              })
                            }
                          >
                            {current.state === 'trashed'
                              ? 'Restore source'
                              : 'Move source to trash'}
                          </AppButton>
                          <SelectField
                            label="Merge into source"
                            disabled={locked || dirty}
                            value={mergeTarget}
                            onChange={(event) => setMergeTarget(event.target.value)}
                          >
                            <option value="">Choose source to keep</option>
                            {view?.sources
                              .filter((item) => item.id !== current.id && item.state === 'active')
                              .map((item) => (
                                <option key={item.id} value={item.id}>
                                  {item.metadata.title}
                                </option>
                              ))}
                          </SelectField>
                          <AppButton
                            variant="default"
                            disabled={locked || readOnly || dirty || !mergeTarget}
                            onClick={() =>
                              void mutate({
                                type: 'merge',
                                id: current.id,
                                targetId: mergeTarget,
                                expectedRevisionId: current.revisionId
                              })
                            }
                          >
                            Merge into chosen source
                          </AppButton>
                        </>
                      ) : current.replacementId ? (
                        <AppButton
                          variant="default"
                          onClick={() =>
                            session.research({ kind: 'sources', sourceId: current.replacementId! })
                          }
                        >
                          Open merge target
                        </AppButton>
                      ) : null}
                    </details>
                  </div>
                ) : null}
              </>
            ) : (
              <EmptyState title="Choose a source">
                Select a source to see where it is cited or connected to research, then edit its
                details or inspect an original.
              </EmptyState>
            )}
          </ResearchLayout>
          <details className="research-disclosure">
            <summary>Export bibliography</summary>
            <SelectField
              label="Export format"
              value={exportFormat}
              disabled={locked}
              onChange={(event) => setExportFormat(event.target.value as BibliographyFormat)}
            >
              <option value="csl-json">CSL JSON</option>
              <option value="bibtex">BibTeX</option>
              <option value="ris">RIS</option>
            </SelectField>
            <p>No selections exports all active sources.</p>
            <div className="research-checklist">
              {view?.sources
                .filter((item) => item.state === 'active')
                .map((item) => (
                  <Checkbox
                    key={item.id}
                    label={item.metadata.title}
                    checked={exportSelection.includes(item.id)}
                    disabled={locked}
                    onChange={(event) => {
                      const checked = event.currentTarget.checked
                      setExportSelection((old) =>
                        checked ? [...old, item.id] : old.filter((id) => id !== item.id)
                      )
                    }}
                  />
                ))}
            </div>
            <AppButton variant="default" disabled={locked} onClick={() => void exportLibrary()}>
              Export {exportSelection.length ? 'selected' : 'all active'} sources…
            </AppButton>
            {exportLosses.length ? (
              <ul>
                {exportLosses.map((loss, index) => (
                  <li key={index}>{loss}</li>
                ))}
              </ul>
            ) : null}
          </details>
          {view?.reports.length ? (
            <details className="research-disclosure">
              <summary>Retained import reports ({view.reports.length})</summary>
              {view.reports.map((report) => (
                <section key={report.id}>
                  <h3>
                    {report.format} · {new Date(report.createdAt).toLocaleString()}
                  </h3>
                  <p>
                    {report.imported} imported or linked; {report.skipped} skipped.
                  </p>
                  {report.errors.map((issue, index) => (
                    <p key={index}>{issue}</p>
                  ))}
                  {report.losses.map((loss, index) => (
                    <p key={index}>{loss}</p>
                  ))}
                </section>
              ))}
            </details>
          ) : null}
          {attachmentProgress ? (
            <p role="status">
              Copying managed original: {Math.round(attachmentProgress.transferred / 1024)} of{' '}
              {Math.round(attachmentProgress.total / 1024)} KiB
            </p>
          ) : null}
        </section>
      )}
    />
  )
}
