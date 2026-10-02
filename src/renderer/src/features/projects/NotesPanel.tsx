import { Checkbox, TextInput, Textarea } from '@mantine/core'
import { AppButton, SelectField } from '../../components/ui/Controls'
import { AppDialog } from '../../components/ui/AppDialog'
import { ResearchHeader, ResearchLayout } from '../research/ResearchLayout'
import { EmptyState } from '../../components/ui/Feedback'
import { useWorkspaceSession } from '../workspace/WorkspaceSession'
import { useResearchData } from '../research/ResearchData'
import './NotesPanel.css'
import { useRetainedDraft, useDraftRegistry } from '../workspace/DraftOwner'
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

export default function NotesPanel({ project, capture, focusNoteId, focusAnnotationId, onCommitted, navigate, disabled }: {
  project: OpenProject; capture: AnnotationCapture | null; focusNoteId: string | null; focusAnnotationId: string | null; onCommitted: () => Promise<void>; navigate: (documentId: string, blockId?: string) => Promise<void>;
  disabled: boolean
}): React.JSX.Element {
  const session=useWorkspaceSession(), researchData=useResearchData()
  const [tab,setTab]=useState<'notes'|'annotations'|'labels'>('notes'),[query,setQuery]=useState(''),[annotationId,setAnnotationId]=useState<string|null>(null)
  const [labelDialog,setLabelDialog]=useState<{kind:'tag'|'category';action:'create'|'rename'|'merge';id?:string}|null>(null),[labelName,setLabelName]=useState(''),[labelTarget,setLabelTarget]=useState('')
  const annotationFocus=useRef(''),readSequence=useRef(0),annotationBase=useRef<Annotation|null>(null)
  const [noteEpoch,setNoteEpoch]=useState(0)
  const labelComposing=useRef(false), baseRevision=useRef<string|null>(null)
  const registry = useDraftRegistry()
  const panel = useRef<HTMLElement>(null), focusedRequest = useRef<string | null>(null)
  const [view, setView] = useState<NotesView | null>(null), [selected, setSelected] = useState<string | null>(null)
  const [title, setTitle] = useState(''), [links, setLinks] = useState<string[]>([]), [labels, setLabels] = useState<string[]>([])
  const [filter, setFilter] = useState('inbox'), [message, setMessage] = useState(''), [busy, setBusy] = useState(false)
  const [showArchivedAnnotations, setShowArchivedAnnotations] = useState(false)
  const [annotationText, setAnnotationText] = useState(''), [editingAnnotation, setEditingAnnotation] = useState<string | null>(null), [editText, setEditText] = useState('')
  const editor = useRef<Editor | null>(null), dirty = useRef(false), pending = useRef<{ operationId: string; change: NoteChange } | null>(null), task = useRef<Promise<boolean> | null>(null)
  const unresolved = useRef<{ operationId: string; change: NoteChange } | null>(null)
  const accessAnnotation=useRef<{operationId:string;change:NoteChange}|null>(null)
  const accessInterpretation=useRef<{operationId:string;change:NoteChange}|null>(null)
  const latest = useRef({ title,links,labels,selected,view })
  latest.current = { title,links,labels,selected,view }
  const note = view?.notes.find(n => n.id === selected)
  const commentDraft = !!(capture && annotationText) || !!(editingAnnotation && editText !== annotationBase.current?.interpretation)
  const setDirty = (value: boolean): void => { dirty.current = value; registry.changed() }
  useEffect(() => {let live=true;const request=++readSequence.current;void window.collie.readNotes(scope(project)).then(result=>{if(live&&request===readSequence.current){if(result.ok){latest.current.view=result.value;setView(result.value)}else setMessage(result.error.message)}}).catch(()=>{if(live)setMessage('Notes could not be loaded. Reopen this project to retry; existing drafts are retained.')});return()=>{live=false}},[project.projectId,project.workspaceId,project.headCommitId])
  useEffect(()=>{if(capture){setTab('annotations');setAnnotationId(null)}},[capture])
  function choose(n: Note): void { if(session.composition.current)return;if(n.id===selected&&n.revisionId!==baseRevision.current)setNoteEpoch(value=>value+1);baseRevision.current=n.revisionId;setTab('notes');setSelected(n.id); setTitle(n.title); setLinks(n.documentIds); setLabels(n.labelIds); setDirty(false); pending.current = null; setMessage('') }
  useEffect(() => {
    if (!focusNoteId) { focusedRequest.current = null; return }
    if (!view || dirty.current || focusedRequest.current === `${focusNoteId}:${session.focusRevision}`) return
    const target = view.notes.find(n => n.id === focusNoteId)
    if (target) { focusedRequest.current = `${focusNoteId}:${session.focusRevision}`; setFilter(target.state === 'active' ? 'all' : target.state);setQuery(''); choose(target) }
    else setMessage('The requested note is no longer available.')
  }, [focusNoteId, session.focusRevision, view?.notes])

  async function change(changeValue: NoteChange, operationId = crypto.randomUUID()): Promise<boolean> {
    if (unresolved.current && unresolved.current.operationId !== operationId) { setMessage('Retry the pending local change before making another change.'); return false }
    setBusy(true)
    unresolved.current = { operationId, change: changeValue }
    try {
      const result = await window.collie.changeNote({ ...scope(project),operationId,change:changeValue })
      if (!result.ok) { unresolved.current = result.error.code === 'UNAVAILABLE' ? { operationId,change:changeValue } : null; if (result.error.code !== 'UNAVAILABLE') pending.current = null; setMessage(result.error.message); return false }
      unresolved.current = null
      if(changeValue.type==='updateNote'&&changeValue.id===latest.current.selected)baseRevision.current=result.value.notes.find(item=>item.id===changeValue.id)?.revisionId??baseRevision.current
      readSequence.current++;latest.current.view = result.value
      setView(result.value); setMessage('Protected locally. Save the project file separately if you need an external copy.')
      await onCommitted()
      return true
    } catch { setMessage(unresolved.current?'The local change has an unknown outcome. Retry the same change; your draft is retained.':'Change protected locally, but the workspace could not refresh. Reopen Research.'); return !unresolved.current }
    finally { setBusy(false); registry.changed() }
  }

  async function flush(allowCommentDraft = false): Promise<boolean> {
    if (task.current) return task.current
    const run = async (): Promise<boolean> => {
      if(session.composition.current){setMessage('Finish composing before saving or changing notes.');return false}
      if (commentDraft && !allowCommentDraft) { setMessage('Save the annotation draft before switching projects, saving a file or closing.'); return false }
      if (unresolved.current && unresolved.current.operationId !== pending.current?.operationId) { setMessage('Reconcile the pending note or annotation change before continuing.'); return false }
      if (!dirty.current) return true
      const state = latest.current, n = state.view?.notes.find(x => x.id === state.selected)
      if (!n || !editor.current || editor.current.view.composing) { setMessage('Finish composing the note before switching or closing.'); return false }
      let body: DocumentPayload
      try { body = serializeEditor(editor.current,{}) } catch { setMessage('This note cannot be protected yet. Keep this window open and copy its contents.'); return false }
      const changeValue: NoteChange = { type:'updateNote',id:n.id,expectedRevisionId:baseRevision.current??n.revisionId,title:state.title,body,documentIds:state.links,labelIds:state.labels }
      const operation = pending.current ?? { operationId:crypto.randomUUID(),change:changeValue }
      pending.current = operation
      const ok = await change(operation.change,operation.operationId)
      if (ok) { pending.current = null; setDirty(false) }
      return ok
    }
    const result = run(); task.current = result
    try { return await result } finally { task.current = null }
  }
  async function protectAccessDrafts():Promise<boolean>{
    if(!await flush(true))return false
    if(capture&&annotationText.trim()){
      accessAnnotation.current??={operationId:crypto.randomUUID(),change:{type:'createAnnotation',id:crypto.randomUUID(),...capture,interpretation:annotationText}}
      if(!await change(accessAnnotation.current.change,accessAnnotation.current.operationId))return false
      accessAnnotation.current=null;setAnnotationText('')
    }
    if(editingAnnotation){
      const annotation=annotationBase.current
      if(annotation&&editText!==annotation.interpretation){
        accessInterpretation.current??={operationId:crypto.randomUUID(),change:{type:'updateAnnotation',id:annotation.id,expectedRevisionId:annotation.revisionId,interpretation:editText,state:annotation.state}}
        if(!await change(accessInterpretation.current.change,accessInterpretation.current.operationId))return false
        accessInterpretation.current=null;setEditingAnnotation(null);setEditText('')
      }
    }
    registry.changed();return true
  }
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
      const created=latest.current.view?.notes.find(item=>item.id===id);if(created)choose(created);setFilter('all')
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
    if (operation.change.type === 'createAnnotation') {setAnnotationText('');setAnnotationId(operation.change.id)}
    if (['createLabel','renameLabel','mergeLabel'].includes(operation.change.type))setLabelDialog(null)
    if (operation.change.type === 'updateAnnotation') { setEditText(''); setEditingAnnotation(null) }
  }
  async function applyLabel():Promise<void>{
    if(!labelDialog||labelComposing.current||unresolved.current||!await flush())return
    const action=labelDialog.action
    const input:NoteChange=action==='create'?{type:'createLabel',id:crypto.randomUUID(),kind:labelDialog.kind,name:labelName.trim()}
      :action==='rename'?{type:'renameLabel',id:labelDialog.id!,name:labelName.trim()}
      :{type:'mergeLabel',id:labelDialog.id!,targetId:labelTarget}
    if(await change(input))setLabelDialog(null)
  }
  async function saveAnnotation(): Promise<void> {
    if (!capture || !annotationText.trim() || !await flush(true)) return
    const id=crypto.randomUUID()
    if (await change({ type:'createAnnotation',id,...capture,interpretation:annotationText })) {setAnnotationText('');setAnnotationId(id)}
  }
  async function editAnnotation(a: Annotation): Promise<void> {
    if (!await flush(true)) return
    if (await change({ type:'updateAnnotation',id:a.id,expectedRevisionId:annotationBase.current?.revisionId??a.revisionId,interpretation:editText,state:annotationBase.current?.state??a.state })) { setEditingAnnotation(null); setEditText('') }
  }
  const visible = view?.notes.filter(n => filter === 'all' ? n.state === 'active' : filter === 'inbox' ? n.state === 'active' && !n.documentIds.length : filter === 'archived' || filter === 'trashed' ? n.state === filter : n.state === 'active' && n.labelIds.includes(filter)).filter(n=>n.title.toLocaleLowerCase().includes(query.toLocaleLowerCase())) ?? []
  const draftBinding = useRetainedDraft('notes', {
    read: () => ({ scope: scope(project), kind: 'note-and-annotation', entityId: selected, label: 'notes and annotations',
      dirty: dirty.current || commentDraft, composing: !!editor.current?.view.composing, busy,
      pendingOperation: pending.current ?? unresolved.current ?? accessAnnotation.current ?? accessInterpretation.current,
      policy: 'flush', explicitSave: commentDraft, issue: message,
      target: {kind:'workspace',scope:scope(project),view:'research',target:{kind:'notes',noteId:tab==='notes'?selected??undefined:undefined,annotationId:tab==='annotations'?annotationId??undefined:undefined}} }),
    flush: mode => mode === 'access' ? protectAccessDrafts() : flush(),
    focus: () => panel.current?.focus()
  })
  useRetainedDraft('note-label-form',{
    read:()=>({scope:scope(project),kind:'label-form',entityId:labelDialog?.id??null,label:'tag or category form',dirty:labelDialog!==null,composing:labelComposing.current,busy:false,pendingOperation:null,policy:'explicit',target:{kind:'workspace',scope:scope(project),view:'research',target:{kind:'notes'}}})
  })
  useEffect(()=>{
    if(!focusAnnotationId){annotationFocus.current='';return}
    const key=`${focusAnnotationId}:${session.focusRevision}`
    if(!view||commentDraft||annotationFocus.current===key)return
    annotationFocus.current=key
    const found=view.annotations.find(item=>item.id===focusAnnotationId)
    if(found){setAnnotationId(found.id);setTab('annotations');if(found.state==='archived')setShowArchivedAnnotations(true)}else setMessage('The requested annotation is missing; no different comment was selected.')
  },[focusAnnotationId,session.focusRevision,view?.annotations])
  const annotation=view?.annotations.find(item=>item.id===annotationId)
  const relatedItems=researchData.view?[...researchData.view.questions.map(item=>({...item,kind:'question' as const})),...researchData.view.claims.map(item=>({...item,kind:'claim' as const}))].filter(item=>item.noteId===note?.id):[]
  return <section ref={panel} tabIndex={-1} {...draftBinding} className="notes-panel" aria-label="Notes and annotations">
    <ResearchHeader title="Notes and annotations">Capture your thoughts and keep passage comments separate from original quotes.</ResearchHeader>
    {message?<p role="status">{message}</p>:null}
    <div className="research-actions" role="group" aria-label="Note views">{(['notes','annotations','labels'] as const).map(value=><AppButton key={value} variant={tab===value?'default':'subtle'} aria-pressed={tab===value} onClick={()=>{if(!session.composition.current)setTab(value)}}>{value==='notes'?'Notes and inbox':value==='annotations'?'Passage annotations':'Tags and categories'}</AppButton>)}{unresolved.current?<AppButton disabled={disabled||busy} onClick={()=>{void retryPending()}}>Retry pending local change</AppButton>:null}</div>
    <div hidden={tab!=='notes'} inert={tab!=='notes'}>
    <ResearchLayout sidebar={<>
      <AppButton disabled={disabled||busy} onClick={()=>{void newNote()}}>Capture a note</AppButton>
      <TextInput label="Find a note" type="search" value={query} onChange={event=>setQuery(event.currentTarget.value)}/>
      <SelectField label="Show notes" value={filter} onChange={event=>setFilter(event.target.value)}><option value="inbox">Inbox · unfiled</option><option value="all">All active</option><option value="archived">Archived</option><option value="trashed">Trash</option>{view?.labels.filter(item=>item.state==='active').map(item=><option key={item.id} value={item.id}>{item.kind}: {item.name}</option>)}</SelectField>
      {!visible.length?<p>{query?'No notes match this search.':'No notes in this view. Capture a thought or choose another view.'}</p>:null}
      <ul className="research-item-list">{visible.map(item=><li key={item.id}><AppButton variant="subtle" className="research-item-button" classNames={{label:'research-item-label',inner:'research-item-inner'}} disabled={busy} aria-current={selected===item.id?'true':undefined} onClick={()=>{void flush().then(ok=>{if(ok){const saved=latest.current.view?.notes.find(row=>row.id===item.id);if(saved)choose(saved)}})}}>{item.title||'Untitled note'}<small>{item.state} · {new Date(item.updatedAt).toLocaleDateString()}</small></AppButton></li>)}</ul>
    </>}>
      {note?<>
        <p className="research-state">{note.state} · Human-authored note{baseRevision.current!==note.revisionId?' · Stored revision changed; the current editor is retained.':''}</p>
        <TextInput label="Note title" value={title} maxLength={500} disabled={disabled||busy||!!pending.current} onChange={event=>{setTitle(event.currentTarget.value);setDirty(true)}}/>
        <RichDraft key={`${note.id}:${noteEpoch}`} noteMode payload={note.body} disabled={disabled||busy||!!pending.current} onReady={value=>{editor.current=value}} onChange={()=>setDirty(true)} onIssue={setMessage} onBlur={()=>{void flush(true)}} imageUrl={()=>undefined} importImage={()=>{}}/>
        <div className="research-actions"><AppButton disabled={disabled||busy} onClick={()=>{void flush(true)}}>{pending.current?'Retry note save':'Save note'}</AppButton><AppButton variant="subtle" disabled={disabled||busy} onClick={()=>{void setNoteState(note.id,note.state==='active'?'trashed':'active')}}>{note.state==='active'?'Move to trash':'Restore note'}</AppButton>{note.state==='active'?<AppButton variant="subtle" disabled={disabled||busy} onClick={()=>{void setNoteState(note.id,'archived')}}>Archive note</AppButton>:null}</div>
        <details className="research-disclosure"><summary>Sections, tags and categories</summary><fieldset disabled={disabled||busy||!!pending.current}><legend>Linked sections</legend><div className="research-checklist">{project.documents.filter(item=>item.kind==='text').map(item=><Checkbox key={item.id} label={`${item.title} · ${item.state}`} checked={links.includes(item.id)} onChange={event=>{setLinks(event.currentTarget.checked?[...links,item.id]:links.filter(id=>id!==item.id));setDirty(true)}}/>)}</div></fieldset><fieldset disabled={disabled||busy||!!pending.current}><legend>Tags and categories</legend><div className="research-checklist">{view?.labels.filter(item=>item.state==='active').map(item=><Checkbox key={item.id} label={`${item.kind}: ${item.name}`} checked={labels.includes(item.id)} onChange={event=>{setLabels(event.currentTarget.checked?[...labels,item.id]:labels.filter(id=>id!==item.id));setDirty(true)}}/>)}</div></fieldset></details>
        {baseRevision.current!==note.revisionId?<AppButton variant="default" disabled={busy||!!unresolved.current||!!pending.current} onClick={()=>choose(note)}>Discard note edits and reload saved note</AppButton>:null}
        <h3>Connected context</h3>{note.documentIds.map(id=><AppButton key={id} variant="subtle" onClick={()=>{void navigate(id)}}>Open {project.documents.find(item=>item.id===id)?.title??'missing section'}</AppButton>)}
        {relatedItems.map(item=><AppButton key={item.id} variant="subtle" onClick={()=>session.research({kind:'evidence',item:{kind:item.kind,id:item.id}})}>{item.kind}: {item.text} · {item.state}</AppButton>)}
        {!note.documentIds.length&&!relatedItems.length?<p>No section, question or claim links yet.</p>:null}
      </>:<EmptyState title="Choose or capture a note">Keep unfiled thoughts in the inbox, then link them to sections when useful.</EmptyState>}
    </ResearchLayout></div>
    <div hidden={tab!=='annotations'} inert={tab!=='annotations'}>
    <ResearchLayout sidebar={<>
      <Checkbox label="Show archived comments" checked={showArchivedAnnotations} onChange={event=>setShowArchivedAnnotations(event.currentTarget.checked)}/>
      <AppButton variant="default" disabled={commentDraft} onClick={()=>setAnnotationId(null)}>New selected-passage comment</AppButton>
      <ul className="research-item-list">{view?.annotations.filter(item=>item.state==='active'||showArchivedAnnotations).map(item=><li key={item.id}><AppButton variant="subtle" className="research-item-button" classNames={{label:'research-item-label',inner:'research-item-inner'}} aria-current={annotationId===item.id?'true':undefined} disabled={commentDraft||busy} onClick={()=>setAnnotationId(item.id)}>{item.quote.slice(0,100)}<small>{item.state} · {item.anchorState==='orphaned'?'Passage changed; quote retained':'Linked passage'}</small></AppButton></li>)}</ul>
    </>}>
      {annotation?<><h2>Passage comment</h2><blockquote className="research-quote">{annotation.quote}</blockquote><p className="note-interpretation">{annotation.interpretation}</p><p>{annotation.anchorState==='orphaned'?'The original passage changed or was removed. This quote remains unchanged.':'Linked to the original passage.'} · {annotation.state}</p>
        <div className="research-actions"><AppButton variant="default" onClick={()=>{void navigate(annotation.documentId,annotation.anchorState==='active'?annotation.blockId:undefined)}}>{annotation.anchorState==='active'?'Open passage':'Open section; passage is orphaned'}</AppButton><AppButton variant="subtle" disabled={disabled||busy||!!pending.current||commentDraft} onClick={()=>{annotationBase.current=annotation;setEditingAnnotation(annotation.id);setEditText(annotation.interpretation)}}>Edit interpretation</AppButton><AppButton variant="subtle" disabled={disabled||busy||!!pending.current||commentDraft} onClick={()=>{void change({type:'updateAnnotation',id:annotation.id,expectedRevisionId:annotation.revisionId,interpretation:annotation.interpretation,state:annotation.state==='active'?'archived':'active'})}}>{annotation.state==='active'?'Archive comment':'Restore comment'}</AppButton></div>
        {editingAnnotation===annotation.id?<div className="research-form"><Textarea label="Your interpretation" disabled={disabled||busy||!!pending.current} value={editText} maxLength={100000} onChange={event=>setEditText(event.currentTarget.value)}/><div className="research-actions"><AppButton disabled={disabled||busy||!!pending.current} onClick={()=>{void editAnnotation(annotation)}}>Save interpretation</AppButton><AppButton variant="default" disabled={busy||!!unresolved.current} onClick={()=>{setEditingAnnotation(null);setEditText('')}}>Cancel interpretation changes</AppButton></div></div>:null}
      </>:capture?<div className="research-form"><h2>Comment on selected passage</h2><blockquote className="research-quote">{capture.quote}</blockquote><Textarea label="Your interpretation" disabled={disabled||busy||!!pending.current} value={annotationText} maxLength={100000} onChange={event=>setAnnotationText(event.currentTarget.value)}/><div className="research-actions"><AppButton disabled={disabled||busy||!annotationText.trim()} onClick={()=>{void saveAnnotation()}}>Save passage annotation</AppButton><AppButton variant="default" disabled={busy||!!unresolved.current} onClick={()=>setAnnotationText('')}>Clear annotation draft</AppButton></div></div>:<EmptyState title="Comment on a passage">Select text in the manuscript and choose Annotate selection. Saved quotes remain separate from your interpretation.</EmptyState>}
    </ResearchLayout></div>
    <div hidden={tab!=='labels'} inert={tab!=='labels'}><h2>Tags and categories</h2><div className="research-actions">{(['tag','category'] as const).map(kind=><AppButton key={kind} disabled={disabled||busy} onClick={()=>{setLabelDialog({kind,action:'create'});setLabelName('');setLabelTarget('')}}>New {kind}</AppButton>)}</div>
      <ul className="note-label-list">{view?.labels.filter(item=>item.state==='active').map(item=><li key={item.id}><strong>{item.name}</strong> · {item.kind}<div className="research-actions"><AppButton variant="subtle" disabled={disabled||busy} onClick={()=>{setLabelDialog({kind:item.kind,action:'rename',id:item.id});setLabelName(item.name)}}>Rename</AppButton><AppButton variant="subtle" disabled={disabled||busy} onClick={()=>{setLabelDialog({kind:item.kind,action:'merge',id:item.id});setLabelTarget('')}}>Merge into…</AppButton><AppButton variant="subtle" disabled={disabled||busy||!!pending.current} onClick={()=>{void flush().then(ok=>{if(ok)void change({type:'archiveLabel',id:item.id})})}}>Remove label</AppButton></div></li>)}</ul>
    </div>
    <AppDialog opened={labelDialog!==null} title={labelDialog?.action==='merge'?'Merge labels':labelDialog?.action==='rename'?'Rename label':'Create label'} onClose={()=>{if(!busy&&!unresolved.current&&!labelComposing.current)setLabelDialog(null)}} dismissible={!busy&&!unresolved.current}>
      <form className="note-label-form" onCompositionStartCapture={()=>{labelComposing.current=true;registry.changed()}} onCompositionEndCapture={()=>{labelComposing.current=false;registry.changed()}} onSubmit={event=>{event.preventDefault();void applyLabel()}}>
        {labelDialog?.action==='merge'?<SelectField label="Label to keep" required value={labelTarget} disabled={!!unresolved.current} onChange={event=>setLabelTarget(event.target.value)}><option value="">Choose by name</option>{view?.labels.filter(item=>item.state==='active'&&item.kind===labelDialog.kind&&item.id!==labelDialog.id).map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</SelectField>:<TextInput label="Label name" required maxLength={100} value={labelName} disabled={!!unresolved.current} onChange={event=>setLabelName(event.currentTarget.value)} data-autofocus/>}
        {message?<p role="status">{message}</p>:null}{unresolved.current?<AppButton disabled={disabled||busy} onClick={()=>void retryPending()}>Retry pending label change</AppButton>:null}<div className="research-actions"><AppButton type="submit" disabled={disabled||busy||!!unresolved.current}>Apply label change</AppButton><AppButton variant="default" disabled={busy||!!unresolved.current} onClick={()=>{if(!labelComposing.current)setLabelDialog(null)}}>Cancel</AppButton></div>
      </form>
    </AppDialog>
  </section>
}
