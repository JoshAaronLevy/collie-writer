import { usePlanningPage } from '../planning/usePlanningPage'
import type { PlanningItem } from '../../../../shared/planning'
import { useEffect, useState } from 'react'
import { TextInput } from '@mantine/core'
import { AppButton, SelectField } from '../../components/ui/Controls'
import { useSynchronousState } from '../../hooks/useSynchronousState'
import { scopeOf, type OpenInput } from '../../../../shared/projects'
import {
  MATERIAL_PAGE_SIZE,
  type ChapterMaterialChange,
  type ChapterMaterialItem,
  type ChapterMaterialView,
  type MaterialKind
} from '../../../../shared/chapter-material'
import { useConversations } from '../ai/conversations/conversationState'
import { useResearchData } from '../research/researchContext'
import { useRetainedDraft } from './DraftOwner'
import { useWorkspaceSession } from './workspaceContext'
import styles from './ChapterMaterialPanel.module.css'

const labels: Record<MaterialKind, string> = {
  note: 'Note',
  source: 'Source',
  excerpt: 'Excerpt',
  chat: 'Chat'
}

export function ChapterMaterialPanel({ active }: { active: boolean }): React.JSX.Element {
  const session = useWorkspaceSession()
  const research = useResearchData()
  const conversations = useConversations()
  const { project } = session
  const [mode, setMode] = useState<'linked' | 'available'>('linked')
  const [kind, setKind] = useState<MaterialKind | 'all'>('all')
  const [query, setQuery] = useState('')
  const [offset, setOffset] = useState(0)
  const [revision, setRevision] = useState(0)
  const [loaded, setLoaded] = useState<{
    key: string
    value: ChapterMaterialView
    planning: PlanningItem[]
  } | null>(null)
  const [loadError, setLoadError] = useState<{ key: string; message: string } | null>(null)
  const [issue, setIssue] = useState('')
  const [pending, setPending, pendingRef] = useSynchronousState<ChapterMaterialChange | null>(null)
  const [busy, setBusy, busyRef] = useSynchronousState(false)
  const projectId = project?.projectId,
    workspaceId = project?.workspaceId,
    documentId = project?.documentId,
    head = project?.headCommitId
  const selectionKey = `${projectId}:${workspaceId}:${documentId}:${mode}:${kind}:${query}`
  const [lastSelection, setLastSelection] = useState(selectionKey)
  if (lastSelection !== selectionKey) {
    setLastSelection(selectionKey)
    setOffset(0)
    if (!pending) setIssue('')
  }
  const key = `${selectionKey}:${head}:${offset}:${revision}:${active}`
  const view = loaded?.key === key ? loaded.value : null
  const error = loadError?.key === key ? loadError.message : ''
  useEffect(() => {
    if (!active || !projectId || !workspaceId || !documentId) return
    let current = true
    void window.collie
      .readPlanning({
        projectId,
        workspaceId,
        location: mode === 'linked' ? { kind: 'chapter', id: documentId } : { kind: 'pool' },
        filter: 'all',
        kind,
        status: 'all',
        query,
        offset
      })
      .then((result) => {
        if (!current) return
        if (result.ok)
          setLoaded({
            key,
            value: {
              documentId,
              headCommitId: result.value.headCommitId,
              scopes: result.value.scopes,
              items: result.value.items.map((i) => i.material),
              total: result.value.total,
              offset: result.value.offset
            },
            planning: result.value.items
          })
        else setLoadError({ key, message: result.error.message })
      })
      .catch(() => {
        if (current)
          setLoadError({ key, message: 'Chapter material could not be loaded. Try Refresh.' })
      })
    return () => {
      current = false
    }
  }, [active, projectId, workspaceId, documentId, mode, kind, query, offset, key])

  async function refreshSaved(scope: OpenInput): Promise<void> {
    try {
      await session.refreshConversationHead(scopeOf(scope))
      await research.refresh()
    } catch {
      setIssue('The change was checked, but chapter material could not refresh. Choose Refresh.')
    } finally {
      setRevision((n) => n + 1)
    }
  }
  async function reconcile(): Promise<boolean> {
    const request = pendingRef.current
    if (busyRef.current) return false
    if (!request) return true
    setBusy(true)
    try {
      // A close, Save or navigation may read an outcome, but never repeat a mutation.
      const result = await window.collie.changeChapterMaterial({ ...request, action: 'status' })
      if (!result.ok) {
        setIssue(result.error.message)
        return false
      }
      setPending(null)
      setIssue(
        result.value.receipt ? '' : 'The change was not saved. You can try the action again.'
      )
      await refreshSaved(request)
      return true
    } catch {
      setIssue('The change could not be confirmed. Keep this project open and choose Check change.')
      return false
    } finally {
      setBusy(false)
    }
  }
  useRetainedDraft('chapter-material', {
    read: () => ({
      scope: scopeOf(
        pendingRef.current ?? session.current.current ?? { projectId: '', workspaceId: '' }
      ),
      kind: 'chapter-material',
      entityId: pendingRef.current?.documentId ?? documentId ?? null,
      label: 'chapter material',
      dirty: busyRef.current,
      composing: false,
      busy: busyRef.current,
      pendingOperation: pendingRef.current,
      policy: 'flush',
      issue,
      target: {
        kind: 'workspace',
        scope: scopeOf(
          pendingRef.current ?? session.current.current ?? { projectId: '', workspaceId: '' }
        ),
        view: 'write'
      }
    }),
    flush: reconcile,
    focus: () => session.writingView.revealPanel('material')
  })
  const unavailable =
    session.accessReadOnly ||
    session.accessTransition ||
    session.sectionReadOnly ||
    session.busy ||
    session.closing ||
    session.fileActive ||
    session.storage.state !== 'ready'
  async function change(item: ChapterMaterialItem, linked: boolean): Promise<void> {
    if (!project || !view || unavailable || busyRef.current || pendingRef.current) return
    const captured = {
      projectId: project.projectId,
      workspaceId: project.workspaceId,
      documentId: project.documentId
    }
    setBusy(true)
    setIssue('')
    try {
      const saved = await session.flush(false, 'save', ['chapter-material'])
      if (
        !saved ||
        saved.projectId !== captured.projectId ||
        saved.workspaceId !== captured.workspaceId ||
        saved.documentId !== captured.documentId
      )
        return
      const request: ChapterMaterialChange = {
        ...captured,
        action: 'set',
        operationId: crypto.randomUUID(),
        expectedHead: saved.headCommitId,
        target: { kind: item.kind, id: item.id },
        linked
      }
      setPending(request)
      const result = await window.collie.changeChapterMaterial(request)
      if (!result.ok) {
        setIssue(`${result.error.message} Choose Check change before trying again.`)
        return
      }
      if (!result.value.receipt) {
        setIssue('The change could not be confirmed. Choose Check change.')
        return
      }
      setPending(null)
      await refreshSaved(captured)
    } catch {
      setIssue(
        pendingRef.current
          ? 'The change could not be confirmed. Choose Check change.'
          : 'Current edits could not be protected. Resolve them before changing chapter material.'
      )
    } finally {
      setBusy(false)
    }
  }
  function open(item: ChapterMaterialItem): void {
    if (item.kind === 'chat') {
      void conversations
        .openConversation(item.id)
        .then((opened) => {
          if (!opened)
            setIssue(
              'Finish the current chat action or title/memory edit before opening another chat.'
            )
        })
        .catch(() => setIssue('The chat could not be opened. Try again.'))
    } else if (item.kind === 'note') session.research({ kind: 'notes', noteId: item.id })
    else
      session.research({
        kind: 'inspector',
        sourceId: item.sourceId ?? item.id,
        ...(item.kind === 'excerpt' ? { excerptId: item.id } : {})
      })
  }
  const selected = project?.documents.find((d) => d.id === documentId)
  const directLabel =
    selected?.kind === 'text' ? 'section' : selected?.kind === 'part' ? 'part' : 'chapter'
  const related = research.view
    ? [
        ...research.view.questions.map((item) => ({ item, kind: 'question' as const })),
        ...research.view.claims.map((item) => ({ item, kind: 'claim' as const }))
      ].filter(({ item }) => item.documentId === documentId)
    : []
  return (
    <section className={styles['chapter-material']} aria-label="Chapter material">
      <h2>Chapter material</h2>
      <p>{selected?.title || 'Select a chapter or section'}</p>
      <AppButton
        variant={mode === 'available' ? 'default' : 'filled'}
        disabled={busy || !!pending || !project}
        onClick={() => setMode(mode === 'linked' ? 'available' : 'linked')}
      >
        {mode === 'linked' ? 'Add material' : 'Done adding'}
      </AppButton>
      <TextInput
        label="Find material by title"
        maxLength={200}
        value={query}
        onChange={(e) => setQuery(e.currentTarget.value)}
      />
      <SelectField
        label="Material type"
        value={kind}
        onChange={(e) => setKind(e.currentTarget.value as MaterialKind | 'all')}
      >
        <option value="all">All material</option>
        {Object.entries(labels).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </SelectField>
      {issue || error ? <p role="alert">{issue || error}</p> : null}
      {pending ? (
        <AppButton variant="default" disabled={busy} onClick={() => void reconcile()}>
          Check change
        </AppButton>
      ) : null}
      {busy ? <p role="status">Saving chapter material…</p> : null}
      {active && project && !view && !error ? <p role="status">Loading material…</p> : null}
      {view ? (
        <>
          {!view.total ? (
            <p>
              {mode === 'linked'
                ? 'No matching material is linked here. Choose Add material to use something from your project.'
                : 'No matching material. Add notes, sources or chats to your project first.'}
            </p>
          ) : null}
          <ul className={styles['material-list']}>
            {view.items.map((item) => {
              const direct = item.documentIds.includes(view.documentId)
              const inherited = view.scopes.slice(1).filter((s) => item.documentIds.includes(s.id))
              const origin = item.originDocumentId
                ? project?.documents.find((d) => d.id === item.originDocumentId)
                : null
              return (
                <li className={styles['material-item']} key={`${item.kind}:${item.id}`}>
                  <h3>{item.title || `Untitled ${labels[item.kind].toLowerCase()}`}</h3>
                  <p className={styles['material-detail']}>
                    {labels[item.kind]}
                    {item.state !== 'active' ? ` · ${item.state}` : ''}
                    {direct ? ` · This ${directLabel}` : ''}
                  </p>
                  {inherited.length ? (
                    <p className={styles['material-detail']}>
                      Inherited from {inherited.map((s) => s.title).join(' / ')}
                    </p>
                  ) : null}
                  {item.documentIds.length > 1 ? (
                    <p className={styles['material-detail']}>
                      Used in {item.documentIds.length} outline items
                    </p>
                  ) : null}
                  {loaded?.planning.some(
                    (i) =>
                      i.material.id === item.id &&
                      i.material.kind === item.kind &&
                      i.disposition === 'develop'
                  ) ? (
                    <p className={styles['material-detail']}>Needs development</p>
                  ) : null}
                  {item.preview ? (
                    <p className={styles['material-preview']}>{item.preview}</p>
                  ) : null}
                  {origin ? (
                    <p className={styles['material-detail']}>
                      Chat started in {origin.title}
                      {origin.state !== 'active' ? ` (${origin.state})` : ''}
                    </p>
                  ) : null}
                  <div className={styles['material-actions']}>
                    <AppButton
                      variant="subtle"
                      disabled={busy || !!pending}
                      onClick={() => open(item)}
                    >
                      Open original
                    </AppButton>
                    <AppButton
                      variant="subtle"
                      disabled={
                        unavailable || busy || !!pending || (!direct && item.state !== 'active')
                      }
                      onClick={() => void change(item, !direct)}
                    >
                      {direct ? `Remove from ${directLabel}` : `Add to ${directLabel}`}
                    </AppButton>
                  </div>
                  {!direct && inherited.length ? (
                    <p className={styles['material-detail']}>
                      Select the parent in the outline to remove its link.
                    </p>
                  ) : null}
                </li>
              )
            })}
          </ul>
          {view.total > MATERIAL_PAGE_SIZE || offset > 0 ? (
            <div className={styles['material-actions']}>
              <AppButton
                variant="subtle"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - MATERIAL_PAGE_SIZE))}
              >
                Previous
              </AppButton>
              <span>
                {offset + (view.items.length ? 1 : 0)}–{offset + view.items.length} of {view.total}
              </span>
              <AppButton
                variant="subtle"
                disabled={offset + MATERIAL_PAGE_SIZE >= view.total}
                onClick={() => setOffset(offset + MATERIAL_PAGE_SIZE)}
              >
                Next
              </AppButton>
            </div>
          ) : null}
        </>
      ) : null}
      {mode === 'linked' && project ? (
        <AsideChapterMaterial
          key={`${project.projectId}:${project.workspaceId}:${project.documentId}`}
          projectId={project.projectId}
          workspaceId={project.workspaceId}
          documentId={project.documentId}
          active={active}
          revision={`${head}:${revision}`}
          open={open}
        />
      ) : null}
      <AppButton variant="subtle" onClick={() => setRevision((n) => n + 1)}>
        Refresh
      </AppButton>
      <details>
        <summary>Questions &amp; claims for this section ({related.length})</summary>
        <ul className={styles['material-list']}>
          {related.map(({ item, kind }) => (
            <li key={item.id}>
              <AppButton
                className={styles['material-question']}
                variant="subtle"
                onClick={() => session.research({ kind: 'evidence', item: { kind, id: item.id } })}
              >
                {item.text} · {item.state}
              </AppButton>
            </li>
          ))}
        </ul>
        {research.error ? <p role="alert">{research.error}</p> : null}
        <AppButton variant="subtle" onClick={() => session.research({ kind: 'evidence' })}>
          Open questions &amp; claims
        </AppButton>
      </details>
      <AppButton variant="subtle" onClick={() => session.research({ kind: 'notes' })}>
        Open Research
      </AppButton>
    </section>
  )
}

function AsideChapterMaterial({
  projectId,
  workspaceId,
  documentId,
  active,
  revision,
  open
}: {
  projectId: string
  workspaceId: string
  documentId: string
  active: boolean
  revision: string
  open: (item: ChapterMaterialItem) => void
}): React.JSX.Element {
  const [opened, setOpened] = useState(false),
    [offset, setOffset] = useState(0)
  const page = usePlanningPage(
    {
      projectId,
      workspaceId,
      location: { kind: 'chapter', id: documentId },
      filter: 'aside',
      kind: 'all',
      status: 'all',
      query: '',
      offset
    },
    active && opened,
    revision
  )
  return (
    <details onToggle={(event) => setOpened(event.currentTarget.open)}>
      <summary>Set-aside material</summary>
      <p>These originals and links are kept. Restore their availability in Plan.</p>
      {page.loading ? <p role="status">Loading set-aside material…</p> : null}
      {page.issue ? <p role="alert">{page.issue}</p> : null}
      {page.view ? (
        <>
          <ul className={styles['material-list']}>
            {page.view.items.map(({ material }) => (
              <li className={styles['material-item']} key={`${material.kind}:${material.id}`}>
                <h3>{material.title}</h3>
                <p>
                  {material.documentIds.includes(documentId)
                    ? 'Directly linked here'
                    : `Inherited from ${page.view?.scopes
                        .filter((s) => material.documentIds.includes(s.id))
                        .map((s) => s.title)
                        .join(' / ')}`}
                </p>
                <AppButton variant="subtle" onClick={() => open(material)}>
                  Open original
                </AppButton>
              </li>
            ))}
          </ul>
          {!page.view.total ? <p>No set-aside material here.</p> : null}
          <div className={styles['material-actions']}>
            <AppButton
              variant="subtle"
              disabled={!offset}
              onClick={() => setOffset(Math.max(0, offset - MATERIAL_PAGE_SIZE))}
            >
              Previous
            </AppButton>
            <AppButton
              variant="subtle"
              disabled={offset + MATERIAL_PAGE_SIZE >= page.view.total}
              onClick={() => setOffset(offset + MATERIAL_PAGE_SIZE)}
            >
              Next
            </AppButton>
          </div>
        </>
      ) : null}
    </details>
  )
}
