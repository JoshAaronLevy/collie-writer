import { useConversations } from '../ai/conversations/conversationState'
import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from 'react'
import { useSynchronousState } from '../../hooks/useSynchronousState'
import { useWorkspaceSession } from '../workspace/workspaceContext'
import { useRetainedDraft } from '../workspace/DraftOwner'
import type { OpenProject } from '../../../../shared/projects'
import type {
  SourceMetadata,
  SourceAttachment,
  SourceRecord,
  SourcesView,
  SourceChangeInput,
  BibliographyFormat,
  SourceAttachmentInput
} from '../../../../shared/sources'

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

export type SourcesProps = {
  project: OpenProject
  focusSourceId: string | null
  focusPage?: 'details' | 'usage' | 'files'
  createRequested?: { id: string; url?: string }
  disabled: boolean
  readOnly: boolean
  onCommitted: () => Promise<void>
}

type SourcesOwner = {
  session: ReturnType<typeof useWorkspaceSession>
  conversations: ReturnType<typeof useConversations>
  page: 'details' | 'usage' | 'files'
  creating: boolean
  query: string
  setQuery: (value: string) => void
  showRemoved: boolean
  setShowRemoved: (value: boolean) => void
  baseRevisionValue: string | null
  attachmentPendingValue: SourceAttachmentInput | null
  mutationValue: SourceChangeInput | null
  pendingValue: SourceChangeInput | null
  view: SourcesView | null
  selected: string | null
  draft: SourceMetadata
  creatorText: string
  verified: boolean
  setVerified: (value: boolean) => void
  linked: string[]
  setLinked: React.Dispatch<React.SetStateAction<string[]>>
  dirty: boolean
  setDirty: (value: boolean) => void
  busy: boolean
  error: string
  message: string
  exportFormat: BibliographyFormat
  setExportFormat: (value: BibliographyFormat) => void
  exportSelection: string[]
  setExportSelection: React.Dispatch<React.SetStateAction<string[]>>
  exportLosses: string[]
  mergeTarget: string
  setMergeTarget: (value: string) => void
  attachmentProgress: { transferred: number; total: number } | null
  current: SourceRecord | undefined
  locked: boolean
  fieldsLocked: boolean
  panel: React.RefObject<HTMLElement | null>
  draftBinding: ReturnType<typeof useRetainedDraft>
  rows: SourceRecord[]
  change: (next: SourceMetadata, authors?: string) => void
  choose: (row: SourceRecord | null) => void
  save: () => Promise<boolean>
  mutate: (change: SourceChangeInput['change'], retry?: boolean) => Promise<void>
  attach: (sourceId: string, retry?: boolean) => Promise<void>
  selectSource: (id: string) => Promise<void>
  exportLibrary: () => Promise<void>
  discard: () => void
  saveCopy: (attachment: SourceAttachment) => Promise<void>
  retryAttachment: () => void
  retryMutation: () => void
}

/** Retained source drafts, exact mutations and library reads; presentation stays in SourcesPanel. */
export function useSources({
  project,
  focusSourceId,
  focusPage,
  disabled,
  readOnly,
  createRequested,
  onCommitted
}: SourcesProps): SourcesOwner {
  const session = useWorkspaceSession(),
    conversations = useConversations()
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
  const [exportFormat, setExportFormat] = useState<BibliographyFormat>('csl-json'),
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
        if (active && request === readSequence.current)
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
  const createdForNavigation = useRef(new Set<string>())
  const onCreateNavigation = useEffectEvent(() => {
    if (
      !createRequested ||
      !view ||
      disabled ||
      readOnly ||
      busy ||
      dirty ||
      pending.current ||
      mutation.current ||
      attachmentPending.current ||
      session.navigating ||
      session.composition.current ||
      createdForNavigation.current.has(createRequested.id)
    )
      return
    createdForNavigation.current.add(createRequested.id)
    if (createdForNavigation.current.size > 64)
      createdForNavigation.current.delete(createdForNavigation.current.values().next().value!)
    choose(null)
    if (createRequested.url) {
      setDraft({ ...blank(), type: 'webpage', URL: createRequested.url })
      setDirty(true)
      setMessage('URL added. Enter the source details; the page has not been fetched.')
    }
  })
  useEffect(() => {
    const frame = requestAnimationFrame(() => onCreateNavigation())
    return () => cancelAnimationFrame(frame)
  }, [
    createRequested,
    view,
    disabled,
    readOnly,
    busy,
    dirty,
    pendingValue,
    mutationValue,
    attachmentPendingValue,
    session.navigating,
    session.focusRevision,
    session.composition
  ])
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
    if (pending.current || mutation.current || attachmentPending.current) {
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
    attachmentPendingValue
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
      setMessage('Source saved.')
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
      setMessage('Source updated.')
      await onCommitted()
    } catch {
      setError(
        'This source change has an unknown outcome. Retry the same operation before continuing.'
      )
    } finally {
      setBusy(false)
    }
  }
  async function attach(sourceId: string, retry = false): Promise<void> {
    if (readOnly || busy || (!retry && !(await save()))) return
    setBusy(true)
    setError('')
    setMessage('')
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
      setMessage('Copying file…')
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
        setMessage('File attached.')
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
      setPage('details')
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
  async function saveCopy(attachment: SourceAttachment): Promise<void> {
    setBusy(true)
    setError('')
    try {
      const result = await window.collie.exportSourceAttachment({
        projectId: project.projectId,
        workspaceId: project.workspaceId,
        attachmentId: attachment.id,
        suggestedName: attachment.name
      })
      if (result.ok) setMessage(`Copy saved to ${result.value.path}`)
      else if (result.error.code !== 'CANCELLED') setError(result.error.message)
    } catch {
      setError('The copy could not be confirmed. Your attached original is kept.')
    } finally {
      setBusy(false)
    }
  }
  function discard(): void {
    if (pending.current || mutation.current || attachmentPending.current || busy) return
    latest.current.dirty = false
    setDirty(false)
    setBaseRevisionValue(current?.revisionId ?? null)
    setDraft(current?.metadata ?? blank())
    setCreatorText(current ? creators(current.metadata) : '')
    setVerified(current?.verified ?? false)
    setLinked(current?.documentIds ?? [])
    if (!current) setCreating(false)
    setError('')
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
      label: 'source action or attachment',
      dirty: false,
      composing: false,
      busy,
      pendingOperation: mutation.current ?? attachmentPending.current,
      policy: 'operation',
      issue: mutation.current || attachmentPending.current ? error : undefined,
      status: busy ? 'Working…' : message || undefined,
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
  function retryAttachment(): void {
    if (attachmentPending.current) void attach(attachmentPending.current.sourceId, true)
  }
  function retryMutation(): void {
    if (mutation.current) void mutate(mutation.current.change, true)
  }
  return {
    session,
    conversations,
    page,
    creating,
    query,
    setQuery,
    showRemoved,
    setShowRemoved,
    baseRevisionValue,
    attachmentPendingValue,
    mutationValue,
    pendingValue,
    view,
    selected,
    draft,
    creatorText,
    verified,
    setVerified,
    linked,
    setLinked,
    dirty,
    setDirty,
    busy,
    error,
    message,
    exportFormat,
    setExportFormat,
    exportSelection,
    setExportSelection,
    exportLosses,
    mergeTarget,
    setMergeTarget,
    attachmentProgress,
    current,
    locked,
    fieldsLocked,
    panel,
    draftBinding,
    rows,
    change,
    choose,
    save,
    mutate,
    attach,
    selectSource,
    exportLibrary,
    discard,
    saveCopy,
    retryAttachment,
    retryMutation
  }
}
