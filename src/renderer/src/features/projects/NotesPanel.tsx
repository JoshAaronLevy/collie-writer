import { useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/core'
import { emptyDocument } from '../../../../domain/projects/templates'
import type { DocumentPayload } from '../../../../domain/editor/schema'
import type { OpenProject } from '../../../../shared/projects'
import type { Annotation, Note, NoteChange, NotesView } from '../../../../shared/notes'
import RichDraft from '../../editor/RichDraft'
import { serializeEditor } from '../../editor/adapter'

export type AnnotationCapture = { documentId: string; expectedRevisionId: string; blockId: string; startOffset: number; endOffset: number; quote: string }
const scope = (p: OpenProject): { projectId: string; workspaceId: string } => ({ projectId:p.projectId,workspaceId:p.workspaceId })
const blank = (): DocumentPayload => emptyDocument(() => crypto.randomUUID())

export default function NotesPanel({ project, capture, onCommitted, navigate, registerFlush, dirtyChanged, disabled }: {
  project: OpenProject; capture: AnnotationCapture | null; onCommitted: () => Promise<void>; navigate: (documentId: string, blockId?: string) => Promise<void>;
  registerFlush: (flush: (() => Promise<boolean>) | null) => void; dirtyChanged: (dirty: boolean) => void; disabled: boolean
}): React.JSX.Element {
  const [view, setView] = useState<NotesView | null>(null), [selected, setSelected] = useState<string | null>(null)
  const [title, setTitle] = useState(''), [links, setLinks] = useState<string[]>([]), [labels, setLabels] = useState<string[]>([])
  const [filter, setFilter] = useState('inbox'), [message, setMessage] = useState(''), [busy, setBusy] = useState(false)
  const [showArchivedAnnotations, setShowArchivedAnnotations] = useState(false)
  const [annotationText, setAnnotationText] = useState(''), [editingAnnotation, setEditingAnnotation] = useState<string | null>(null), [editText, setEditText] = useState('')
  const editor = useRef<Editor | null>(null), dirty = useRef(false), pending = useRef<{ operationId: string; change: NoteChange } | null>(null), task = useRef<Promise<boolean> | null>(null)
  const unresolved = useRef<{ operationId: string; change: NoteChange } | null>(null)
  const latest = useRef({ title,links,labels,selected,view })
  latest.current = { title,links,labels,selected,view }
  const note = view?.notes.find(n => n.id === selected)
  const commentDraft = !!(capture && annotationText.trim()) || !!(editingAnnotation && editText !== view?.annotations.find(a => a.id === editingAnnotation)?.interpretation)
  const setDirty = (value: boolean): void => { dirty.current = value; dirtyChanged(value || commentDraft) }
  useEffect(() => { dirtyChanged(dirty.current || commentDraft) },[commentDraft])
  async function load(): Promise<void> {
    const result = await window.collie.readNotes(scope(project))
    if (result.ok) setView(result.value); else setMessage(result.error.message)
  }
  useEffect(() => { void load() }, [project.projectId])
  function choose(n: Note): void { setSelected(n.id); setTitle(n.title); setLinks(n.documentIds); setLabels(n.labelIds); setDirty(false); pending.current = null; setMessage('') }
  async function change(changeValue: NoteChange, operationId = crypto.randomUUID()): Promise<boolean> {
    if (unresolved.current && unresolved.current.operationId !== operationId) { setMessage('Retry the pending local change before making another change.'); return false }
    setBusy(true)
    const result = await window.collie.changeNote({ ...scope(project),operationId,change:changeValue })
    setBusy(false)
    if (!result.ok) { unresolved.current = result.error.code === 'UNAVAILABLE' ? { operationId,change:changeValue } : null; if (result.error.code !== 'UNAVAILABLE') pending.current = null; setMessage(result.error.message); return false }
    unresolved.current = null
    latest.current.view = result.value
    setView(result.value); setMessage('Protected locally. Save the project file separately if you need an external copy.')
    await onCommitted()
    return true
  }
  async function flush(allowCommentDraft = false): Promise<boolean> {
    if (task.current) return task.current
    const run = async (): Promise<boolean> => {
      if (commentDraft && !allowCommentDraft) { setMessage('Save the annotation draft before switching projects, saving a file or closing.'); return false }
      if (!dirty.current) return true
      const state = latest.current, n = state.view?.notes.find(x => x.id === state.selected)
      if (!n || !editor.current || editor.current.view.composing) { setMessage('Finish composing the note before switching or closing.'); return false }
      let body: DocumentPayload
      try { body = serializeEditor(editor.current,{}) } catch { setMessage('This note cannot be protected yet. Keep this window open and copy its contents.'); return false }
      const changeValue: NoteChange = { type:'updateNote',id:n.id,expectedRevisionId:n.revisionId,title:state.title,body,documentIds:state.links,labelIds:state.labels }
      const operation = pending.current ?? { operationId:crypto.randomUUID(),change:changeValue }
      pending.current = operation
      const ok = await change(operation.change,operation.operationId)
      if (ok) { pending.current = null; setDirty(false) }
      return ok
    }
    const result = run(); task.current = result
    try { return await result } finally { task.current = null }
  }
  useEffect(() => { registerFlush(flush); return () => registerFlush(null) })
  useEffect(() => {
    if (!dirty.current || !note || disabled) return
    const timer = setTimeout(() => { void flush(true) },900)
    return () => clearTimeout(timer)
  },[title,links,labels,note?.id,disabled])
  useEffect(() => {
    const timer = setInterval(() => { if (dirty.current && !disabled) void flush(true) },5000)
    return () => clearInterval(timer)
  },[disabled])
  async function newNote(): Promise<void> {
    if (!await flush()) return
    const id = crypto.randomUUID(), body = blank()
    if (await change({ type:'createNote',id,title:'Untitled note',body })) {
      setSelected(id); setTitle('Untitled note'); setLinks([]); setLabels([]); setFilter('all')
    }
  }
  async function setNoteState(id: string, state: Note['state']): Promise<void> {
    if (!await flush()) return
    const latestNote = latest.current.view?.notes.find(n => n.id === id)
    if (latestNote) await change({ type:'stateNote',id,expectedRevisionId:latestNote.revisionId,state })
  }
  async function retryPending(): Promise<void> {
    if (pending.current) { await flush(); return }
    const operation = unresolved.current
    if (!operation) return
    if (!await change(operation.change,operation.operationId)) return
    if (operation.change.type === 'createNote') {
      const id = operation.change.id
      const created = latest.current.view?.notes.find(n => n.id === id)
      if (created) choose(created)
    }
    if (operation.change.type === 'createAnnotation') setAnnotationText('')
    if (operation.change.type === 'updateAnnotation') { setEditText(''); setEditingAnnotation(null) }
  }
  async function alterLabel(kind: 'tag'|'category'): Promise<void> {
    if (!await flush()) return
    const name = window.prompt(`New ${kind} name`)
    if (name?.trim()) await change({ type:'createLabel',id:crypto.randomUUID(),kind,name:name.trim() })
  }
  async function renameLabel(id: string): Promise<void> {
    if (!await flush()) return
    const label = view?.labels.find(x => x.id === id), name = window.prompt('Rename label',label?.name)
    if (name?.trim()) await change({ type:'renameLabel',id,name:name.trim() })
  }
  async function mergeLabel(id: string): Promise<void> {
    if (!await flush()) return
    const targetId = window.prompt('Paste the ID of the label to keep (shown next to each label)')
    if (targetId) await change({ type:'mergeLabel',id,targetId })
  }
  async function saveAnnotation(): Promise<void> {
    if (!capture || !annotationText.trim() || !await flush(true)) return
    if (await change({ type:'createAnnotation',id:crypto.randomUUID(),...capture,interpretation:annotationText })) setAnnotationText('')
  }
  async function editAnnotation(a: Annotation): Promise<void> {
    if (!await flush(true)) return
    if (await change({ type:'updateAnnotation',id:a.id,expectedRevisionId:a.revisionId,interpretation:editText,state:a.state })) { setEditingAnnotation(null); setEditText('') }
  }
  const visible = view?.notes.filter(n => filter === 'all' ? n.state === 'active' : filter === 'inbox' ? n.state === 'active' && !n.documentIds.length : filter === 'archived' || filter === 'trashed' ? n.state === filter : n.state === 'active' && n.labelIds.includes(filter)) ?? []
  return <section className="notes-panel" aria-label="Notes and annotations">
    <h2>Notes and inbox</h2><p>Notes and comments are human-authored and protected in local recovery. The selected file needs Save or Backup for a separate copy.</p>
    <button type="button" disabled={disabled || busy} onClick={() => { void newNote() }}>Quick capture note</button>
    {unresolved.current ? <button type="button" disabled={disabled || busy} onClick={() => { void retryPending() }}>Retry pending local change</button> : null}
    <label>Show <select value={filter} onChange={event => setFilter(event.target.value)}><option value="inbox">Inbox · unfiled</option><option value="all">All active</option><option value="archived">Archived</option><option value="trashed">Trash</option>{view?.labels.filter(x => x.state === 'active').map(x => <option key={x.id} value={x.id}>{x.kind}: {x.name}</option>)}</select></label>
    <ul>{visible.map(n => <li key={n.id}><button type="button" aria-current={selected === n.id ? 'true' : undefined} onClick={() => { void flush().then(ok => { if (ok) choose(n) }) }}>{n.title || 'Untitled note'} · {new Date(n.updatedAt).toLocaleString()}</button></li>)}</ul>
    {note ? <div><h3>Edit note</h3><label>Title <input value={title} maxLength={500} disabled={disabled} onChange={event => { setTitle(event.target.value); setDirty(true) }} /></label>
      <RichDraft key={`${note.id}-${note.revisionId}`} noteMode payload={note.body} disabled={disabled || busy || !!pending.current} onReady={value => { editor.current = value }} onChange={() => setDirty(true)} onIssue={setMessage} onBlur={() => { void flush(true) }} imageUrl={() => undefined} importImage={() => {}} />
      <fieldset><legend>Linked sections</legend>{project.documents.filter(d => d.kind === 'text').map(d => <label key={d.id}><input type="checkbox" checked={links.includes(d.id)} disabled={disabled} onChange={event => { setLinks(event.target.checked ? [...links,d.id] : links.filter(x => x !== d.id)); setDirty(true) }} />{d.title}</label>)}</fieldset>
      <fieldset><legend>Tags and categories</legend>{view?.labels.filter(x => x.state === 'active').map(l => <label key={l.id}><input type="checkbox" checked={labels.includes(l.id)} disabled={disabled} onChange={event => { setLabels(event.target.checked ? [...labels,l.id] : labels.filter(x => x !== l.id)); setDirty(true) }} />{l.kind}: {l.name}</label>)}</fieldset>
      <button type="button" disabled={disabled || busy} onClick={() => { void flush(true) }}>{pending.current ? 'Retry note commit' : 'Protect note locally'}</button>
      <button type="button" disabled={disabled || busy} onClick={() => { void setNoteState(note.id,note.state === 'active' ? 'trashed' : 'active') }}>{note.state === 'active' ? 'Move note to trash' : 'Restore note'}</button>
      {note.state === 'active' ? <button type="button" disabled={disabled || busy} onClick={() => { void setNoteState(note.id,'archived') }}>Archive note</button> : null}
      {note.documentIds.map(id => <button key={id} type="button" onClick={() => { void flush().then(ok => { if (ok) void navigate(id) }) }}>Go to {project.documents.find(d => d.id === id)?.title ?? 'retained section'}</button>)}
    </div> : null}
    <h3>Manage tags and categories</h3><button type="button" disabled={disabled} onClick={() => { void alterLabel('tag') }}>New tag</button><button type="button" disabled={disabled} onClick={() => { void alterLabel('category') }}>New category</button>
    <ul>{view?.labels.filter(l => l.state === 'active').map(l => <li key={l.id}>{l.kind}: {l.name} <small>{l.id}</small> <button type="button" disabled={disabled} onClick={() => { void renameLabel(l.id) }}>Rename</button><button type="button" disabled={disabled} onClick={() => { void mergeLabel(l.id) }}>Merge into…</button><button type="button" disabled={disabled} onClick={() => { void flush().then(ok => { if (ok) void change({ type:'archiveLabel',id:l.id }) }) }}>Remove label</button></li>)}</ul>
    <h2>Passage annotations</h2>{capture ? <div><blockquote>{capture.quote}</blockquote><label>Interpretation <textarea value={annotationText} maxLength={100000} onChange={event => setAnnotationText(event.target.value)} /></label><button type="button" disabled={disabled || !annotationText.trim()} onClick={() => { void saveAnnotation() }}>Annotate selection</button></div> : <p>Select manuscript text and choose Annotate selection.</p>}
    <label><input type="checkbox" checked={showArchivedAnnotations} onChange={event => setShowArchivedAnnotations(event.target.checked)} />Show archived comments</label>
    <ul>{view?.annotations.filter(a => a.state === 'active' || showArchivedAnnotations).map(a => <li key={a.id}><blockquote>{a.quote}</blockquote><p>{a.interpretation}</p><p>{a.anchorState === 'orphaned' ? 'Original passage removed or changed · quote retained' : 'Linked passage'}</p><button type="button" onClick={() => { void navigate(a.documentId,a.anchorState === 'active' ? a.blockId : undefined) }}>Open section</button><button type="button" onClick={() => { setEditingAnnotation(a.id); setEditText(a.interpretation) }}>Edit interpretation</button><button type="button" onClick={() => { void change({ type:'updateAnnotation',id:a.id,expectedRevisionId:a.revisionId,interpretation:a.interpretation,state:a.state === 'active' ? 'archived' : 'active' }) }}>{a.state === 'active' ? 'Archive comment' : 'Restore comment'}</button>{editingAnnotation === a.id ? <><textarea value={editText} onChange={event => setEditText(event.target.value)} /><button type="button" onClick={() => { void editAnnotation(a) }}>Save interpretation</button></> : null}</li>)}</ul>
    {message ? <p role="status">{message}</p> : null}
  </section>
}
