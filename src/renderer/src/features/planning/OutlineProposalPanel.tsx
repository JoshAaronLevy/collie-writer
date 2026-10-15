import { useEffect, useState } from 'react'
import { Checkbox, MultiSelect, NumberInput, Select, Textarea, TextInput } from '@mantine/core'
import { AppDialog } from '../../components/ui/AppDialog'
import { AppButton } from '../../components/ui/Controls'
import { useSynchronousState } from '../../hooks/useSynchronousState'
import { useRetainedDraft } from '../workspace/DraftOwner'
import { useWorkspaceSession } from '../workspace/workspaceContext'
import { useConversations } from '../ai/conversations/conversationState'
import { scopeOf, type OpenProject } from '../../../../shared/projects'
import {
  isOutlineProposal,
  materialKey,
  type OutlineProposal,
  type OutlineProposalView,
  type OutlineProposalRequest,
  type OutlineProposalChange,
  type OutlineProposalVersion,
  type ProposedChapter
} from '../../../../shared/outline-proposals'
import type { MaterialTarget } from '../../../../shared/chapter-material'
import { PlanningPager } from './PlanningCards'
import styles from './OutlineProposalPanel.module.css'

type Edit = { version: OutlineProposalVersion; body: OutlineProposal }
type Pending = Extract<OutlineProposalRequest, { action: 'set' | 'status' }>
export function OutlineProposalPanel({
  project,
  onDiscuss
}: {
  project: OpenProject
  onDiscuss: () => void
}): React.JSX.Element {
  const session = useWorkspaceSession(),
    chat = useConversations(),
    scope = scopeOf(project)
  const requested =
    session.destination.kind === 'workspace' && session.destination.view === 'plan'
      ? session.destination.proposalAttemptId
      : undefined
  const key = requested ? `${requested}:${session.focusRevision}` : ''
  const [loaded, setLoaded] = useState(''),
    [attemptId, setAttemptId] = useState<string | null>(null),
    [opened, setOpened] = useState(false)
  const [view, setView] = useState<OutlineProposalView | null>(null),
    [issue, setIssue] = useState(''),
    [notice, setNotice] = useState(''),
    [offset, setOffset] = useState(0)
  const [edit, setEdit, editRef] = useSynchronousState<Edit | null>(null)
  const [pending, setPending, pendingRef] = useSynchronousState<Pending | null>(null)
  const [busy, setBusy, busyRef] = useSynchronousState(false)
  const dirty = !!edit && JSON.stringify(edit.body) !== JSON.stringify(edit.version.body)
  const unavailable =
    session.accessReadOnly ||
    session.accessTransition ||
    session.acting ||
    session.busy ||
    session.closing ||
    session.navigating ||
    session.fileActive ||
    session.storage.state !== 'ready'
  const locked = unavailable || busy || !!pending
  const { projectId, workspaceId } = scope
  useEffect(() => {
    if (!requested || !key || loaded === key || busyRef.current || pendingRef.current) return
    let active = true
    void window.collie
      .outlineProposal({ projectId, workspaceId, action: 'read', attemptId: requested })
      .then((r) => {
        if (!active) return
        setLoaded(key)
        setAttemptId(requested)
        setOpened(true)
        setOffset(0)
        setNotice('')
        if (!r.ok || r.value.type !== 'view') {
          setIssue(r.ok ? 'The proposal could not be read.' : r.error.message)
          setView(null)
          setEdit(null)
          return
        }
        setView(r.value.view)
        setIssue(r.value.view.issue)
        const latest = r.value.view.versions.at(-1)
        setEdit(latest ? { version: latest, body: structuredClone(latest.body) } : null)
      })
      .catch(() => {
        if (active) {
          setLoaded(key)
          setOpened(true)
          setIssue('The proposal could not be read. Reopen it from the response to try again.')
        }
      })
    return () => {
      active = false
    }
  }, [requested, key, loaded, projectId, workspaceId, busyRef, pendingRef, setEdit])
  async function reread(id: string, versionId?: string): Promise<boolean> {
    const r = await window.collie.outlineProposal({ ...scope, action: 'read', attemptId: id })
    if (!r.ok || r.value.type !== 'view') {
      setIssue(r.ok ? 'The proposal could not refresh.' : r.error.message)
      return false
    }
    setView(r.value.view)
    if (versionId) {
      const version = r.value.view.versions.find((v) => v.id === versionId)
      if (!version) {
        setIssue('The saved proposal version could not be read. Check the change again.')
        return false
      }
      setEdit({ version, body: structuredClone(version.body) })
    }
    return true
  }
  async function acknowledge(request: Pending): Promise<boolean> {
    if (request.change.type === 'save') await session.afterNoteCommit()
    else if (!(await session.adoptOutlineChange())) return false
    if (
      !(await reread(
        request.attemptId,
        request.change.type === 'save' ? request.change.id : undefined
      ))
    )
      return false
    setPending(null)
    setIssue('')
    setNotice(
      request.change.type === 'save'
        ? 'Proposal edits saved.'
        : request.change.type === 'apply'
          ? 'Outline applied. The same chapters are available in Write.'
          : 'Outline change undone. Later writing is kept.'
    )
    return true
  }
  async function reconcile(): Promise<boolean> {
    const request = pendingRef.current
    if (!request) return true
    if (busyRef.current) return false
    setBusy(true)
    try {
      const r = await window.collie.outlineProposal({ ...request, action: 'status' })
      if (!r.ok || r.value.type !== 'change') {
        setIssue(r.ok ? 'The change could not be checked.' : r.error.message)
        return false
      }
      if (!r.value.receipt) {
        setPending(null)
        setIssue('The change was not saved. Your proposal is kept; try the action again.')
        return false
      }
      return await acknowledge(request)
    } catch {
      setIssue('The outcome is still uncertain. Keep this project open and choose Check change.')
      return false
    } finally {
      setBusy(false)
    }
  }
  async function change(change: OutlineProposalChange, flush = true): Promise<boolean> {
    if (
      !attemptId ||
      (flush ? unavailable : session.accessReadOnly || session.accessTransition) ||
      busyRef.current ||
      pendingRef.current ||
      session.composition.current
    )
      return false
    setBusy(true)
    setIssue('')
    setNotice('')
    try {
      const saved = flush
        ? await session.flush(false, 'save', ['outline-proposal'])
        : session.current.current
      if (!saved) return false
      const request: Pending = {
        ...scopeOf(saved),
        action: 'set',
        attemptId,
        operationId: crypto.randomUUID(),
        expectedHead: saved.headCommitId,
        documentId: saved.documentId,
        change
      }
      setPending(request)
      const r = await window.collie.outlineProposal(request)
      if (!r.ok || r.value.type !== 'change') {
        setIssue(
          `${r.ok ? 'The change could not be confirmed.' : r.error.message} Choose Check change.`
        )
        return false
      }
      if (!r.value.receipt) {
        setPending(null)
        setIssue(r.value.issue || 'The change was not saved.')
        return false
      }
      return await acknowledge(request)
    } catch {
      setIssue(
        pendingRef.current
          ? 'The outcome is uncertain. Choose Check change.'
          : 'Current drafts could not be protected.'
      )
      return false
    } finally {
      setBusy(false)
    }
  }
  async function save(flush = true): Promise<boolean> {
    if (pendingRef.current && !(await reconcile())) return false
    const current = editRef.current
    if (!current || JSON.stringify(current.body) === JSON.stringify(current.version.body))
      return true
    if (!isOutlineProposal(current.body)) {
      setIssue(
        'Use nonempty titles, distinct positions within each parent, and at least one chapter. Remove duplicate or conflicting assignments.'
      )
      return false
    }
    return change(
      { type: 'save', id: crypto.randomUUID(), parentId: current.version.id, body: current.body },
      flush
    )
  }
  const draftEvents = useRetainedDraft('outline-proposal', {
    read: () => ({
      scope,
      kind: 'planning',
      entityId: attemptId,
      label: 'Outline proposal',
      dirty:
        !!editRef.current &&
        JSON.stringify(editRef.current.body) !== JSON.stringify(editRef.current.version.body),
      composing: false,
      busy: busyRef.current,
      pendingOperation: pendingRef.current,
      policy: 'flush',
      issue,
      target: {
        kind: 'workspace',
        scope,
        view: 'plan',
        ...(attemptId ? { proposalAttemptId: attemptId } : {})
      }
    }),
    flush: () => save(false),
    focus: () => setOpened(true)
  })
  async function close(): Promise<void> {
    if (!busyRef.current && (await save())) setOpened(false)
  }
  async function discuss(): Promise<void> {
    if (!view || !(await save())) return
    if (chat.refineOutline(view.conversationId, view.scope, editRef.current?.version.id ?? null)) {
      setOpened(false)
      onDiscuss()
    } else setIssue('Finish the active conversation action before continuing discussion.')
  }
  function chapter(index: number, patch: Partial<ProposedChapter>): void {
    const current = editRef.current
    if (!current || locked) return
    setEdit({
      ...current,
      body: {
        ...current.body,
        chapters: current.body.chapters.map((c, i) => (i === index ? { ...c, ...patch } : c))
      }
    })
  }
  const selectedApplication = view?.applications.at(-1)
  const options =
    view?.materials.map((m) => ({
      value: materialKey(m),
      label: `${m.kind} · ${m.title || 'Untitled'}`
    })) ?? []
  return (
    <AppDialog
      opened={
        opened && session.destination.kind === 'workspace' && session.destination.view === 'plan'
      }
      onClose={() => void close()}
      dismissible={!busy && !pending}
      title="Outline proposal"
      size="xl"
    >
      <div className={styles['proposal-panel']} {...draftEvents}>
        {view ? (
          <>
            <p>{view.coverage}</p>
            <p className={styles['proposal-caption']}>
              Only the displayed changes apply. Existing prose and other chapters stay in the
              project.
            </p>
          </>
        ) : null}
        {issue ? <p role="alert">{issue}</p> : null}
        {notice ? <p role="status">{notice}</p> : null}
        {pending ? (
          <AppButton disabled={busy} onClick={() => void reconcile()}>
            Check change
          </AppButton>
        ) : null}
        {edit && view ? (
          <>
            {view.versions.length > 1 ? (
              <Select
                label="Saved proposal version"
                value={edit.version.id}
                disabled={busy || !!pending || dirty}
                data={view.versions.map((v, i) => ({
                  value: v.id,
                  label: `${i === 0 ? 'AI suggestion' : `Edited version ${i}`} · ${new Date(v.createdAt).toLocaleString()}`
                }))}
                onChange={(id) => {
                  const v = view.versions.find((v) => v.id === id)
                  if (v) {
                    setEdit({ version: v, body: structuredClone(v.body) })
                    setOffset(0)
                  }
                }}
              />
            ) : null}
            <ol className={styles['proposal-cards']}>
              {edit.body.chapters.slice(offset, offset + 20).map((ch, localIndex) => {
                const index = offset + localIndex,
                  original = view.documents.find((d) => d.id === ch.documentId)
                const removedOptions = view.links
                  .filter(
                    (l) =>
                      l.documentId === ch.documentId &&
                      view.materials.some((m) => materialKey(m) === materialKey(l))
                  )
                  .map((l) => ({
                    value: materialKey(l),
                    label: options.find((o) => o.value === materialKey(l))?.label ?? 'Material'
                  }))
                const decode = (values: string[]): MaterialTarget[] =>
                  values.map((v) => {
                    const m = view.materials.find((m) => materialKey(m) === v)!
                    return { kind: m.kind, id: m.id }
                  })
                return (
                  <li key={ch.key} className={styles['proposal-card']}>
                    <p className={styles['proposal-caption']}>
                      {original
                        ? `Changes to ${original.title}`
                        : `New ${ch.kind === 'chapter' ? 'chapter' : 'section'}`}
                    </p>
                    <TextInput
                      label="Title"
                      value={ch.title}
                      maxLength={500}
                      disabled={locked}
                      onChange={(e) => chapter(index, { title: e.currentTarget.value })}
                    />
                    <Textarea
                      label="Purpose"
                      value={ch.purpose}
                      maxLength={2000}
                      autosize
                      minRows={2}
                      disabled={locked}
                      onChange={(e) => chapter(index, { purpose: e.currentTarget.value })}
                    />
                    <div className={styles['proposal-placement']}>
                      <Select
                        label="Parent"
                        value={ch.parentId ?? 'root'}
                        data={[
                          { value: 'root', label: 'Top level' },
                          ...view.documents
                            .filter((d) => d.id !== ch.documentId)
                            .map((d) => ({ value: d.id, label: d.title }))
                        ]}
                        disabled={locked}
                        onChange={(id) =>
                          chapter(index, { parentId: !id || id === 'root' ? null : id })
                        }
                      />
                      <NumberInput
                        label="Position in parent"
                        min={1}
                        max={10000}
                        allowDecimal={false}
                        value={ch.position + 1}
                        disabled={locked}
                        onChange={(v) => {
                          if (typeof v === 'number') chapter(index, { position: v - 1 })
                        }}
                      />
                    </div>
                    <MultiSelect
                      label="Add material"
                      searchable
                      limit={30}
                      maxValues={100}
                      data={options}
                      value={ch.add.map(materialKey)}
                      disabled={locked}
                      onChange={(values) => chapter(index, { add: decode(values) })}
                    />
                    {removedOptions.length ? (
                      <MultiSelect
                        label="Remove existing links"
                        description="Unlisted links stay in the chapter."
                        searchable
                        limit={30}
                        data={removedOptions}
                        value={ch.remove.map(materialKey)}
                        disabled={locked}
                        onChange={(values) => chapter(index, { remove: decode(values) })}
                      />
                    ) : null}
                    {ch.gaps.length ? (
                      <details>
                        <summary>Needs development · {ch.gaps.length}</summary>
                        <ul>
                          {ch.gaps.map((g, i) => (
                            <li key={i}>{g}</li>
                          ))}
                        </ul>
                      </details>
                    ) : null}
                    <div className={styles['proposal-actions']}>
                      {[-1, 1].map((direction) => {
                        const candidates = edit.body.chapters
                            .filter((c) => c.parentId === ch.parentId)
                            .sort((a, b) => a.position - b.position),
                          next = candidates[candidates.indexOf(ch) + direction]
                        return (
                          <AppButton
                            key={direction}
                            variant="subtle"
                            disabled={locked || !next}
                            onClick={() =>
                              setEdit({
                                ...edit,
                                body: {
                                  ...edit.body,
                                  chapters: edit.body.chapters.map((c) =>
                                    c.key === ch.key
                                      ? { ...c, position: next.position }
                                      : c.key === next.key
                                        ? { ...c, position: ch.position }
                                        : c
                                  )
                                }
                              })
                            }
                          >
                            {direction < 0 ? 'Move earlier' : 'Move later'}
                          </AppButton>
                        )
                      })}
                      <AppButton
                        variant="subtle"
                        disabled={locked || edit.body.chapters.length === 1}
                        onClick={() =>
                          setEdit({
                            ...edit,
                            body: {
                              ...edit.body,
                              chapters: edit.body.chapters
                                .filter((_, i) => i !== index)
                                .map((c) =>
                                  !ch.documentId &&
                                  c.parentId === ch.parentId &&
                                  c.position > ch.position
                                    ? { ...c, position: c.position - 1 }
                                    : c
                                )
                            }
                          })
                        }
                      >
                        Remove proposed change
                      </AppButton>
                    </div>
                  </li>
                )
              })}
            </ol>
            <PlanningPager
              label="Proposed chapters"
              total={edit.body.chapters.length}
              offset={offset}
              change={setOffset}
            />
            {edit.body.dispositions.length ? (
              <details>
                <summary>Suggested editorial changes · optional</summary>
                <div className={styles['proposal-dispositions']}>
                  {edit.body.dispositions.map((d, index) => (
                    <Checkbox
                      key={materialKey(d)}
                      checked={d.selected}
                      disabled={locked}
                      label={`${d.state === 'aside' ? 'Set aside' : 'Needs development'} · ${view.materials.find((m) => materialKey(m) === materialKey(d))?.title ?? 'Material'}${d.reason ? ` — ${d.reason}` : ''}`}
                      onChange={(e) =>
                        setEdit({
                          ...edit,
                          body: {
                            ...edit.body,
                            dispositions: edit.body.dispositions.map((item, i) =>
                              i === index ? { ...item, selected: e.currentTarget.checked } : item
                            )
                          }
                        })
                      }
                    />
                  ))}
                </div>
              </details>
            ) : null}
            <div className={styles['proposal-actions']}>
              {!selectedApplication ? (
                <AppButton
                  disabled={locked}
                  onClick={() =>
                    void (async () => {
                      if (await save()) {
                        const v = editRef.current?.version
                        if (v) await change({ type: 'apply', versionId: v.id })
                      }
                    })()
                  }
                >
                  {edit.body.chapters.some((c) => c.documentId) ? 'Apply changes' : 'Use outline'}
                </AppButton>
              ) : (
                <p>
                  {selectedApplication.undone
                    ? 'This outline change was undone.'
                    : 'An outline from this response has been applied. Keep discussing to revise the current outline.'}
                </p>
              )}
              {selectedApplication && !selectedApplication.undone ? (
                <AppButton
                  variant="default"
                  disabled={locked || dirty}
                  onClick={() =>
                    void change({ type: 'undo', applicationId: selectedApplication.id })
                  }
                >
                  Undo outline change
                </AppButton>
              ) : null}
              <AppButton variant="default" disabled={locked || !dirty} onClick={() => void save()}>
                Save edits
              </AppButton>
            </div>
          </>
        ) : null}
        <div className={styles['proposal-actions']}>
          <AppButton variant="subtle" disabled={locked || !view} onClick={() => void discuss()}>
            Keep discussing
          </AppButton>
          <AppButton variant="subtle" disabled={busy || !!pending} onClick={() => void close()}>
            Dismiss
          </AppButton>
        </div>
      </div>
    </AppDialog>
  )
}
