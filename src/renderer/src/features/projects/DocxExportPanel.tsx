import { useEffect, useRef, useState } from 'react'
import type { OpenProject } from '../../../../shared/projects'
import { projectMessages } from '../../../../shared/projects'
import type { ExportJob, ExportPreview } from '../../../../shared/exports'
import { effectiveState, type OutlineDocument } from '../../../../shared/outline'

type Props={project:OpenProject;disabled:boolean;flush:()=>Promise<OpenProject|null>}
function outline(documents:OutlineDocument[]):{id:string;title:string;depth:number;kind:OutlineDocument['kind']}[]{
  const result:{id:string;title:string;depth:number;kind:OutlineDocument['kind']}[]=[]
  function walk(parent:string|null,depth:number):void{
    for(const d of documents.filter(x=>x.parentId===parent).sort((a,b)=>a.position-b.position)){
      if(effectiveState(d,documents)!=='active')continue
      result.push({id:d.id,title:d.title,depth,kind:d.kind});walk(d.id,depth+1)
    }
  }
  walk(null,0);return result
}
export default function DocxExportPanel(props:Props):React.JSX.Element{
  const current=useRef(props);current.current=props
  const orderedOutline=outline(props.project.documents)
  const signature=orderedOutline.map(d=>`${d.id}:${d.depth}:${d.kind}`).join('|')
  const texts=orderedOutline.filter(d=>d.kind==='text')
  const [selected,setSelected]=useState<string[]>(()=>orderedOutline.filter(d=>d.kind==='text').map(d=>d.id))
  const [paper,setPaper]=useState<'Letter'|'A4'>('Letter'),[preview,setPreview]=useState<ExportPreview|null>(null)
  const [ack,setAck]=useState(false),[job,setJob]=useState<ExportJob|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false)
  const scope={projectId:props.project.projectId,workspaceId:props.project.workspaceId}
  useEffect(()=>{setSelected(orderedOutline.filter(d=>d.kind==='text').map(d=>d.id));setPreview(null);setAck(false)},[signature])
  const selectionKey=selected.join('|')
  useEffect(()=>{setPreview(null);setAck(false)},[paper,selectionKey])
  useEffect(()=>{
    if(!job||!['rendering','publishing'].includes(job.state))return
    let stopped=false,timer:ReturnType<typeof setTimeout>
    const poll=async():Promise<void>=>{
      const result=await window.collie.docxStatus({projectId:props.project.projectId,workspaceId:props.project.workspaceId,jobId:job.id})
      if(stopped)return
      if(result.ok){setJob(result.value);if(['rendering','publishing'].includes(result.value.state))timer=setTimeout(()=>{void poll()},800)}
      else{setError(result.error.message);timer=setTimeout(()=>{void poll()},1600)}
    }
    timer=setTimeout(()=>{void poll()},800)
    return()=>{stopped=true;clearTimeout(timer)}
  },[job?.id,job?.state,props.project.projectId,props.project.workspaceId])
  function toggle(id:string):void{
    const node=orderedOutline.find(d=>d.id===id)
    if(!node)return
    const descendants=node.kind==='text'?[id]:texts.filter(d=>belongsTo(d.id,id)).map(d=>d.id)
    setSelected(old=>descendants.every(x=>old.includes(x))?old.filter(x=>!descendants.includes(x)):[...old,...descendants.filter(x=>!old.includes(x))])
  }
  function belongsTo(documentId:string,ancestorId:string):boolean{
    let cursor=props.project.documents.find(d=>d.id===documentId)
    while(cursor?.parentId){if(cursor.parentId===ancestorId)return true;cursor=props.project.documents.find(d=>d.id===cursor!.parentId)}
    return false
  }
  function move(id:string,direction:-1|1):void{setSelected(old=>{const next=[...old],index=next.indexOf(id),other=index+direction;if(index<0||other<0||other>=next.length)return old;[next[index],next[other]]=[next[other],next[index]];return next})}
  async function refresh():Promise<void>{
    setBusy(true);setError('');setPreview(null);setAck(false)
    try{
      const saved=await current.current.flush()
      if(!saved){setError('Protect pending writing, notes and sources before previewing.');return}
      const result=await window.collie.previewDocx({...scope,documentIds:selected,paper})
      if(!result.ok){setError(result.error.message);return}
      if(result.value.headCommitId!==saved.headCommitId){setError('The project changed while preparing the preview. Refresh it again.');return}
      setPreview(result.value)
    }catch{setError('The compilation preview is unavailable. Your writing has been kept.')}finally{setBusy(false)}
  }
  async function start():Promise<void>{
    if(!preview)return
    setBusy(true);setError('')
    try{
      const saved=await current.current.flush()
      if(!saved){setError('Protect pending writing, notes and sources before exporting.');return}
      if(saved.headCommitId!==preview.headCommitId){setPreview(null);setError('The project changed. Refresh the compilation preview before exporting.');return}
      const result=await window.collie.startDocx({...scope,documentIds:selected,paper,expectedHead:preview.headCommitId,previewDigest:preview.digest,acknowledgeMetadata:ack})
      if(!result.ok){if(result.error.code!=='CANCELLED')setError(result.error.message);return}
      setJob(result.value)
    }catch{setError('Export did not start. Your project and any prior DOCX were kept.')}finally{setBusy(false)}
  }
  async function cancel():Promise<void>{if(!job)return;const result=await window.collie.cancelDocx({...scope,jobId:job.id});if(!result.ok)setError(result.error.message);else setJob(result.value)}
  const metadata=preview?.issues.filter(i=>i.kind==='metadata')??[],blocking=preview?.issues.filter(i=>i.kind!=='metadata')??[]
  return <section className="docx-export-panel" aria-labelledby="docx-export-heading">
    <h2 id="docx-export-heading">Compile and export DOCX</h2>
    <p>Choose active writing sections in the order to publish. Export uses one protected local revision and does not save the project file.</p>
    <div className="export-selection"><h3>Include sections</h3>{orderedOutline.map(d=><label key={d.id} style={{display:'block',marginLeft:`${d.depth*1.25}rem`}}><input type="checkbox" checked={d.kind==='text'?selected.includes(d.id):texts.some(x=>belongsTo(x.id,d.id))&&texts.filter(x=>belongsTo(x.id,d.id)).every(x=>selected.includes(x.id))} onChange={()=>toggle(d.id)} disabled={props.disabled||busy}/>{d.kind==='text'?'Section':d.kind==='chapter'?'Chapter':'Part'}: {d.title}</label>)}</div>
    <h3>Selected order</h3><ol>{selected.map((id,index)=><li key={id}>{props.project.documents.find(d=>d.id===id)?.title??id} <button type="button" disabled={props.disabled||busy||index===0} onClick={()=>move(id,-1)}>Move up</button> <button type="button" disabled={props.disabled||busy||index===selected.length-1} onClick={()=>move(id,1)}>Move down</button></li>)}</ol>
    <label>Page preset <select value={paper} disabled={props.disabled||busy} onChange={e=>setPaper(e.target.value as 'Letter'|'A4')}><option value="Letter">US Letter</option><option value="A4">A4</option></select></label>
    <button type="button" disabled={props.disabled||busy||selected.length===0} onClick={()=>{void refresh()}}>Protect drafts and preview</button>
    {preview?<div role="status"><p>Captured revision {preview.headCommitId.slice(0,8)} · {preview.style.toUpperCase()} · {preview.paper} · {preview.sections.length} sections · {preview.counts.paragraphs} paragraphs · {preview.counts.tables} tables · {preview.counts.images} images · {preview.counts.footnotes} footnotes · {preview.counts.citations} citation clusters · {preview.counts.bibliography} bibliography entries.</p>
      {blocking.map((issue,index)=><p role="alert" key={index}>{issue.kind}: {issue.message}</p>)}
      {metadata.map((issue,index)=><p key={index}>Metadata to review: {issue.message}</p>)}
      {metadata.length?<label><input type="checkbox" checked={ack} onChange={e=>setAck(e.target.checked)}/>Export this captured revision with these listed metadata omissions.</label>:null}
      {preview.losses.length?<p role="alert">Unsupported conversions: {preview.losses.join('; ')}</p>:<p>No lossy conversions are planned.</p>}
      <button type="button" disabled={props.disabled||busy||!!job&&['rendering','publishing'].includes(job.state)||blocking.length>0||preview.losses.length>0||metadata.length>0&&!ack||preview.headCommitId!==props.project.headCommitId} onClick={()=>{void start()}}>Choose DOCX destination and export</button>
    </div>:null}
    {job?<div role="status"><p>{job.state}: {job.phase}. Captured revision {job.headCommitId.slice(0,8)}. {job.state==='complete'?`DOCX: ${job.destinationPath}`:''}</p>{job.error?<p role="alert">{job.error in projectMessages?projectMessages[job.error as keyof typeof projectMessages]:job.error}</p>:null}{job.reportPath?<p>Local export report: {job.reportPath}</p>:null}{job.state==='rendering'?<button type="button" onClick={()=>{void cancel()}}>Cancel export</button>:null}</div>:null}
    {error?<p role="alert">{error}</p>:null}
  </section>
}
