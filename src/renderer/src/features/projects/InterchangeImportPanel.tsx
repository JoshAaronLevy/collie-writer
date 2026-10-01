import { useRef, useState } from 'react'
import type { OpenProject } from '../../../../shared/projects'
import type { ImportPick, ImportPreview, ImportCommitInput } from '../../../../shared/interchange'

type Props={project:OpenProject;disabled:boolean;flush:()=>Promise<OpenProject|null>;onProject:(project:OpenProject)=>void}
export default function InterchangeImportPanel({project,disabled,flush,onProject}:Props):React.JSX.Element{
  const scope={projectId:project.projectId,workspaceId:project.workspaceId}
  const [pick,setPick]=useState<ImportPick|null>(null),[preview,setPreview]=useState<ImportPreview|null>(null)
  const [preserve,setPreserve]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState('')
  const pending=useRef<ImportCommitInput|null>(null)
  async function choose():Promise<void>{
    setBusy(true);setError('');setPreview(null);setPick(null);pending.current=null
    try{
      const chosen=await window.collie.pickInterchange(scope)
      if(!chosen.ok){setError(chosen.error.message);return}
      if(!chosen.value)return
      setPick(chosen.value)
      const result=await window.collie.previewInterchange({...scope,token:chosen.value.token})
      if(result.ok)setPreview(result.value);else setError(result.error.message)
    }catch{setError('The selected file could not be previewed.')}finally{setBusy(false)}
  }
  async function commit():Promise<void>{
    if(!pick||!preview)return
    setBusy(true);setError('')
    try{
      if(!pending.current){
        const saved=await flush()
        if(!saved){setError('Protect pending writing before importing.');return}
        pending.current={...scope,token:pick.token,operationId:crypto.randomUUID(),expectedHead:saved.headCommitId,digest:preview.digest,preserveOriginal:preserve}
      }
      const result=await window.collie.importInterchange(pending.current)
      if(!result.ok){if(result.error.code!=='UNAVAILABLE')pending.current=null;setError(result.error.code==='UNAVAILABLE'?'The import result is unknown. Leave this selection open and retry; a completed import will not be repeated.':result.error.message);return}
      onProject(result.value);setPick(null);setPreview(null);pending.current=null
    }catch{setError('The import result is unknown. Leave this selection open and retry; a completed import will not be repeated.')}finally{setBusy(false)}
  }
  return <section aria-labelledby="interchange-import-heading">
    <h2 id="interchange-import-heading">Import writing</h2>
    <p>Import UTF-8 text or Markdown as a new section in this project. Existing drafts are never matched or replaced by filename. HTML is rejected.</p>
    <button type="button" disabled={disabled||busy} onClick={()=>{void choose()}}>Choose text or Markdown file</button>
    {preview?<div role="status"><p>{pick?.name}: {preview.blocks} blocks, {preview.bytes} bytes. New section: {preview.title}.</p>
      {preview.losses.length?<ul>{preview.losses.map((loss,i)=><li key={i}>{loss}</li>)}</ul>:<p>No mapped-structure losses reported for this file.</p>}
      <p>Preview: {preview.excerpt}</p>
      <label><input type="checkbox" checked={preserve} disabled={!!pending.current||busy} onChange={e=>setPreserve(e.target.checked)}/>Keep the exact original bytes in this project</label>
      <button type="button" disabled={disabled||busy} onClick={()=>{void commit()}}>Add as new section</button>
    </div>:null}
    {error?<p role="alert">{error}</p>:null}
  </section>
}
