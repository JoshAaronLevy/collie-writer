import { useEffect, useRef, useState } from 'react'
import type { OpenProject } from '../../../../shared/projects'
import type { CitationStyle, CitationStyleInput, CitationsView } from '../../../../shared/citations'
import type { SourceRecord } from '../../../../shared/sources'
import type { Run } from '../../../../domain/compilation/model'

export function CitationRuns({runs}:{runs:Run[]}):React.JSX.Element {
  return <>{runs.map((run,index)=>run.kind==='break'?<br key={index}/>:run.kind==='note'?<sup key={index}>{run.number}</sup>:<span key={index} style={{fontWeight:run.marks.some(m=>m.type==='bold')?'bold':undefined,fontStyle:run.marks.some(m=>m.type==='italic')?'italic':undefined,textDecoration:[run.marks.some(m=>m.type==='underline')?'underline':'',run.marks.some(m=>m.type==='strike')?'line-through':''].filter(Boolean).join(' ')||undefined,fontVariant:run.smallCaps?'small-caps':undefined,verticalAlign:run.superscript?'super':run.subscript?'sub':undefined}}>{run.text}</span>)}</>
}
type Props={readOnly:boolean;project:OpenProject;dirty:boolean;disabled:boolean;flush:()=>Promise<OpenProject|null>;onCommitted:()=>Promise<void>;onContext:(sources:SourceRecord[],view:CitationsView|null)=>void;navigate:(documentId:string,anchorId:string)=>Promise<void>;source:(id:string)=>void}
export default function CitationsPanel(props:Props):React.JSX.Element {
  const {project,dirty,disabled}=props,scope={projectId:project.projectId,workspaceId:project.workspaceId}
  const [view,setView]=useState<CitationsView|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(false),[acknowledged,setAcknowledged]=useState(false),[selectedStyle,setSelectedStyle]=useState<CitationStyle>('apa')
  const current=useRef(props),pending=useRef<CitationStyleInput|null>(null),generation=useRef(0)
  current.current=props
  async function load():Promise<void>{
    const epoch=++generation.current;setLoading(true)
    try {
      if(current.current.dirty){
        const sources=await window.collie.readSources(scope)
        if(epoch===generation.current){if(sources.ok)current.current.onContext(sources.value.sources,null);else setError(sources.error.message)}
        return
      }
      const [sources,citations]=await Promise.all([window.collie.readSources(scope),window.collie.readCitations(scope)])
      if(epoch!==generation.current)return
      if(!sources.ok||!citations.ok){setError(!sources.ok?sources.error.message:!citations.ok?citations.error.message:'');setView(null);current.current.onContext(sources.ok?sources.value.sources:[],null);return}
      if(citations.value.headCommitId!==current.current.project.headCommitId||current.current.dirty){current.current.onContext(sources.value.sources,null);return}
      setView(citations.value);setSelectedStyle(citations.value.style);setError('');setAcknowledged(false);current.current.onContext(sources.value.sources,citations.value)
    }catch{if(epoch===generation.current)setError('Citation preview is unavailable. Your manuscript is kept.')}finally{if(epoch===generation.current)setLoading(false)}
  }
  useEffect(()=>{
    setView(null);setAcknowledged(false)
    const timer=setTimeout(()=>{void load()},350)
    return()=>{clearTimeout(timer);generation.current++}
  },[project.headCommitId,dirty])
  async function changeStyle():Promise<void>{
    setLoading(true);setError('')
    try {
      const saved=await current.current.flush()
      if(!saved)return
      pending.current??={...scope,operationId:crypto.randomUUID(),expectedHead:saved.headCommitId,style:selectedStyle}
      const result=await window.collie.changeCitationStyle(pending.current)
      if(!result.ok){if(!['UNAVAILABLE','DISK_FULL'].includes(result.error.code))pending.current=null;setError(result.error.message);return}
      pending.current=null
      await current.current.onCommitted()
      // The head change drives a fresh context; never attach old strings to newer edits.
    }catch{setError('The style change was not acknowledged. Retry uses the same operation.')}finally{setLoading(false)}
  }
  const metadata=view?.issues.filter(i=>i.kind==='metadata')??[],references=view?.issues.filter(i=>i.kind==='reference')??[]
  return <section className="citations-panel" aria-labelledby="citations-heading" tabIndex={-1}>
    <h2 id="citations-heading">Citations and bibliography</h2>
    <p>APA 7 or Chicago 18 notes and bibliography · English (US) · pinned offline style profile. Preview includes active manuscript sections in outline order.</p>
    <label>Style <select value={selectedStyle} disabled={props.readOnly||disabled||loading||!!pending.current} onChange={event=>setSelectedStyle(event.target.value as CitationStyle)}><option value="apa">APA 7</option><option value="chicago">Chicago 18 — notes and bibliography</option></select></label>
    <button type="button" disabled={props.readOnly||disabled||loading||(!pending.current&&selectedStyle===view?.style)} onClick={()=>{void changeStyle()}}>{pending.current?'Retry style change':'Apply style to project'}</button>
    <button type="button" disabled={disabled||loading} onClick={()=>{void current.current.flush().then(saved=>{if(saved)void load()})}}>Protect writing and refresh preview</button>
    {loading?<p role="status">Preparing offline citation preview…</p>:null}
    {dirty?<p role="status">Writing or source edits are pending. Preview and reference numbers refresh after local protection.</p>:null}
    {error?<p role="alert">{error}</p>:null}
    {view&&!dirty?<>
      <p>Preview from local revision {view.headCommitId.slice(0,8)} · {view.style==='apa'?'APA 7':'Chicago 18'}.</p>
      {view.error?<p role="alert">{view.error}</p>:null}
      {references.length?<p role="alert">{references.length} unresolved source reference(s). Repair these before formatting or export.</p>:null}
      {view.issues.length?<ul>{view.issues.map((issue,index)=><li key={`${issue.citationId}-${issue.sourceId}-${index}`}><strong>{issue.kind==='reference'?'Reference needs repair':'Metadata review'}:</strong> {issue.message} <button type="button" onClick={()=>{void current.current.navigate(issue.documentId,issue.citationId)}}>Open citation</button><button type="button" onClick={()=>current.current.source(issue.sourceId)}>Open source</button></li>)}</ul>:null}
      {metadata.length?<label><input type="checkbox" checked={acknowledged} onChange={event=>setAcknowledged(event.target.checked)}/> I reviewed these metadata omissions for this preview revision. They remain visible and will need review at export.</label>:null}
      {!view.error?<p role="status">{metadata.length&&!acknowledged?'Metadata review is still required. Formatting below is a draft preview.':'Citation references are resolved for this preview.'}</p>:null}
      <details><summary>Actual manuscript citations · {view.occurrences.length} clusters</summary><p>These are inserted citations, separate from source-section links and evidence associations. Archived and trashed sections are excluded from formatting.</p><ol>{view.occurrences.map(o=><li key={o.citationId}>{project.documents.find(d=>d.id===o.documentId)?.title??'Section'} · {o.state} · {o.sourceIds.length} source item(s){o.footnoteId?' · inside author footnote':''} <button type="button" onClick={()=>{void current.current.navigate(o.documentId,o.citationId)}}>Open citation</button></li>)}</ol></details>
      <h3>Notes in manuscript order</h3>
      {view.notes.length?<ol className="citation-note-preview">{view.notes.map(note=><li key={note.id} value={note.number}>{note.paragraphs.map((runs,index)=><p key={index}><CitationRuns runs={runs}/></p>)}</li>)}</ol>:<p>{view.error?'Notes are unavailable until the preview is repaired.':'No numbered notes in the active manuscript.'}</p>}
      <h3>Bibliography</h3>
      {view.bibliography.length?<div className={view.hangingIndent?'bibliography-preview hanging':'bibliography-preview'}>{view.bibliography.map((runs,index)=><p key={index}><CitationRuns runs={runs}/></p>)}</div>:<p>{view.error?'Bibliography is unavailable until the preview is repaired.':'No cited sources in the active manuscript.'}</p>}
    </>:null}
  </section>
}
