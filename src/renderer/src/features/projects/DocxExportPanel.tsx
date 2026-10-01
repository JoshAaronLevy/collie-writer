import { useEffect, useRef, useState } from 'react'
import type { OpenProject } from '../../../../shared/projects'
import { projectMessages } from '../../../../shared/projects'
import type { ExportJob, ExportPreview } from '../../../../shared/exports'
import type { ExportFormat } from '../../../../shared/exports'
import type { CompilationRecipe, RecipesView, RecipeChangeInput } from '../../../../shared/interchange'
import { effectiveState, type OutlineDocument } from '../../../../shared/outline'

type Props={project:OpenProject;disabled:boolean;flush:()=>Promise<OpenProject|null>;onProject:(project:OpenProject)=>void}
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
  const [formats,setFormats]=useState<ExportFormat[]>(['docx']),[baseName,setBaseName]=useState('Collie Writer manuscript')
  const [recipes,setRecipes]=useState<RecipesView|null>(null),[recipeId,setRecipeId]=useState<string|null>(null),[recipeName,setRecipeName]=useState('')
  const pendingRecipe=useRef<{signature:string;input:RecipeChangeInput}|null>(null)
  const scope={projectId:props.project.projectId,workspaceId:props.project.workspaceId}
  useEffect(()=>{setSelected(orderedOutline.filter(d=>d.kind==='text').map(d=>d.id));setPreview(null);setAck(false)},[signature])
  const selectionKey=selected.join('|')
  useEffect(()=>{setPreview(null);setAck(false)},[paper,selectionKey])
  useEffect(()=>{let active=true;void window.collie.readRecipes(scope).then(result=>{if(active&&result.ok)setRecipes(result.value)});return()=>{active=false}},[scope.projectId,scope.workspaceId,props.project.headCommitId])
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
  async function startCompilation():Promise<void>{
    if(!preview||!formats.length)return
    setBusy(true);setError('')
    try{
      const saved=await current.current.flush()
      if(!saved){setError('Protect pending writing before exporting.');return}
      if(saved.headCommitId!==preview.headCommitId){setPreview(null);setError('The project changed. Refresh the compilation preview.');return}
      const result=await window.collie.startCompilation({...scope,documentIds:selected,paper,expectedHead:preview.headCommitId,previewDigest:preview.digest,acknowledgeMetadata:ack,formats,baseName:baseName.trim()})
      if(result.ok)setJob(result.value);else if(result.error.code!=='CANCELLED')setError(result.error.message)
    }catch{setError('The compilation did not start. Existing files were kept.')}finally{setBusy(false)}
  }
  function useRecipe(recipe:CompilationRecipe):void{
    setRecipeId(recipe.id);setRecipeName(recipe.name);setSelected(recipe.documentIds);setPaper(recipe.paper);setFormats(recipe.formats);setPreview(null);setAck(false)
  }
  async function saveRecipe():Promise<void>{
    setBusy(true);setError('')
    try{
      const saved=await current.current.flush()
      if(!saved){setError('Protect pending writing before saving a recipe.');return}
      const existing=recipes?.recipes.find(r=>r.id===recipeId)
      const signature=JSON.stringify({id:existing?.id??null,name:recipeName.trim(),documentIds:selected,paper,formats})
      if(!pendingRecipe.current||pendingRecipe.current.signature!==signature)pendingRecipe.current={signature,input:{...scope,operationId:crypto.randomUUID(),expectedHead:saved.headCommitId,id:existing?.id??null,expectedRevisionId:existing?.revisionId??null,name:recipeName.trim(),documentIds:selected,paper,formats}}
      const result=await window.collie.changeRecipe(pendingRecipe.current.input)
      if(!result.ok){if(result.error.code!=='UNAVAILABLE')pendingRecipe.current=null;setError(result.error.code==='UNAVAILABLE'?'The recipe result is unknown. Retry the same save; a completed change will not be repeated.':result.error.message);return}
      pendingRecipe.current=null
      setRecipes(result.value);setPreview(null)
      setRecipeId(result.value.recipes.find(r=>r.name.toLocaleLowerCase()===recipeName.trim().toLocaleLowerCase())?.id??null)
      const updated=await window.collie.openSection({...scope,documentId:saved.documentId})
      if(updated.ok)current.current.onProject(updated.value)
      else setError('The recipe was saved. Reopen this project to refresh its revision before exporting.')
    }catch{setError('The recipe result is unknown. Retry the same save; a completed change will not be repeated.')}finally{setBusy(false)}
  }
  function toggleFormat(format:ExportFormat):void{setFormats(old=>old.includes(format)?old.filter(f=>f!==format):[...old,format])}
  function fileMessage(code:string):string{
    if(code==='DESTINATION_EXISTS')return 'Existing output kept; choose another name or folder for this format.'
    if(code==='UNAVAILABLE')return 'This format could not be produced; inspect the local report and retry.'
    return code in projectMessages?projectMessages[code as keyof typeof projectMessages]:code
  }
  async function cancel():Promise<void>{if(!job)return;const result=await window.collie.cancelDocx({...scope,jobId:job.id});if(!result.ok)setError(result.error.message);else setJob(result.value)}
  const metadata=preview?.issues.filter(i=>i.kind==='metadata')??[],blocking=preview?.issues.filter(i=>i.kind!=='metadata')??[]
  const validBaseName=/^[^\\/:*?"<>|.\u0000-\u001f][^\\/:*?"<>|\u0000-\u001f]*$/.test(baseName.trim())&&!/[. ]$/.test(baseName.trim())&&!/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(baseName.trim())
  return <section className="docx-export-panel" aria-labelledby="docx-export-heading">
    <h2 id="docx-export-heading">Compile and export</h2>
    <p>Choose active writing sections in the order to publish. Export uses one protected local revision and does not save the project file.</p>
    <div className="export-selection"><h3>Include sections</h3>{orderedOutline.map(d=><label key={d.id} style={{display:'block',marginLeft:`${d.depth*1.25}rem`}}><input type="checkbox" checked={d.kind==='text'?selected.includes(d.id):texts.some(x=>belongsTo(x.id,d.id))&&texts.filter(x=>belongsTo(x.id,d.id)).every(x=>selected.includes(x.id))} onChange={()=>toggle(d.id)} disabled={props.disabled||busy}/>{d.kind==='text'?'Section':d.kind==='chapter'?'Chapter':'Part'}: {d.title}</label>)}</div>
    <h3>Selected order</h3><ol>{selected.map((id,index)=><li key={id}>{props.project.documents.find(d=>d.id===id)?.title??id} <button type="button" disabled={props.disabled||busy||index===0} onClick={()=>move(id,-1)}>Move up</button> <button type="button" disabled={props.disabled||busy||index===selected.length-1} onClick={()=>move(id,1)}>Move down</button></li>)}</ol>
    <label>Page preset <select value={paper} disabled={props.disabled||busy} onChange={e=>setPaper(e.target.value as 'Letter'|'A4')}><option value="Letter">US Letter</option><option value="A4">A4</option></select></label>
    <fieldset disabled={props.disabled||busy}><legend>Output formats</legend>{(['docx','pdf','markdown','text'] as ExportFormat[]).map(format=><label key={format}><input type="checkbox" checked={formats.includes(format)} onChange={()=>toggleFormat(format)}/>{format==='text'?'Plain text':format.toUpperCase()} </label>)}</fieldset>
    <label>Output name <input value={baseName} maxLength={100} onChange={e=>setBaseName(e.target.value)}/></label>
    <p>A single selected format asks for a file. Multiple formats ask for a folder. Existing names in this selected-format flow are skipped and kept; choose another name to retry them. Markdown images are copied into a relative asset folder. Plain text omits image pixels and layout; per-file reports list format losses.</p>
    <div><h3>Compilation recipes</h3><p>Recipes remember section IDs, order, page preset and formats. Missing sections are flagged; a recipe never stores a second manuscript.</p>
      <label>Saved recipes <select value={recipeId??''} onChange={e=>{const found=recipes?.recipes.find(r=>r.id===e.target.value);if(found)useRecipe(found);else{setRecipeId(null);setRecipeName('')}}}><option value="">New recipe</option>{recipes?.recipes.map(r=><option value={r.id} key={r.id}>{r.name}{r.missingIds.length?' — missing sections':''}</option>)}</select></label>
      {recipeId&&recipes?.recipes.find(r=>r.id===recipeId)?.missingIds.length?<p role="alert">This recipe references missing or inactive sections. Choose active sections and save it before exporting.</p>:null}
      <label>Recipe name <input value={recipeName} maxLength={120} onChange={e=>setRecipeName(e.target.value)}/></label>
      <button type="button" disabled={props.disabled||busy||!recipeName.trim()||!selected.length||!formats.length||selected.some(id=>!texts.some(t=>t.id===id))} onClick={()=>{void saveRecipe()}}>{recipeId?'Update recipe':'Save new recipe'}</button>
    </div>
    <button type="button" disabled={props.disabled||busy||selected.length===0} onClick={()=>{void refresh()}}>Protect drafts and preview</button>
    {preview?<div role="status"><p>Captured revision {preview.headCommitId.slice(0,8)} · {preview.style.toUpperCase()} · {preview.paper} · {preview.sections.length} sections · {preview.counts.paragraphs} paragraphs · {preview.counts.tables} tables · {preview.counts.images} images · {preview.counts.footnotes} footnotes · {preview.counts.citations} citation clusters · {preview.counts.bibliography} bibliography entries.</p>
      {blocking.map((issue,index)=><p role="alert" key={index}>{issue.kind}: {issue.message}</p>)}
      {metadata.map((issue,index)=><p key={index}>Metadata to review: {issue.message}</p>)}
      {metadata.length?<label><input type="checkbox" checked={ack} onChange={e=>setAck(e.target.checked)}/>Export this captured revision with these listed metadata omissions.</label>:null}
      {preview.losses.length?<p role="alert">Unsupported compilation conversions: {preview.losses.join('; ')}</p>:<p>No compilation-blocking conversion is planned. Markdown and text format losses appear in each file result.</p>}
      <button type="button" disabled={props.disabled||busy||!!job&&['rendering','publishing'].includes(job.state)||blocking.length>0||preview.losses.length>0||metadata.length>0&&!ack||preview.headCommitId!==props.project.headCommitId} onClick={()=>{void start()}}>Export DOCX (replacement option)</button>
      <button type="button" disabled={props.disabled||busy||!!job&&['rendering','publishing'].includes(job.state)||blocking.length>0||preview.losses.length>0||metadata.length>0&&!ack||preview.headCommitId!==props.project.headCommitId||!formats.length||!validBaseName||selected.some(id=>!texts.some(t=>t.id===id))} onClick={()=>{void startCompilation()}}>Export selected formats</button>
    </div>:null}
    {job?<div role="status"><p>{job.state}: {job.phase}. Captured revision {job.headCommitId.slice(0,8)}. {!job.files&&job.state==='complete'?`DOCX: ${job.destinationPath}`:''}</p>{job.files?<ol>{job.files.map(file=><li key={file.format}>{file.format.toUpperCase()}: {file.state} — {file.path}{file.pages?` (${file.pages} pages)`:''}{file.error?` (${fileMessage(file.error)})`:''}{file.losses.length?` — ${file.losses.join('; ')}`:''}</li>)}</ol>:null}{job.error&&!job.files?<p role="alert">{job.error in projectMessages?projectMessages[job.error as keyof typeof projectMessages]:job.error}</p>:null}{job.reportPath?<p>Local export report: {job.reportPath}</p>:null}{job.state==='rendering'?<button type="button" onClick={()=>{void cancel()}}>Cancel export</button>:null}</div>:null}
    {error?<p role="alert">{error}</p>:null}
  </section>
}
