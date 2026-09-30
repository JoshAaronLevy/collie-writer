import { useEffect, useRef, useState } from 'react'
import type { StorageStatus } from '../../../../shared/storage'
import { projectMessages, type CommitInput, type CreateInput, type LocationStatus, type OpenProject, type ProjectList } from '../../../../shared/projects'
import type { DocumentPayload } from '../../../../domain/editor/schema'

function plainText(payload: DocumentPayload): string | null {
  if (Object.keys(payload.footnotesById).length) return null
  const lines: string[] = []
  for (const paragraph of payload.ast.content) {
    if (paragraph.type !== 'paragraph') return null
    let line = ''
    for (const node of paragraph.content ?? []) {
      if (node.type !== 'text' || node.marks?.length) return null
      line += node.text
    }
    lines.push(line)
  }
  return lines.join('\n')
}
function plainPayload(text: string, previous: DocumentPayload): DocumentPayload {
  return { schemaVersion: 1, ast: { type: 'doc', content: text.split('\n').map((line, index) => ({ type: 'paragraph', attrs: { blockId: previous.ast.content[index]?.attrs.blockId ?? crypto.randomUUID() }, ...(line ? { content: [{ type: 'text' as const, text: line }] } : {}) })) }, footnotesById: {} }
}

export default function Projects({ storage }: { storage: StorageStatus }): React.JSX.Element {
  const [location, setLocation] = useState<LocationStatus | null>(null)
  const [list, setList] = useState<ProjectList>({ projects: [], issues: [] })
  const [project, setProject] = useState<OpenProject | null>(null)
  const [text, setText] = useState('')
  const [protectedText, setProtectedText] = useState('')
  const [busy, setBusy] = useState(false)
  const [committing, setCommitting] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [unsupported, setUnsupported] = useState(false)
  const [retry, setRetry] = useState<CommitInput | null>(null)
  const pendingCreate = useRef<CreateInput | null>(null)
  const textRef = useRef('')
  const composing = useRef(false)
  const alive = useRef(true)
  const dirty = text !== protectedText || retry !== null || committing
  useEffect(() => {
    alive.current = true
    void window.collie.getWorkingLocation().then(result => {
      if (!alive.current) return
      if (result.ok) setLocation(result.value)
      else setError(result.error.message)
    })
    return () => { alive.current = false }
  }, [])
  useEffect(() => { window.collie.setUnprotectedChanges(dirty) }, [dirty])
  useEffect(() => {
    if (storage.state !== 'ready') return
    let active = true
    void window.collie.listProjects().then(result => {
      if (!active) return
      if (result.ok) setList(result.value)
      else setError(result.error.message)
    })
    return () => { active = false }
  }, [storage.state])
  async function refresh(): Promise<void> {
    const result = await window.collie.listProjects()
    if (result.ok) setList(result.value)
    else setError(result.error.message)
  }
  function select(next: OpenProject): void {
    const content = plainText(next.payload)
    setUnsupported(content === null)
    setProject(next); setText(content ?? ''); textRef.current = content ?? ''; setProtectedText(content ?? '')
    setRetry(null); setError(''); setNotice('Unsaved project — recovery on this computer. No file destination selected.')
  }
  async function create(): Promise<void> {
    if (busy || committing || dirty) return
    setBusy(true); setError('')
    pendingCreate.current ??= { operationId: crypto.randomUUID(), template: 'blank' }
    const result = await window.collie.createProject(pendingCreate.current)
    if (result.ok) { pendingCreate.current = null; select(result.value); await refresh() }
    else setError(result.error.message)
    setBusy(false)
  }
  async function open(projectId: string, workspaceId: string): Promise<void> {
    if (busy || committing || dirty) return
    setBusy(true); setError('')
    const result = await window.collie.openProject({ projectId, workspaceId })
    if (result.ok) select(result.value)
    else setError(result.error.message)
    setBusy(false)
  }
  async function protect(): Promise<void> {
    if (!project || committing || composing.current || unsupported) return
    const input: CommitInput = retry ?? { projectId: project.projectId, workspaceId: project.workspaceId, documentId: project.documentId, operationId: crypto.randomUUID(), expectedRevisionId: project.revisionId, payload: plainPayload(textRef.current, project.payload) }
    setCommitting(true); setError(''); setNotice('Protecting edits locally…')
    window.collie.setUnprotectedChanges(true)
    const result = await window.collie.commitDocument(input)
    if (!alive.current) return
    if (result.ok) {
      const committed = plainText(input.payload)!
      setProject(current => current ? { ...current, payload: input.payload, revisionId: result.value.revisionId, headCommitId: result.value.headCommitId } : current)
      setProtectedText(committed); setRetry(null)
      setNotice(textRef.current === committed ? 'Unsaved project — recovery on this computer. No file destination selected.' : 'The submitted draft is protected locally. Newer typing still needs Protect locally.')
      await refresh()
    } else {
      setRetry(input)
      setError(result.error.message)
      setNotice('Local acknowledgment failed. Your current text is still visible; Retry resubmits the same operation.')
    }
    setCommitting(false)
  }
  async function chooseLocation(): Promise<void> {
    setBusy(true)
    const result = await window.collie.chooseWorkingLocation()
    if (result.ok) setLocation(result.value)
    else setError(result.error.message)
    setBusy(false)
  }
  return <section className="projects" aria-labelledby="projects-title">
    <h1 id="projects-title">Your local projects</h1>
    <p>Create a blank project and protect a plain-text draft on this computer. Project-file Save and rich formatting arrive in later stages.</p>
    {!location ? <p role="status">Finding the local working folder…</p> : <details className="working-location" open={location.state === 'required'}>
      <summary>Working-data location</summary>
      <p>{location.message}</p>
      {location.path ? <p className="location-path">{location.path}</p> : <button disabled={busy} onClick={() => void chooseLocation()}>Choose local working folder…</button>}
      <p>Keep this folder outside all sync or mirroring tools. It holds recovery, not portable project files.</p>
    </details>}
    {storage.state === 'unavailable' ? <p role="alert">The storage process is unavailable. Copy any unprotected text before quitting.</p> : null}
    <div className="project-actions">
      <button disabled={busy || dirty || location?.state !== 'ready' || storage.state !== 'ready'} onClick={() => void create()}>{pendingCreate.current ? 'Retry project creation' : 'New blank project'}</button>
      <button disabled={busy || committing || storage.state !== 'ready'} onClick={() => void refresh()}>Refresh project list</button>
    </div>
    {dirty ? <p>Protect or copy the current draft before changing projects. Closing the window asks before discarding unprotected writing.</p> : null}
    <ul className="project-list">{list.projects.map(p => <li key={p.projectId}>
      <button aria-current={project?.projectId === p.projectId ? 'true' : undefined} disabled={busy || dirty || storage.state !== 'ready'} onClick={() => void open(p.projectId, p.workspaceId)}>
        {p.title} <span className="project-id">{p.projectId.slice(0, 8)}</span>
        <small>Local recovery · no file destination · {new Date(p.updatedAt).toLocaleString()}</small>
      </button>
    </li>)}</ul>
    {list.issues.map(issue => <p role="alert" key={issue.projectId}>Project {issue.projectId.slice(0, 8)}: {projectMessages[issue.code]}</p>)}
    {project ? <div className="draft-panel">
      <h2>Draft · {project.projectId.slice(0, 8)}</h2>
      {unsupported ? <p role="alert">This document contains structured content that the basic draft screen cannot edit. It has been retained without conversion.</p> : <>
        <label htmlFor="draft">Writing</label>
        <textarea id="draft" value={text} readOnly={busy} maxLength={2000000} spellCheck={false} onCompositionStart={() => { composing.current = true }} onCompositionEnd={() => { composing.current = false }} onChange={event => { textRef.current = event.target.value; setText(event.target.value); window.collie.setUnprotectedChanges(true); setNotice('Unprotected changes — choose Protect locally.'); }} />
        <div className="project-actions"><button disabled={busy || committing || !dirty || storage.state !== 'ready'} onClick={() => void protect()}>{committing ? 'Protecting…' : retry ? 'Retry local commit' : 'Protect locally'}</button>
        <button onClick={() => { const area = document.getElementById('draft') as HTMLTextAreaElement; area.focus(); area.select(); }}>Select all for copying</button></div>
        <p>To keep an emergency copy, select the draft and use your system Copy command, then paste into another local document.</p>
      </>}
      <p role="status">{notice}</p>
    </div> : <p>Select a project or create a blank one to begin.</p>}
    {error ? <p className="project-error" role="alert">{error}</p> : null}
  </section>
}
