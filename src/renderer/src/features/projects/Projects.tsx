import type { DataLocations, RenameInput } from '../../../../shared/project-lifecycle'
import { ProjectManagement, RecoveryPanel } from './LifecyclePanel'
import { useEffect, useRef, useState } from 'react'
import type { StorageStatus } from '../../../../shared/storage'
import { projectMessages, type CommitInput, type CreateInput, type LocationStatus, type OpenInput, type OpenProject, type ProjectList, type ProjectResult } from '../../../../shared/projects'
import { fileBusy, sameScope, type FileAction, type FileJobView, type FileStatus, type SaveInput } from '../../../../shared/project-files'
import type { DocumentPayload } from '../../../../domain/editor/schema'
import FilePanel from './FilePanel'

function plainText(payload: DocumentPayload): string | null {
  if (Object.keys(payload.footnotesById).length) return null
  const lines: string[] = []
  for (const paragraph of payload.ast.content) {
    if (paragraph.type !== 'paragraph') return null
    let line = ''
    for (const node of paragraph.content ?? []) { if (node.type !== 'text' || node.marks?.length) return null; line += node.text }
    lines.push(line)
  }
  return lines.join('\n')
}
function plainPayload(text: string, previous: DocumentPayload): DocumentPayload {
  return { schemaVersion: 1, ast: { type: 'doc', content: text.split('\n').map((line, index) => ({ type: 'paragraph', attrs: { blockId: previous.ast.content[index]?.attrs.blockId ?? crypto.randomUUID() }, ...(line ? { content: [{ type: 'text' as const, text: line }] } : {}) })) }, footnotesById: {} }
}
function scopeOf(project: OpenInput): OpenInput { return { projectId: project.projectId, workspaceId: project.workspaceId } }
const emptyFiles: FileStatus = { scope: null, destination: null, state: 'unsaved', job: null }

export default function Projects({ storage }: { storage: StorageStatus }): React.JSX.Element {
  const [location, setLocation] = useState<LocationStatus | null>(null)
  const [list, setList] = useState<ProjectList>({ projects: [], issues: [] })
  const [project, setProject] = useState<OpenProject | null>(null)
  const [text, setText] = useState(''), [protectedText, setProtectedText] = useState('')
  const [busy, setBusy] = useState(false), [acting, setActing] = useState(false), [closing, setClosing] = useState(false)
  const [committing, setCommitting] = useState(false), [retry, setRetry] = useState<CommitInput | null>(null)
  const [error, setError] = useState(''), [notice, setNotice] = useState('')
  const [files, setFiles] = useState<FileStatus>(emptyFiles)
  const [data, setData] = useState<DataLocations | null>(null), [showArchived, setShowArchived] = useState(false)
  const renamePending = useRef<RenameInput | null>(null)
  const [unsupported, setUnsupported] = useState(false)
  const current = useRef<OpenProject | null>(null), buffer = useRef(''), protectedBuffer = useRef('')
  const retryCommit = useRef<CommitInput | null>(null), committingTask = useRef<Promise<OpenProject | null> | null>(null)
  const pendingCreate = useRef<CreateInput | null>(null), pendingSave = useRef<SaveInput | null>(null)
  const actionTask = useRef<Promise<unknown> | null>(null), closingRef = useRef(false), composing = useRef(false)
  const fileState = useRef<FileStatus>(emptyFiles), alive = useRef(true), area = useRef<HTMLTextAreaElement>(null)
  const jobWaiters = useRef(new Map<string, Set<(job: FileJobView | null) => void>>())
  const finishedJobs = useRef(new Map<string, FileJobView>())
  const handlers = useRef<{ action: (action: FileAction) => Promise<void>; save: () => void }>({ action: async () => {}, save: () => {} })
  const dirty = text !== protectedText || retry !== null || committing
  const fileActive = fileBusy(files.job)
  function updateProject(next: OpenProject | null): void { current.current = next; setProject(next) }
  function applyFiles(next: FileStatus): void {
    fileState.current = next; setFiles(next)
    if (next.job?.kind === 'backup' && next.job.capturedHead && ['archive','staging','replacing','verifying'].includes(next.job.phase)) setBusy(false)
    if (current.current && sameScope(scopeOf(current.current), next.scope)) updateProject({ ...current.current, destination: next.destination })
    if (next.job && !fileBusy(next.job)) {
      finishedJobs.current.set(next.job.id, next.job)
      if (finishedJobs.current.size > 64) finishedJobs.current.delete(finishedJobs.current.keys().next().value!)
      for (const resolve of jobWaiters.current.get(next.job.id) ?? []) resolve(next.job)
      jobWaiters.current.delete(next.job.id)
    }
  }
  function isDirty(): boolean { return buffer.current !== protectedBuffer.current || !!retryCommit.current || !!committingTask.current }
  useEffect(() => {
    alive.current = true
    void window.collie.getWorkingLocation().then(result => { if (alive.current) { if (result.ok) setLocation(result.value); else setError(result.error.message) } })
    const offFiles = window.collie.onFileStatus(applyFiles)
    const offActions = window.collie.onFileAction(action => { void handlers.current.action(action).catch(() => { setError('The action could not finish. Keep this window open and copy any unprotected writing.') }) })
    return () => { alive.current = false; offFiles(); offActions(); for (const group of jobWaiters.current.values()) for (const resolve of group) resolve(null); jobWaiters.current.clear() }
  }, [])
  useEffect(() => { window.collie.setUnprotectedChanges(dirty) }, [dirty])
  useEffect(() => {
    if (storage.state === 'ready') { void refreshData(); return }
    if (storage.state === 'unavailable') { for (const group of jobWaiters.current.values()) for (const resolve of group) resolve(null); jobWaiters.current.clear() }
  }, [storage.state])
  useEffect(() => {
    if (!project?.destination || fileActive || acting || closing || storage.state !== 'ready' || ['external-change','unavailable','interrupted','checking'].includes(files.state)) return
    if (!dirty && project.headCommitId === project.destination.headCommitId) return
    const timer = setTimeout(() => handlers.current.save(), 30000)
    return () => clearTimeout(timer)
  }, [text, project?.headCommitId, project?.destination?.headCommitId, files.state, dirty, fileActive, acting, closing, storage.state])
  async function refresh(): Promise<void> {
    const result = await window.collie.listProjects()
    if (!alive.current) return
    if (result.ok) setList(result.value); else setError(result.error.message)
  }
  async function refreshData(): Promise<void> {
    const result = await window.collie.getDataLocations()
    if (!alive.current) return
    if (result.ok) { setData(result.value); setList(result.value.projects) } else { setError(result.error.message); await refresh() }
  }
  async function refreshFiles(): Promise<void> {
    const result = await window.collie.getProjectFileStatus(current.current ? scopeOf(current.current) : null)
    if (result.ok) applyFiles(result.value); else setError(result.error.message)
  }
  async function select(next: OpenProject): Promise<void> {
    const content = plainText(next.payload)
    updateProject(next); setUnsupported(content === null)
    buffer.current = content ?? ''; protectedBuffer.current = content ?? ''
    setText(buffer.current); setProtectedText(protectedBuffer.current)
    retryCommit.current = null; setRetry(null); pendingSave.current = null
    window.collie.setUnprotectedChanges(false); setError(''); setNotice('Draft protected locally.')
    await refreshFiles()
  }
  async function protectText(value: string, prior?: CommitInput): Promise<OpenProject | null> {
    const p = current.current
    if (!p) return null
    const input = prior ?? { ...scopeOf(p), documentId: p.documentId, operationId: crypto.randomUUID(), expectedRevisionId: p.revisionId, payload: plainPayload(value, p.payload) }
    setCommitting(true); setError(''); setNotice('Protecting edits locally…'); window.collie.setUnprotectedChanges(true)
    const result = await window.collie.commitDocument(input)
    if (!alive.current) return null
    if (result.ok) {
      const next = { ...current.current!, payload: input.payload, revisionId: result.value.revisionId, headCommitId: result.value.headCommitId }
      updateProject(next); protectedBuffer.current = plainText(input.payload)!
      if (sameScope(scopeOf(next), fileState.current.scope) && ['saved','pending'].includes(fileState.current.state)) applyFiles({ ...fileState.current, state: next.headCommitId === fileState.current.destination?.headCommitId ? 'saved' : 'pending' })
      setProtectedText(protectedBuffer.current); retryCommit.current = null; setRetry(null)
      setNotice(buffer.current === protectedBuffer.current ? 'Draft protected locally.' : 'The submitted draft is protected locally. Newer typing still needs protection.')
      setCommitting(false); return next
    }
    retryCommit.current = input; setRetry(input); setError(result.error.message)
    setNotice('Local acknowledgment failed. Your current text is still visible; Retry keeps the same operation.')
    setCommitting(false); return null
  }
  async function flush(): Promise<OpenProject | null> {
    if (composing.current) { setError('Finish composing the current text before saving or closing.'); return null }
    if (unsupported) return current.current
    const requested = buffer.current
    const previous = committingTask.current
    const task = (previous ?? Promise.resolve(current.current)).then(async result => {
      if (previous && !result) return null
      if (retryCommit.current && !await protectText(requested, retryCommit.current)) return null
      return requested !== protectedBuffer.current ? protectText(requested) : current.current
    })
    committingTask.current = task
    try { return await task } finally { if (committingTask.current === task) committingTask.current = null; window.collie.setUnprotectedChanges(isDirty()) }
  }
  function waitJob(id: string): Promise<FileJobView | null> {
    const finished = finishedJobs.current.get(id)
    if (finished) return Promise.resolve(finished)
    const job = fileState.current.job
    if (job?.id === id && !fileBusy(job)) return Promise.resolve(job)
    return new Promise(resolve => { const group = jobWaiters.current.get(id) ?? new Set(); group.add(resolve); jobWaiters.current.set(id, group) })
  }
  async function finishJob(result: ProjectResult<FileStatus>, id: string): Promise<FileJobView | null> {
    if (result.ok) applyFiles(result.value)
    else { setError(result.error.message); if (fileState.current.job?.id !== id) return null }
    const job = await waitJob(id)
    if (job?.error) setError(projectMessages[job.error])
    return job
  }
  function run(work: () => Promise<unknown>): void {
    if (actionTask.current || closingRef.current) return
    setActing(true)
    const task = work().catch(() => { setError('The operation could not finish. Keep this window open; your current writing is still here.') }).finally(() => { actionTask.current = null; setActing(false); setBusy(false) })
    actionTask.current = task
  }
  async function waitActive(): Promise<boolean> {
    const job = fileState.current.job
    if (!fileBusy(job) || !job) return true
    return !!await waitJob(job.id)
  }
  async function save(as: boolean, automatic = false): Promise<boolean> {
    if (!await waitActive()) return false
    setBusy(true)
    const p = await flush()
    if (!p) { setBusy(false); return false }
    await refreshFiles()
    if (!await waitActive()) { setBusy(false); return false }
    let token: string | null = null
    const destination = fileState.current.destination
    if (automatic && (!destination || ['external-change','unavailable','interrupted'].includes(fileState.current.state))) { setBusy(false); return false }
    if ((as || !destination) && !(pendingSave.current && !as)) {
      const choice = await window.collie.pickProjectFile({ purpose: 'save', scope: scopeOf(p) })
      if (!choice.ok || !choice.value) { if (!choice.ok) setError(choice.error.message); setBusy(false); return false }
      token = choice.value.token
    }
    const retrying = !!pendingSave.current && !as
    const input: SaveInput = retrying ? pendingSave.current! : { scope: scopeOf(p), operationId: crypto.randomUUID(), minimumHead: p.headCommitId, expectedGeneration: destination?.generationId ?? null, token }
    pendingSave.current = input; setBusy(false); setError('')
    const result = await window.collie.saveProjectFile(input)
    const job = await finishJob(result, input.operationId)
    if (job || !result.ok && result.error.code !== 'UNAVAILABLE') pendingSave.current = null
    if (job?.state === 'completed') {
      // Reconcile the old request before capturing any newer edits submitted with this explicit Save.
      if (retrying && fileState.current.destination?.headCommitId !== p.headCommitId) return save(false, automatic)
      await refresh(); return true
    }
    return false
  }
  async function openLocal(scope: OpenInput): Promise<void> {
    const result = await window.collie.openProject(scope)
    if (result.ok) await select(result.value); else setError(result.error.message)
  }
  async function openFile(inspect = false, locate = false): Promise<void> {
    if (!await waitActive()) return
    setBusy(true)
    if (current.current && !await flush()) return
    const p = current.current, operationId = crypto.randomUUID()
    let result: ProjectResult<FileStatus>
    if (inspect && p) result = await window.collie.inspectProjectFile({ scope: scopeOf(p), operationId })
    else {
      const choice = await window.collie.pickProjectFile({ purpose: locate ? 'locate' : 'open', scope: locate && p ? scopeOf(p) : null })
      if (!choice.ok || !choice.value) { if (!choice.ok) setError(choice.error.message); return }
      result = locate && p ? await window.collie.locateProjectFile({ scope: scopeOf(p), operationId, token: choice.value.token }) : await window.collie.openProjectFile({ operationId, token: choice.value.token })
    }
    const job = await finishJob(result, operationId)
    if (job?.state === 'completed' && job.opened) await openLocal(job.opened)
    await refresh()
  }
  async function lifecycleFile(kind: 'backup' | 'move' | 'duplicate' | 'restore' | 'recover', artifactId?: string): Promise<void> {
    if (!await waitActive()) return
    setBusy(true)
    const p = current.current ? await flush() : null
    if (current.current && !p) return
    const operationId = crypto.randomUUID()
    let result: ProjectResult<FileStatus>
    if (kind === 'recover' && artifactId) result = await window.collie.recoverProjectVersion({ operationId, artifactId })
    else if (kind === 'restore') {
      const selection = await window.collie.pickProjectFile({ purpose: 'restore', scope: null })
      if (!selection.ok || !selection.value) { if (!selection.ok) setError(selection.error.message); return }
      result = await window.collie.restoreProject({ operationId, token: selection.value.token })
    } else if (p && kind === 'duplicate') result = await window.collie.duplicateProject({ operationId, scope: scopeOf(p), expectedHead: p.headCommitId })
    else if (p && (kind === 'backup' || kind === 'move')) {
      await refreshFiles(); if (!await waitActive()) return
      const selection = await window.collie.pickProjectFile({ purpose: kind, scope: scopeOf(p) })
      if (!selection.ok || !selection.value) { if (!selection.ok) setError(selection.error.message); return }
      const input: SaveInput = { operationId, scope: scopeOf(p), minimumHead: p.headCommitId, expectedGeneration: fileState.current.destination?.generationId ?? null, token: selection.value.token }
      result = kind === 'backup' ? await window.collie.backupProject(input) : await window.collie.moveProject(input)
    } else return
    const job = await finishJob(result, operationId)
    if (job?.state === 'completed') {
      if (job.opened) await openLocal(job.opened)
      setNotice(kind === 'backup' ? `Backup written and reopened at revision ${job.capturedHead?.slice(0, 8) ?? ''}. The save location is unchanged; later typing may still need protection.` : kind === 'move' ? 'New location written and reopened. The old file is retained.' : 'Independent project opened. The original work is retained.')
    }
    if (!await waitActive()) return
    await refreshData()
  }
  async function manage(title?: string): Promise<void> {
    if (!await waitActive()) return
    setBusy(true)
    const p = await flush()
    if (!p) return
    if (renamePending.current && !sameScope(renamePending.current.scope, scopeOf(p))) { setError('Reopen the project with the pending rename before retrying it.'); return }
    if (title !== undefined) {
      renamePending.current ??= { scope: scopeOf(p), operationId: crypto.randomUUID(), expectedHead: p.headCommitId, title }
      const result = await window.collie.renameProject(renamePending.current)
      if (result.ok) { renamePending.current = null; await select(result.value) }
      else { if (result.error.code !== 'UNAVAILABLE') renamePending.current = null; setError(result.error.message); return }
    } else {
      const result = await window.collie.archiveProject({ scope: scopeOf(p), archived: !p.archived })
      if (result.ok) { updateProject(result.value); setNotice(result.value.archived ? 'Archived locally. Enable Show archived projects to find it again.' : 'Project returned to the active list.') }
      else { setError(result.error.message); return }
    }
    await waitActive(); await refreshData()
  }
  async function resetLocal(review: string): Promise<void> {
    if (!await waitActive()) return
    setBusy(true)
    const wasDirty = isDirty()
    if (current.current && !await flush()) return
    if (wasDirty) { await refreshData(); setError('Writing was protected. Review the updated project list before confirming reset again.'); return }
    const result = await window.collie.resetLocalWork({ review, confirmation: 'RESET LOCAL WORK' })
    if (!result.ok) {
      setError(result.error.message)
      // A lost response is not proof that reset rolled back. Keep the buffer visible for copying.
      if (result.error.code === 'UNAVAILABLE') setNotice('Reset outcome is unknown. Refresh recovery before opening or creating another project. Your visible writing remains available for copying.')
      return
    }
    updateProject(null); buffer.current = ''; protectedBuffer.current = ''; setText(''); setProtectedText(''); setUnsupported(false)
    retryCommit.current = null; setRetry(null); pendingSave.current = null; pendingCreate.current = null; renamePending.current = null
    applyFiles(emptyFiles); window.collie.setUnprotectedChanges(false)
    setData(result.value); setList(result.value.projects); setNotice('Local list reset. Recover the retained projects in Reset recovery.')
  }
  async function handleAction(action: FileAction): Promise<void> {
    if (action.kind === 'close-cancelled') { closingRef.current = false; setClosing(false); return }
    if (action.kind === 'resume') { await refreshFiles(); return }
    if (action.kind === 'suspend') { if (!closingRef.current) await flush(); return }
    if (action.kind !== 'close') {
      if (action.kind === 'save' && actionTask.current && fileState.current.job?.kind === 'save' && !closingRef.current) {
        const pending = actionTask.current
        const requested = await flush()
        if (!requested) return
        await pending
        if (current.current && sameScope(scopeOf(requested), scopeOf(current.current))) run(() => save(false))
        return
      }
      if (action.kind === 'open') run(() => openFile())
      else run(() => save(action.kind === 'save-as'))
      return
    }
    if (closingRef.current) { window.collie.finishClose(action.id, 'cancel'); return }
    closingRef.current = true; setClosing(true)
    let outcome: 'saved' | 'local' | 'failed' | 'cancel' = 'failed'
    try {
      await actionTask.current
      if (!await waitActive()) return
      if (!current.current) { outcome = 'saved'; return }
      if (!await flush()) return
      await refreshFiles(); if (!await waitActive()) return
      if (current.current.destination && (fileState.current.state !== 'saved' || current.current.headCommitId !== fileState.current.destination?.headCommitId)) {
        const succeeded = await save(false)
        outcome = succeeded && !isDirty() ? 'saved' : !isDirty() ? 'local' : 'failed'
      } else outcome = current.current.destination ? 'saved' : 'local'
    } finally {
      // Keep typing locked until main either closes the window or explicitly releases this handshake.
      setBusy(false)
      window.collie.setUnprotectedChanges(isDirty()); window.collie.finishClose(action.id, outcome)
    }
  }
  handlers.current = { action: handleAction, save: () => run(() => save(false, true)) }
  const available = storage.state === 'ready' && location?.state === 'ready'
  return <section className="projects" aria-labelledby="projects-title">
    <h1 id="projects-title">Your projects</h1>
    <p>Write locally and choose a separate save location for each project.</p>
    {!location ? <p role="status">Finding the local working folder…</p> : <details className="working-location" open={location.state === 'required'}>
      <summary>Working-data location</summary><p>{location.message}</p>
      {location.path ? <p className="location-path">{location.path}</p> : <button disabled={acting} onClick={() => run(async () => { const result = await window.collie.chooseWorkingLocation(); if (result.ok) setLocation(result.value); else setError(result.error.message) })}>Choose local working folder…</button>}
      <p>Keep this folder outside sync or mirroring tools. Portable files can go in your chosen local cloud folders.</p>
    </details>}
    {storage.state === 'unavailable' ? <p role="alert">The storage process is unavailable. Keep this window open and copy any unprotected text before quitting.</p> : null}
    <div className="project-actions">
      <button disabled={!available || acting || fileActive || closing} onClick={() => run(async () => {
        setBusy(true); if (current.current && !await flush()) return
        pendingCreate.current ??= { operationId: crypto.randomUUID(), template: 'blank' }
        const result = await window.collie.createProject(pendingCreate.current)
        if (result.ok) { pendingCreate.current = null; await select(result.value); await refresh() } else setError(result.error.message)
      })}>{pendingCreate.current ? 'Retry project creation' : 'New blank project'}</button>
      <button disabled={!available || acting || fileActive || closing} onClick={() => run(() => openFile())}>Open project file…</button>
      <button disabled={!available || acting || fileActive || closing} onClick={() => run(() => lifecycleFile('restore'))}>Restore backup…</button>
      <button disabled={!available || acting || fileActive || closing} onClick={() => run(refreshData)}>Refresh projects</button>
    </div>
    <h2>Recent and recovered local projects</h2>
    <p>Each entry shows its last local commit. Open it to check the selected file and reconcile an interrupted save.</p>
    <label><input type="checkbox" checked={showArchived} onChange={event => setShowArchived(event.target.checked)} /> Show archived projects</label>
    <ul className="project-list">{list.projects.filter(p => showArchived || !p.archived).map(p => <li key={p.projectId}>
      <button aria-current={project?.projectId === p.projectId ? 'true' : undefined} disabled={!available || acting || fileActive || closing} onClick={() => run(async () => { setBusy(true); if (current.current && !await flush()) return; await openLocal(scopeOf(p)) })}>
        {p.title}{p.archived ? ' · archived' : ''} <span className="project-id">{p.projectId.slice(0, 8)}</span>
        <small>{p.destination ? `${p.destination.path} · availability checked on open${p.headCommitId !== p.destination.headCommitId ? ' · newer edits protected locally' : ''}` : 'Local recovery · no file destination'} · {new Date(p.updatedAt).toLocaleString()}</small>
      </button>
    </li>)}</ul>
    {list.issues.map(issue => <p role="alert" key={issue.projectId}>Project {issue.projectId.slice(0, 8)}: {projectMessages[issue.code]}</p>)}
    {project ? <div className="draft-panel">
      <h2>{project.title} · {project.projectId.slice(0, 8)}</h2>
      {unsupported ? <p role="alert">This document contains structured content that the basic draft screen cannot edit. It has been retained without conversion.</p> : <>
        <label htmlFor="draft">Writing</label>
        <textarea ref={area} id="draft" value={text} readOnly={busy || closing} maxLength={2000000} spellCheck={false} onCompositionStart={() => { composing.current = true }} onCompositionEnd={() => { composing.current = false }} onChange={event => { buffer.current = event.target.value; setText(buffer.current); window.collie.setUnprotectedChanges(true); setNotice('New typing is not yet protected. Use Protect locally or Save.'); }} />
        <div className="project-actions"><button disabled={busy || committing || closing || !dirty || storage.state !== 'ready'} onClick={() => { void flush().then(() => refresh()) }}>{committing ? 'Protecting…' : retry ? 'Retry local commit' : 'Protect locally'}</button>
        <button onClick={() => { area.current?.focus(); area.current?.select() }}>Select all for copying</button></div>
        <p>For an emergency copy, select the draft and use your system Copy command, then paste into another local document.</p>
      </>}
      <p role="status">{notice}</p>
    </div> : <p>Select a local project, open a file or create a blank project to begin.</p>}
    {project || fileActive ? <FilePanel status={files} dirty={dirty} disabled={!project || !available || acting || closing} save={as => run(() => save(as))} locate={() => run(() => openFile(false, true))} inspect={() => run(() => openFile(true))} answer={(id, choice) => { void window.collie.answerFileJob({ id, choice }).then(result => { if (!result.ok) setError(result.error.message) }) }} cancel={id => { void window.collie.cancelFileJob(id).then(result => { if (!result.ok) setError(result.error.message) }) }} consent={id => { void window.collie.confirmFileOverwrite(id).then(result => { if (!result.ok) setError(result.error.message) }) }} /> : null}
    {project ? <ProjectManagement key={`${project.projectId}-${project.title}`} project={project} disabled={!available || acting || fileActive || closing} rename={title => run(() => manage(title))} archive={() => run(() => manage())} backup={() => run(() => lifecycleFile('backup'))} move={() => run(() => lifecycleFile('move'))} duplicate={() => run(() => lifecycleFile('duplicate'))} /> : null}
    <RecoveryPanel data={data} openProject={scope => run(async () => { setBusy(true); if (current.current && !await flush()) return; await openLocal(scope); await waitActive(); await refreshData() })} disabled={!available || acting || fileActive || closing} refresh={() => run(refreshData)} inspect={id => run(() => lifecycleFile('recover', id))} reset={review => run(() => resetLocal(review))} recoverReset={id => run(async () => {
      setBusy(true); if (current.current && !await flush()) return
      const result = await window.collie.recoverReset(id)
      if (result.ok) { setData(result.value); setList(result.value.projects) } else setError(result.error.message)
    })} cleanup={() => run(async () => {
      const result = await window.collie.clearPickerHistory()
      if (result.ok) { setData(result.value); setList(result.value.projects); setNotice('Picker history cleared. All work and retained recovery were kept.') } else setError(result.error.message)
    })} />
    {closing ? <p role="status">Protecting writing and finishing file work before closing…</p> : null}
    {error ? <p className="project-error" role="alert">{error}</p> : null}
  </section>
}
