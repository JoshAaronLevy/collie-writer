import { useEffect, useState } from 'react'
import { isZoomLevel, type SupportPreview, type ZoomLevel } from '../../../../shared/support'

type VisualSettings={zoom:ZoomLevel;contrast:boolean;reducedMotion:boolean}
const key='collie.visual-settings.v1'
function initial():VisualSettings{
  try{
    const value:unknown=JSON.parse(localStorage.getItem(key)??'null')
    if(value&&typeof value==='object'&&!Array.isArray(value)){
      const found=value as Record<string,unknown>
      if(isZoomLevel(found.zoom)&&typeof found.contrast==='boolean'&&typeof found.reducedMotion==='boolean')return {zoom:found.zoom,contrast:found.contrast,reducedMotion:found.reducedMotion}
    }
  }catch{/* An unreadable preference never prevents writing. */}
  return {zoom:100,contrast:false,reducedMotion:false}
}

export default function SettingsPanel():React.JSX.Element{
  const [visual,setVisual]=useState<VisualSettings>(initial)
  const [preview,setPreview]=useState<SupportPreview|null>(null)
  const [message,setMessage]=useState('')
  useEffect(()=>{
    document.documentElement.dataset.contrast=visual.contrast?'high':'normal'
    document.documentElement.dataset.motion=visual.reducedMotion?'reduced':'system'
    try{localStorage.setItem(key,JSON.stringify(visual))}catch{setMessage('Display preferences could not be saved on this computer.')}
    void window.collie.setUiZoom(visual.zoom).then(result=>{if(!result.ok)setMessage(result.error.message)})
  },[visual])
  async function showPreview():Promise<void>{
    const result=await window.collie.readSupportPreview()
    if(result.ok){setPreview(result.value);setMessage('Preview ready. Copy only if you choose to share it.')}
    else setMessage(result.error.message)
  }
  return <section id="settings" className="settings-panel" aria-labelledby="settings-title">
    <h2 id="settings-title" tabIndex={-1}>Display and privacy</h2>
    <p>These display choices stay on this computer. System zoom shortcuts also remain available in View.</p>
    <div className="visual-settings">
      <label>Interface zoom <select value={visual.zoom} onChange={event=>setVisual(previous=>({...previous,zoom:Number(event.target.value) as ZoomLevel}))}>{([100,125,150,200] as ZoomLevel[]).map(level=><option key={level} value={level}>{level}%</option>)}</select></label>
      <label><input type="checkbox" checked={visual.contrast} onChange={event=>setVisual(previous=>({...previous,contrast:event.target.checked}))}/> High contrast</label>
      <label><input type="checkbox" checked={visual.reducedMotion} onChange={event=>setVisual(previous=>({...previous,reducedMotion:event.target.checked}))}/> Reduce motion</label>
    </div>
    <details><summary>Where your data lives</summary>
      <p>Working projects, unsaved recovery and retained file operations stay in the local working folder shown under Data Locations. Search indexes are rebuildable; source originals, excerpts, backups and recovery are not disposable caches. A project file exists separately only after Save; a backup is another chosen file.</p>
      <p>The display choices here stay in the app profile. Access documents and the free project choice live separately under the local working folder. This build has no purchase account, update connection, content analytics or crash upload. Your own cloud provider may sync a selected project file; Collie Writer cannot confirm when that upload finishes.</p>
      <p>Clear picker history only forgets a folder hint. Reset local work retains a recovery batch, but deleting app data outside Collie Writer can remove the only local copy. Save or back up each project before any reset.</p>
      <a href="#data-locations" onClick={event=>{event.preventDefault();const target=document.getElementById('data-locations') as HTMLDetailsElement|null;if(target){target.open=true;target.focus();target.scrollIntoView({block:'start'})}}}>Open Data Locations and recovery</a>
    </details>
    <details><summary>Support preview</summary>
      <p>Preview contains app and runtime versions, storage state, elapsed runtime and known error codes. It contains no writing, filenames, paths, URLs, source titles, hashes, account details or secrets. Nothing is sent automatically.</p>
      <button type="button" onClick={()=>{void showPreview()}}>Prepare content-free preview</button>
      {preview?<label>Preview to review and copy<textarea readOnly rows={12} value={JSON.stringify(preview,null,2)} onFocus={event=>event.currentTarget.select()} /></label>:null}
    </details>
    {message?<p role="status">{message}</p>:null}
  </section>
}
