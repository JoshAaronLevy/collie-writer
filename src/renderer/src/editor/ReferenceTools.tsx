import { useEffect, useRef, useState } from 'react'
import { TextInput } from '@mantine/core'
import { AppButton, SelectField } from '../components/ui/Controls'
import { AppDialog } from '../components/ui/AppDialog'
import { captureSelection, restoreSelection, type CapturedSelection } from './selection'
import { useEditorFormDraft } from './useEditorFormDraft'
import './ReferenceTools.css'
import type { Editor } from '@tiptap/core'
import type { Transaction } from '@tiptap/pm/state'
import type { Node as PMNode } from '@tiptap/pm/model'
import { closeHistory } from '@tiptap/pm/history'
import type { CitationItem, DocumentPayload } from '../../../domain/editor/schema'
import type { SourceRecord } from '../../../shared/sources'
import { bindFootnoteEditor, editorIsComposing, createManuscriptEditor, documentFromEditorJson, refreshCitationLabels } from './adapter'

export type ReferenceContext = { focusAnchor?: string | null; projectId: string; sources: SourceRecord[]; labels: ReadonlyMap<string,string> }
function findAnchor(editor: Editor, id: string): { node: PMNode; pos: number } | null {
  let found: {node: PMNode; pos: number} | null = null
  editor.state.doc.descendants((node,pos) => { if (node.attrs.citationId === id || node.attrs.footnoteId === id) found={node,pos} })
  return found
}
function inCell(editor: Editor): boolean {
  const { $from,$to } = editor.state.selection
  return [$from,$to].some(edge => { for (let i=edge.depth;i>0;i--) if (['tableCell','tableHeader'].includes(edge.node(i).type.name)) return true; return false })
}
function apply(editor: Editor, transaction: Transaction, issue: (message: string) => void): boolean {
  if (!editor.isEditable || editorIsComposing(editor)) { issue('Finish composing text before changing a citation or footnote.'); return false }
  try { documentFromEditorJson(transaction.doc.toJSON()); editor.view.dispatch(closeHistory(transaction)); return true }
  catch { issue('This reference could not be changed safely. The existing writing has been kept.'); return false }
}

function CitationForm({ initial, context, save, cancel }: { initial: CitationItem[]; context: ReferenceContext; save: (items:CitationItem[])=>void; cancel:()=>void }): React.JSX.Element {
  const [items,setItems] = useState<CitationItem[]>(structuredClone(initial))
  const [query,setQuery] = useState('')
  const choices = context.sources.filter(s => s.state === 'active' && `${s.metadata.title} ${s.metadata.author.map(a=>a.literal || a.family).join(' ')}`.toLowerCase().includes(query.toLowerCase())).slice(0,100)
  const change = (index:number,patch:Partial<CitationItem>):void => setItems(items.map((item,i)=>i===index?{...item,...patch}:item))
  return <form className="citation-form" onSubmit={event=>{event.preventDefault();save(items.map(item=>Object.fromEntries(Object.entries(item).filter(([,value])=>value!=='')) as CitationItem))}}>
    <TextInput label="Find source" value={query} onChange={event=>setQuery(event.currentTarget.value)} data-autofocus />
    <SelectField label="Add source" value="" onChange={event=>{if(event.target.value&&items.length<100)setItems([...items,{sourceId:event.target.value,label:'page'}])}}><option value="">Choose a source…</option>{choices.map(s=><option key={s.id} value={s.id}>{s.metadata.title}</option>)}</SelectField>
    {!choices.length?<p>Add or restore a source in Research → Sources, or change your search.</p>:null}
    <ol className="citation-item-list">{items.map((item,index)=>{const source=context.sources.find(s=>s.id===item.sourceId);return <li key={index}>
      <strong>{source?.metadata.title ?? 'Missing source'}{source?.state!=='active'?' — choose a replacement':''}</strong>
      <SelectField label="Source" value={item.sourceId} onChange={event=>change(index,{sourceId:event.target.value})}><option value={item.sourceId}>{source?.metadata.title ?? 'Missing source'}</option>{choices.filter(s=>s.id!==item.sourceId).map(s=><option key={s.id} value={s.id}>{s.metadata.title}</option>)}</SelectField>
      <SelectField label="Locator type" value={item.label??'page'} onChange={event=>change(index,{label:event.target.value as CitationItem['label']})}>{(['page','chapter','section','paragraph','volume'] as const).map(label=><option key={label}>{label}</option>)}</SelectField>
      <TextInput label="Locator value" maxLength={2000} value={item.locator??''} onChange={event=>change(index,{locator:event.currentTarget.value})}/>
      <TextInput label="Prefix" maxLength={2000} value={item.prefix??''} onChange={event=>change(index,{prefix:event.currentTarget.value})}/>
      <TextInput label="Suffix" maxLength={2000} value={item.suffix??''} onChange={event=>change(index,{suffix:event.currentTarget.value})}/>
      <div className="reference-actions"><AppButton variant="subtle" disabled={index===0} onClick={()=>{const next=[...items];[next[index-1],next[index]]=[next[index],next[index-1]];setItems(next)}}>Move up</AppButton><AppButton variant="subtle" onClick={()=>setItems(items.filter((_,i)=>i!==index))}>Remove item</AppButton></div>
    </li>})}</ol>
    <div className="reference-actions"><AppButton type="submit" disabled={!items.length || items.some(i=>!context.sources.some(s=>s.id===i.sourceId&&s.state==='active'))}>Apply citation</AppButton><AppButton variant="default" onClick={cancel}>Cancel</AppButton></div>
  </form>
}

function CitationControls({editor,context,disabled,issue}:{editor:Editor;context:ReferenceContext;disabled:boolean;issue:(message:string)=>void}):React.JSX.Element {
  const [draft,setDraft]=useState<{id:string|null;items:CitationItem[]}|null>(null)
  const savedSelection=useRef<CapturedSelection|null>(null)
  const formDraft=useEditorFormDraft('Citation details',draft!==null)
  const [formIssue,setFormIssue]=useState('')
  function openDraft(value:{id:string|null;items:CitationItem[]}):void {
    const saved=captureSelection(editor)
    if(!saved){issue('Finish composing text before opening citation details.');return}
    savedSelection.current=saved;setFormIssue('');setDraft(value)
  }
  function cancel():void {if(formDraft.canClose()){restoreSelection(savedSelection.current,editor);setDraft(null)}}
  const [,render]=useState(0)
  useEffect(()=>{const update=():void=>render(n=>n+1);editor.on('selectionUpdate',update);editor.on('update',update);return()=>{editor.off('selectionUpdate',update);editor.off('update',update)}},[editor])
  const selected=(editor.state.selection as {node?:PMNode}).node
  const selectedId=selected?.type.name==='citation'?String(selected.attrs.citationId):null
  return <div className="citation-controls">
    <AppButton variant="subtle" type="button" disabled={disabled} onMouseDown={e=>e.preventDefault()} onClick={()=>{if(inCell(editor)){issue('Citations belong in prose or footnotes, not plain-text table cells.');return}openDraft({id:null,items:[]})}}>Insert citation…</AppButton>
    <AppButton variant="subtle" type="button" disabled={disabled||!selectedId} onClick={()=>{if(selectedId&&selected)openDraft({id:selectedId,items:selected.attrs.items})}}>Edit selected citation…</AppButton>
    <AppDialog opened={draft!==null} title={draft?.id?'Edit citation':'Insert citation'} onClose={cancel} returnFocus={false} onExited={()=>{if(!editor.isDestroyed)editor.commands.focus()}}><div className="citation-dialog" {...formDraft.events}>{formIssue?<p role="alert">{formIssue}</p>:null}{draft?<fieldset disabled={disabled}><CitationForm key={draft.id??'new'} initial={draft.items} context={context} cancel={cancel} save={items=>{
      if(!formDraft.canClose())return
      if(!restoreSelection(savedSelection.current,editor)){setFormIssue('The writing changed. Cancel and select the current passage again.');return}
      if(inCell(editor)){issue('Citations cannot be inserted into table cells.');return}
      const old=draft.id?findAnchor(editor,draft.id):null
      if(draft.id&&!old){issue('This citation was removed. Close this form and select the current writing.');return}
      const node=editor.state.schema.nodes.citation.create({citationId:draft.id??crypto.randomUUID(),items})
      const tr=old?editor.state.tr.replaceWith(old.pos,old.pos+old.node.nodeSize,node):editor.state.tr.replaceSelectionWith(node,false)
      if(apply(editor,tr,issue)){setDraft(null);editor.commands.focus()}else setFormIssue('The citation could not be applied safely. Your existing writing and this form have been kept.')
    }}/></fieldset>:null}</div></AppDialog>
  </div>
}

function FootnoteBody({owner,id,context,disabled,issue,close}:{owner:Editor;id:string;context:ReferenceContext;disabled:boolean;issue:(message:string)=>void;close:()=>void}):React.JSX.Element {
  const host=useRef<HTMLDivElement>(null), editor=useRef<Editor|null>(null), live=useRef({context,disabled})
  live.current={context,disabled}
  const [,render]=useState(0)
  useEffect(()=>{
    const anchor=findAnchor(owner,id)
    if(!host.current||!anchor)return
    let syncing=false
    const instance=createManuscriptEditor({element:host.current,projectId:context.projectId,footnoteMode:true,payload:{schemaVersion:1,ast:anchor.node.attrs.body,footnotesById:{}},imageUrl:()=>undefined,citationLabel:key=>live.current.context.labels.get(key)??'[citation]',onIssue:issue,onChange:()=>{
      if(syncing)return
      const current=findAnchor(owner,id)
      if(!current||!owner.isEditable)return
      try {
        const body=documentFromEditorJson(instance.getJSON()).ast
        // Body updates enter the manuscript's normal history and autosave transaction.
        const tr=owner.state.tr.setNodeMarkup(current.pos,undefined,{...current.node.attrs,body})
        documentFromEditorJson(tr.doc.toJSON());owner.view.dispatch(tr)
      }catch{issue('This footnote cannot be protected yet. Keep its text visible for copying.')}
    }})
    editor.current=instance;bindFootnoteEditor(owner,instance);instance.setEditable(!live.current.disabled);render(n=>n+1)
    const sync=():void=>{
      const current=findAnchor(owner,id)
      if(!current){close();return}
      if(JSON.stringify(instance.getJSON())!==JSON.stringify(current.node.attrs.body)) {
        syncing=true;instance.commands.setContent(current.node.attrs.body,{emitUpdate:false});syncing=false
      }
      refreshCitationLabels(instance,live.current.context.labels)
    }
    owner.on('update',sync)
    const focus=live.current.context.focusAnchor
    const citation=focus?findAnchor(instance,focus):null
    if(citation)instance.commands.setNodeSelection(citation.pos)
    instance.commands.focus()
    return()=>{owner.off('update',sync);bindFootnoteEditor(owner,null);editor.current=null;instance.destroy()}
  },[owner,id])
  useEffect(()=>{if(editor.current){editor.current.setEditable(!disabled);refreshCitationLabels(editor.current,context.labels)}},[disabled,context.labels])
  return <section className="footnote-editor" aria-label="Author footnote" onKeyDown={event=>{if(event.key==='Escape'&&!editor.current?.view.composing){event.preventDefault();close()}}}>
    <h4>Author footnote {context.labels.get(id)??'— numbering pending'}</h4>
    <p>Paragraphs and citations are saved with this section. Press Escape to return to the reference.</p>
    <div className="reference-actions" role="group" aria-label="Footnote formatting">{(['bold','italic','underline','strike'] as const).map(mark=><AppButton variant="subtle" type="button" key={mark} disabled={disabled} onMouseDown={e=>e.preventDefault()} onClick={()=>editor.current?.chain().focus().toggleMark(mark).run()}>{mark}</AppButton>)}<AppButton variant="subtle" type="button" onClick={close}>Return to reference</AppButton></div>
    {editor.current?<CitationControls editor={editor.current} context={context} disabled={disabled} issue={issue}/>:null}
    <div className="editor-host" ref={host}/>
  </section>
}

export default function ReferenceTools({editor,context,disabled,issue}:{editor:Editor;context:ReferenceContext;disabled:boolean;issue:(message:string)=>void}):React.JSX.Element {
  const [noteId,setNoteId]=useState<string|null>(null),[,render]=useState(0)
  useEffect(()=>{const update=():void=>render(n=>n+1);editor.on('selectionUpdate',update);editor.on('update',update);return()=>{editor.off('selectionUpdate',update);editor.off('update',update)}},[editor])
  const notes:{id:string;body:DocumentPayload['footnotesById'][string]}[]=[]
  editor.state.doc.descendants(node=>{if(node.type.name==='footnote')notes.push({id:node.attrs.footnoteId,body:node.attrs.body})})
  useEffect(()=>{
    const id=context.focusAnchor
    if(!id)return
    const main=findAnchor(editor,id)
    if(main){editor.commands.setNodeSelection(main.pos);editor.commands.focus();return}
    const note=notes.find(n=>n.body.content.some(p=>p.content?.some(i=>i.type==='citation'&&i.attrs.citationId===id)))
    if(note)setNoteId(note.id)
  },[context.focusAnchor,editor])
  const selected=(editor.state.selection as {node?:PMNode}).node
  const openNote=(id:string|null):void=>{if(editorIsComposing(editor)){issue('Finish composing footnote text before changing references.');return}setNoteId(id)}
  const returnToReference=():void=>{if(editorIsComposing(editor)){issue('Finish composing footnote text before returning to the manuscript.');return}if(noteId){const anchor=findAnchor(editor,noteId);if(anchor)editor.commands.setTextSelection(anchor.pos+1)}setNoteId(null);editor.commands.focus()}
  return <div className="reference-tools">
    <CitationControls editor={editor} context={context} disabled={disabled} issue={issue}/>
    <AppButton variant="subtle" type="button" disabled={disabled} onMouseDown={e=>e.preventDefault()} onClick={()=>{
      if(inCell(editor)){issue('Footnotes belong in prose, not plain-text table cells.');return}
      const id=crypto.randomUUID(),body={type:'doc',content:[{type:'paragraph',attrs:{blockId:crypto.randomUUID()}}]}
      const node=editor.state.schema.nodes.footnote.create({footnoteId:id,body})
      if(apply(editor,editor.state.tr.replaceSelectionWith(node,false),issue))setNoteId(id)
    }}>Insert author footnote</AppButton>
    <AppButton variant="subtle" type="button" disabled={disabled||selected?.type.name!=='footnote'} onClick={()=>{if(selected?.type.name==='footnote')openNote(selected.attrs.footnoteId)}}>Edit selected footnote</AppButton>
    {notes.length?<label>Open footnote <select value={noteId??''} onChange={e=>openNote(e.target.value||null)}><option value="">Choose a reference…</option>{notes.map((note,index)=><option key={note.id} value={note.id}>{context.labels.get(note.id)??`Reference ${index+1}`} · {note.body.content.map(p=>p.content?.map(n=>n.type==='text'?n.text:'').join('')??'').join(' ').slice(0,80)||'Empty footnote'}</option>)}</select></label>:null}
    {noteId&&findAnchor(editor,noteId)?<FootnoteBody key={noteId} owner={editor} id={noteId} context={context} disabled={disabled} issue={issue} close={returnToReference}/>:null}
  </div>
}
