import { useRetainedDraft } from '../workspace/DraftOwner'
import { useEffect, useRef, useState } from 'react'
import type { PDFDocumentLoadingTask, PDFDocumentProxy, PDFWorker, RenderTask } from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { OpenProject } from '../../../../shared/projects'
import { PDF_EXTRACTOR, PDF_INSPECTION_LIMIT, PDF_PAGE_LIMIT, TEXT_EXTRACTOR, type InspectionChange, type InspectionView, type InspectedVersion, type SourceExcerpt } from '../../../../shared/inspection'
import type { SourceAttachment } from '../../../../shared/sources'

const scope=(p:OpenProject,sourceId:string)=>({projectId:p.projectId,workspaceId:p.workspaceId,sourceId})
const tidy=(value:unknown)=>typeof value==='string'?value.replace(/[\u0000-\u001f]/g,' ').trim().slice(0,500):''
async function deadline<T>(promise:Promise<T>,ms:number):Promise<T>{let timer:ReturnType<typeof setTimeout>|undefined;try{return await Promise.race([promise,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('PARSER_TIMEOUT')),ms)})])}finally{if(timer)clearTimeout(timer)}}
type Loaded={versionId:string;pdf:PDFDocumentProxy|null;text:string|null;labels:string[]|null;title:string;author:string}

export default function SourceInspector({project,sourceId,focusExcerptId,focusVersionId,focusPageIndex,disabled,readOnly,onCommitted,close}:{project:OpenProject;sourceId:string;focusExcerptId:string|null;focusVersionId:string|null;focusPageIndex:number|null;disabled:boolean;readOnly:boolean;onCommitted:()=>Promise<void>;close:()=>void}):React.JSX.Element{
  const pendingExcerpt=useRef<{operationId:string;change:InspectionChange}|null>(null)
  const [view,setView]=useState<InspectionView|null>(null),[attachments,setAttachments]=useState<SourceAttachment[]>([])
  const [selectedVersionId,setSelectedVersionId]=useState<string|null>(null),[loadedVersionId,setLoadedVersionId]=useState<string|null>(null)
  const [pageIndex,setPageIndex]=useState(1),[pageText,setPageText]=useState(''),[busy,setBusy]=useState(false),[extracting,setExtracting]=useState(false)
  const [progress,setProgress]=useState(''),[message,setMessage]=useState(''),[error,setError]=useState('')
  const [manualQuote,setManualQuote]=useState(''),[manualLabel,setManualLabel]=useState('Manual transcription')
  const [correctionFor,setCorrectionFor]=useState<SourceExcerpt|null>(null),[correctionQuote,setCorrectionQuote]=useState(''),[correctionLabel,setCorrectionLabel]=useState('Human correction')
  const draftPending=!!manualQuote||manualLabel!=='Manual transcription'||!!correctionFor&&(correctionQuote!==correctionFor.quote||correctionLabel!=='Human correction')||!!pendingExcerpt.current
  const [reimportBytes,setReimportBytes]=useState<{current:number;total:number}|null>(null)
  const loaded=useRef<Loaded|null>(null),task=useRef<PDFDocumentLoadingTask|null>(null),pdfWorker=useRef<{port:Worker;worker:PDFWorker}|null>(null),cancelled=useRef(false),reimportOperation=useRef<string|null>(null),selection=useRef<HTMLTextAreaElement|null>(null),canvas=useRef<HTMLCanvasElement|null>(null),panel=useRef<HTMLElement|null>(null)
  const focusedExcerpt=useRef<string|null>(null)
  const selected=view?.versions.find(v=>v.id===selectedVersionId),active=view?.versions.find(v=>v.id===view.activeVersionId)
  const page=view?.pages.find(p=>p.versionId===selectedVersionId&&p.index===pageIndex)
  const loading=busy||extracting||disabled||!!pendingExcerpt.current


  useEffect(()=>{let alive=true;setView(null);setSelectedVersionId(null);setLoadedVersionId(null);loaded.current=null;setPageText('');void window.collie.readInspection(scope(project,sourceId)).then(r=>{if(alive){if(r.ok){setView(r.value);setSelectedVersionId(r.value.activeVersionId??r.value.versions[0]?.id??null)}else setError(r.error.message)}});void window.collie.readSources({projectId:project.projectId,workspaceId:project.workspaceId}).then(r=>{if(alive&&r.ok)setAttachments(r.value.sources.find(s=>s.id===sourceId)?.attachments??[])});return()=>{alive=false;cancelled.current=true;void closePdf()}},[project.projectId,project.workspaceId,sourceId])
  useEffect(()=>{if(!focusExcerptId||!view||focusedExcerpt.current===focusExcerptId)return;const excerpt=view.excerpts.find(item=>item.id===focusExcerptId);if(excerpt){focusedExcerpt.current=focusExcerptId;void navigateExcerpt(excerpt)}},[focusExcerptId,view?.sourceId])
  useEffect(()=>{if(!focusVersionId||!view||focusExcerptId)return;const version=view.versions.find(item=>item.id===focusVersionId);if(version)void openVersion(version,focusPageIndex??undefined)},[focusVersionId,focusPageIndex,view?.sourceId])
  useEffect(()=>window.collie.onSourceProgress(p=>{if(p.operationId===reimportOperation.current)setReimportBytes({current:p.transferred,total:p.total})}),[])
  useEffect(()=>{let alive=true;setPageText('');if(page?.state==='text'&&selectedVersionId){void window.collie.readInspectedPage({...scope(project,sourceId),versionId:selectedVersionId,pageIndex}).then(r=>{if(alive){if(r.ok)setPageText(r.value.text);else setError(r.error.message)}})}return()=>{alive=false}},[project.projectId,project.workspaceId,sourceId,selectedVersionId,pageIndex,page?.textHash])
  useEffect(()=>{if(!loaded.current?.pdf||loaded.current.versionId!==selectedVersionId||!canvas.current)return;let live=true;const running:{render:RenderTask|null}={render:null};const doc=loaded.current.pdf;void (async()=>{try{const pdfjs=await import('pdfjs-dist');const pdfPage=await deadline(doc.getPage(pageIndex),10000);if(!live||!canvas.current)return;const plain=pdfPage.getViewport({scale:1}),scale=Math.min(1.2,Math.sqrt(4_000_000/(plain.width*plain.height)));const viewport=pdfPage.getViewport({scale});const element=canvas.current,context=element.getContext('2d');if(!context)throw new Error('CANVAS_UNAVAILABLE');element.width=Math.ceil(viewport.width);element.height=Math.ceil(viewport.height);running.render=pdfPage.render({canvas:element,canvasContext:context,viewport,annotationMode:pdfjs.AnnotationMode.DISABLE});await deadline(running.render.promise,15000)}catch{running.render?.cancel();if(live)setError('This PDF page could not be rendered. Its source bytes and earlier excerpts remain available.')}})();return()=>{live=false;running.render?.cancel()}},[loadedVersionId,selectedVersionId,pageIndex])

  async function mutate(change:InspectionChange):Promise<InspectionView|null>{
    const operation=change.type==='excerpt'?(pendingExcerpt.current??{operationId:crypto.randomUUID(),change}):{operationId:crypto.randomUUID(),change}
    if(change.type==='excerpt')pendingExcerpt.current=operation
    try {
      const result=await window.collie.changeInspection({...scope(project,sourceId),...operation})
      if(!result.ok){if(result.error.code!=='UNAVAILABLE'&&change.type==='excerpt')pendingExcerpt.current=null;setError(result.error.message);return null}
      if(change.type==='excerpt')pendingExcerpt.current=null
      setView(result.value);return result.value
    } catch {setError('The source change has an unknown outcome. Keep this view and retry the pending excerpt.');return null}
  }
  async function retryExcerpt():Promise<void>{
    if(!pendingExcerpt.current)return
    setBusy(true)
    try{if(await mutate(pendingExcerpt.current.change)){setManualQuote('');setManualLabel('Manual transcription');setCorrectionFor(null);setCorrectionQuote('');setCorrectionLabel('Human correction');await onCommitted()}}finally{setBusy(false)}
  }

  async function closePdf():Promise<void>{const old=task.current,owned=pdfWorker.current;task.current=null;pdfWorker.current=null;owned?.port.terminate();try{owned?.worker.destroy()}catch{}if(old)try{await deadline(old.destroy(),1000)}catch{}}
  async function ensure(attachmentId:string):Promise<void>{if(!allowInspectionTargetChange())return;setBusy(true);setError('');try{const next=await mutate({type:'ensure',attachmentId});if(next){setSelectedVersionId(next.versions.find(v=>v.attachmentId===attachmentId)?.id??null);await onCommitted()}}finally{setBusy(false)}}
  async function chooseActive(v:InspectedVersion):Promise<void>{setBusy(true);setError('');try{if(await mutate({type:'choose',versionId:v.id,expectedRevisionId:v.revisionId})){setMessage('Active version changed. Earlier excerpts remain tied to their original versions.');await onCommitted()}}finally{setBusy(false)}}
  async function markOpenFailure(v:InspectedVersion,reason:'password_required'|'unsupported'|'failed'):Promise<void>{if(v.status==='indexed'||v.status==='no_text')return;const started=await mutate({type:'start',versionId:v.id,extractorVersion:v.mediaType==='application/pdf'?PDF_EXTRACTOR:TEXT_EXTRACTOR,totalPages:v.totalPages??0,documentTitle:v.documentTitle,documentAuthor:v.documentAuthor});if(started){await mutate({type:'finish',versionId:v.id,outcome:reason});await onCommitted()}}
  async function openVersion(v:InspectedVersion,jump?:number):Promise<void>{
    if(extracting||!allowInspectionTargetChange())return
    setBusy(true);setError('');setMessage('');setPageText('');setSelectedVersionId(v.id)
    try{
      await closePdf();loaded.current=null;setLoadedVersionId(null)
      const access=await window.collie.openInspectedAsset({...scope(project,sourceId),versionId:v.id})
      if(!access.ok){if(access.error.code==='LIMIT_EXCEEDED')await markOpenFailure(v,'unsupported');setError(access.error.message);return}
      const response=await deadline(fetch(access.value.url,{cache:'no-store'}),30000)
      if(!response.ok)throw new Error('SOURCE_UNAVAILABLE')
      const bytes=await deadline(response.arrayBuffer(),30000)
      if(bytes.byteLength!==access.value.bytes||bytes.byteLength>PDF_INSPECTION_LIMIT)throw new Error('SOURCE_CHANGED')
      if(v.mediaType==='text/plain'){
        const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes)
        loaded.current={versionId:v.id,pdf:null,text,labels:null,title:'',author:''};setLoadedVersionId(v.id);setPageIndex(0)
      }else{
        const pdfjs=await import('pdfjs-dist')
        const base=new URL('pdfjs/',window.location.href).href
        const port=new Worker(pdfWorkerUrl,{type:'module'}),worker=pdfjs.PDFWorker.create({port});pdfWorker.current={port,worker}
        await deadline(worker.promise,10000)
        const loadingTask=pdfjs.getDocument({data:new Uint8Array(bytes),worker,cMapUrl:`${base}cmaps/`,cMapPacked:true,iccUrl:`${base}iccs/`,standardFontDataUrl:`${base}standard_fonts/`,wasmUrl:`${base}wasm/`,useWorkerFetch:true,useSystemFonts:false,enableXfa:false,stopAtErrors:true,maxImageSize:20_000_000})
        task.current=loadingTask
        const pdf=await deadline(loadingTask.promise,30000)
        if(pdf.numPages<1||pdf.numPages>10000)throw new Error('PAGE_LIMIT')
        const labels=await deadline(pdf.getPageLabels(),10000).catch(()=>null)
        const metadata=await deadline(pdf.getMetadata(),10000).catch(()=>null) as {info?:{Title?:unknown;Author?:unknown}}|null
        loaded.current={versionId:v.id,pdf,text:null,labels,title:tidy(metadata?.info?.Title),author:tidy(metadata?.info?.Author)}
        setLoadedVersionId(v.id);setPageIndex(jump&&jump>=1&&jump<=pdf.numPages?jump:1)
      }
    }catch(problem){const reason=problem&&typeof problem==='object'&&'name'in problem&&problem.name==='PasswordException'?'password_required':problem instanceof Error&&problem.message==='PAGE_LIMIT'?'unsupported':'failed';await closePdf();await markOpenFailure(v,reason);setError(reason==='password_required'?'This PDF requires a password. Its original remains stored; no text was extracted.':reason==='unsupported'?'This PDF exceeds the supported page limit. Its original remains stored.':'The selected source could not be opened safely. Its original and earlier excerpts remain stored.')}
    finally{setBusy(false)}
  }
  async function extract():Promise<void>{
    const v=selected,asset=loaded.current;if(!v||!asset||asset.versionId!==v.id||extracting)return
    cancelled.current=false;setExtracting(true);setError('');setMessage('')
    const totalPages=asset.pdf?.numPages??0,extractorVersion=asset.pdf?PDF_EXTRACTOR:TEXT_EXTRACTOR
    try{
      const started=await mutate({type:'start',versionId:v.id,extractorVersion,totalPages,documentTitle:asset.title,documentAuthor:asset.author})
      if(!started)return
      await onCommitted()
      const total=asset.pdf?Math.min(totalPages,PDF_PAGE_LIMIT):1
      let truncated=false,parserFailed=false
      for(let step=0;step<total&&!cancelled.current;step++){
        const index=asset.pdf?step+1:0
        if(started.pages.some(p=>p.versionId===v.id&&p.index===index)){setProgress(`Retained page ${step+1} of ${total}`);continue}
        let text='',state:'text'|'no_text'|'failed'='no_text',error:string|null=null,pageTruncated=false
        try{
          if(asset.pdf){const pdfPage=await deadline(asset.pdf.getPage(index),10000);const content=await deadline(pdfPage.getTextContent(),10000);const pieces:string[]=[];let length=0;for(const item of content.items){if(!('str'in item))continue;const part=`${item.str}${item.hasEOL?'\n':' '}`;if(length+part.length>100000){pieces.push(part.slice(0,100000-length));truncated=true;pageTruncated=true;break}pieces.push(part);length+=part.length}text=pieces.join('')}
          else {const full=asset.text??'';if(full.length>100000){truncated=true;pageTruncated=true}text=full.slice(0,100000)}
          text=text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,' ')
          state=text.trim()?'text':'no_text'
          if(pageTruncated)error='Text exceeded the 100,000-character page limit; only the saved prefix is available.'
        }catch{state='failed';error='Page text could not be extracted within the parser limit.';parserFailed=true;await closePdf();loaded.current=null;setLoadedVersionId(null)}
        if(cancelled.current)break
        const label=asset.pdf?tidy(asset.labels?.[index-1]).slice(0,100)||null:null
        if(!await mutate({type:'page',versionId:v.id,pageIndex:index,label,state,text:state==='text'?text:'',error}))break
        setProgress(`Processed ${step+1} of ${total} ${asset.pdf?'PDF pages':'text versions'}.`)
        if(parserFailed)break
        await new Promise(resolve=>setTimeout(resolve,0))
      }
      if(await mutate({type:'finish',versionId:v.id,outcome:parserFailed?'failed':cancelled.current||truncated?'cancelled':'done'})){
        setMessage(parserFailed?'A page parser failed. Saved pages remain inspectable; reopen the version to continue.':cancelled.current?'Extraction stopped. Saved pages remain inspectable; resume to continue.':truncated?'Text exceeded the 100,000-character page limit. The retained extraction is partial.':totalPages>PDF_PAGE_LIMIT?'Only the first 400 pages were processed. Coverage is partial.':'Extraction finished. Review the page coverage and text before quoting.')
        await onCommitted()
      }
    }catch{await mutate({type:'finish',versionId:v.id,outcome:cancelled.current?'cancelled':'failed'});setError('Extraction stopped after a parser or storage error. Already saved pages and originals remain.');await onCommitted()}
    finally{setExtracting(false);setProgress('')}
  }
  function cancelExtraction():void{cancelled.current=true;setProgress('Stopping after the current page…')}
  async function excerpt():Promise<void>{const v=selected,area=selection.current;if(!v||!area||!page||page.state!=='text')return;const start=area.selectionStart,end=area.selectionEnd,quote=pageText.slice(start,end);if(!quote.trim()||quote.length>10000){setError('Select up to 10,000 characters in saved extracted text.');return}setBusy(true);setError('');try{if(await mutate({type:'excerpt',id:crypto.randomUUID(),versionId:v.id,pageIndex,kind:'extracted',quote,startOffset:start,endOffset:end,label:'Selected extracted text',supersedesId:null})){setMessage('Exact excerpt saved with its source version, page and text range.');await onCommitted()}}finally{setBusy(false)}}
  async function transcribe():Promise<void>{const v=selected;if(!v||!manualQuote.trim()||!manualLabel.trim())return;setBusy(true);setError('');try{if(await mutate({type:'excerpt',id:crypto.randomUUID(),versionId:v.id,pageIndex,kind:'transcription',quote:manualQuote,startOffset:null,endOffset:null,label:manualLabel,supersedesId:null})){setManualQuote('');setManualLabel('Manual transcription');setMessage('Labeled manual transcription saved. It is not represented as extracted PDF text.');await onCommitted()}}finally{setBusy(false)}}
  async function correct():Promise<void>{const original=correctionFor;if(!original||!correctionQuote.trim()||!correctionLabel.trim())return;setBusy(true);setError('');try{if(await mutate({type:'excerpt',id:crypto.randomUUID(),versionId:original.versionId,pageIndex:original.pageIndex,kind:'correction',quote:correctionQuote,startOffset:null,endOffset:null,label:correctionLabel,supersedesId:original.id})){setCorrectionFor(null);setMessage('Correction saved as a new record. The original quotation is unchanged.');await onCommitted()}}finally{setBusy(false)}}
  async function reimport():Promise<void>{if(!allowInspectionTargetChange())return;setBusy(true);setError('');try{const picked=await window.collie.pickSourceVersion({projectId:project.projectId,workspaceId:project.workspaceId});if(!picked.ok){setError(picked.error.message);return}if(!picked.value)return;const operationId=crypto.randomUUID();reimportOperation.current=operationId;setReimportBytes(null);const result=await window.collie.attachSourceFile({...scope(project,sourceId),operationId,token:picked.value.token});if(!result.ok){setError(result.error.message);return}setAttachments(result.value.sources.find(s=>s.id===sourceId)?.attachments??[]);const inspected=await window.collie.readInspection(scope(project,sourceId));if(inspected.ok){setView(inspected.value);setSelectedVersionId(inspected.value.versions.find(v=>v.attachmentId===operationId)?.id??null);setMessage('New immutable version copied. Inspect and compare it, then choose whether to make it active.')}else setError(inspected.error.message);await onCommitted()}finally{reimportOperation.current=null;setReimportBytes(null);setBusy(false)}}
  async function navigateExcerpt(item:SourceExcerpt):Promise<void>{if(!allowInspectionTargetChange())return;const v=view?.versions.find(x=>x.id===item.versionId);if(!v)return;setSelectedVersionId(v.id);await openVersion(v,item.pageIndex??undefined);setPageIndex(item.pageIndex??0)}
  function allowInspectionTargetChange():boolean { if (!draftPending) return true; setError('Save or explicitly discard the transcription or correction before changing its source page.');return false }
  const draftBinding=useRetainedDraft('transcription',{
    read:()=>({scope:{projectId:project.projectId,workspaceId:project.workspaceId},kind:'transcription',entityId:sourceId,label:'transcription or correction',dirty:draftPending,
      composing:false,busy,pendingOperation:pendingExcerpt.current,policy:'explicit',issue:error,
      target:{kind:'workspace',scope:{projectId:project.projectId,workspaceId:project.workspaceId},view:'research',target:{kind:'inspector',sourceId}}}),
    focus:()=>panel.current?.focus()
  })
  useRetainedDraft('inspection-operation',{
    read:()=>({scope:{projectId:project.projectId,workspaceId:project.workspaceId},kind:'source-inspection',entityId:sourceId,label:'source inspection',dirty:false,
      composing:false,busy:busy||extracting,pendingOperation:null,policy:'operation',status:progress||(busy?'Working…':message)||undefined,issue:error||undefined,
      target:{kind:'workspace',scope:{projectId:project.projectId,workspaceId:project.workspaceId},view:'research',target:{kind:'inspector',sourceId}}})
  })
  return <aside tabIndex={-1} {...draftBinding} ref={panel} className="source-inspector" aria-labelledby="inspector-title">
    <div className="project-actions"><h2 id="inspector-title">Source inspector</h2><button type="button" onClick={close}>Close inspector</button></div>
    {draftPending?<p role="status">Transcription or correction edits are not saved yet. <button type="button" disabled={loading} onClick={()=>{setManualQuote('');setManualLabel('Manual transcription');setCorrectionFor(null);setCorrectionQuote('');setCorrectionLabel('Human correction')}}>Discard pending transcription edits</button></p>:null}
    <p>Managed originals stay local. PDF pages are inert images with no interactive links, forms or scripts. Extracted text can be incomplete or out of reading order; scanned pages need manual transcription.</p>
    <button type="button" disabled={loading||readOnly} onClick={()=>void reimport()}>Reimport PDF or text as a new version…</button>
    {reimportBytes?<p role="status">Copying new version: {Math.round(100*reimportBytes.current/reimportBytes.total)}%</p>:null}
    {attachments.filter(a=>['application/pdf','text/plain'].includes(a.mediaType)&&!view?.versions.some(v=>v.attachmentId===a.id)).map(a=><p key={a.id}><button type="button" disabled={loading} onClick={()=>void ensure(a.id)}>Inspect retained {a.name}</button></p>)}
    {pendingExcerpt.current?<button type="button" disabled={busy||extracting||disabled||readOnly} onClick={()=>void retryExcerpt()}>Retry pending excerpt</button>:null}
    <h3>Versions</h3>
    <ul>{view?.versions.map(v=><li key={v.id}><button type="button" disabled={loading} aria-current={selectedVersionId===v.id?'true':undefined} onClick={()=>{if(!allowInspectionTargetChange())return;setSelectedVersionId(v.id);setLoadedVersionId(null);loaded.current=null;void closePdf();setPageIndex(v.mediaType==='application/pdf'?1:0)}}>{v.mediaType==='application/pdf'?'PDF':'Text'} · {v.createdAt.slice(0,10)} · {v.sha256.slice(0,12)}</button> {view.activeVersionId===v.id?'· active':''} · {v.status==='extracting'?'interrupted or running':v.status} · {v.pagesWithText}/{v.totalPages??(v.mediaType==='text/plain'?1:0)} {v.mediaType==='application/pdf'?'pages with text':'text parts'} <button type="button" disabled={loading} onClick={()=>void openVersion(v)}>Open version</button>{view.activeVersionId!==v.id?<button type="button" disabled={loading||readOnly} onClick={()=>void chooseActive(v)}>Use as active</button>:null}</li>)}</ul>
    {selected?<><p>Source version hash: <code>{selected.sha256}</code>. Extractor: {selected.extractorVersion??'not run'}. {selected.mediaType==='application/pdf'&&selected.totalPages!==null?`${selected.pagesProcessed} of ${selected.totalPages} pages processed; ${selected.pagesWithText} yielded text.`:''}</p>
      {active&&active.id!==selected.id?<p role="status">This version differs from the active version: {active.sha256===selected.sha256?'same file bytes':'different file bytes'}. Old excerpts remain on their original version. Review the metadata and text before switching.</p>:null}
      <details><summary>Version metadata and comparison</summary><p>Canonical title at import: {selected.metadata.title}. Current active version title at import: {active?.metadata.title??'none'}.</p><p>PDF title: {selected.documentTitle||'not available'}; PDF author: {selected.documentAuthor||'not available'}.</p><p>Active PDF title: {active?.documentTitle||'not available'}; active PDF author: {active?.documentAuthor||'not available'}.</p></details>
      {loadedVersionId===selected.id?<><div className="project-actions"><button type="button" disabled={loading||selected.status==='indexed'||selected.status==='no_text'} onClick={()=>void extract()}>{selected.pagesProcessed?'Resume extraction':'Extract text page by page'}</button>{extracting?<button type="button" onClick={cancelExtraction}>Cancel extraction</button>:null}</div>
        {loaded.current?.pdf?<div className="project-actions"><button type="button" disabled={loading||draftPending||pageIndex<=1} onClick={()=>setPageIndex(n=>n-1)}>Previous PDF page</button><span>PDF page {pageIndex} of {loaded.current.pdf.numPages}{loaded.current.labels?.[pageIndex-1]?` · label ${loaded.current.labels[pageIndex-1]}`:''}</span><button type="button" disabled={loading||draftPending||pageIndex>=loaded.current.pdf.numPages} onClick={()=>setPageIndex(n=>n+1)}>Next PDF page</button></div>:<p>Plain text version; no PDF page number.</p>}
        {loaded.current?.pdf?<canvas ref={canvas} className="inspected-pdf-canvas" role="img" aria-label={`Rendered PDF page ${pageIndex}`} />:null}
        <label>Saved extracted text for this {loaded.current?.pdf?'page':'text version'} <textarea ref={selection} value={pageText} readOnly rows={9} aria-label="Saved extracted source text" /></label>
        {page?.error?<p role="alert">{page.error}</p>:null}
        {page?.state==='failed'?<p role="alert">This page could not yield reliable text. Its original can still be viewed.</p>:!pageText?<p>No selectable saved text for this page. A scan may need manual transcription; OCR is not included.</p>:<button type="button" disabled={loading||readOnly} onClick={()=>void excerpt()}>Save selected exact excerpt</button>}
        <div className="manual-transcription"><label>Manual transcription or reading note <textarea readOnly={readOnly||loading} value={manualQuote} maxLength={10000} onChange={e=>setManualQuote(e.target.value)} rows={3} /></label><label>Required label <input disabled={readOnly||loading} value={manualLabel} maxLength={200} onChange={e=>setManualLabel(e.target.value)} /></label><button type="button" disabled={loading||readOnly||!manualQuote.trim()||!manualLabel.trim()} onClick={()=>void transcribe()}>Save labeled transcription</button></div>
      </>:<p>Open this version to view pages and inspect or extract text.</p>}
    </>:null}
    <h3>Retained excerpts</h3><ul>{view?.excerpts.map(item=><li key={item.id}><blockquote>{item.quote}</blockquote><p>{item.kind} · {item.label} · {item.pageIndex===0?'plain text':item.pageIndex===null?'page unavailable':`PDF page ${item.pageIndex}${item.pageLabel?` (label ${item.pageLabel})`:''}`} · version {item.versionId.slice(0,8)} {item.startOffset!==null&&item.endOffset!==null?`· saved text offsets ${item.startOffset}–${item.endOffset}`:''} {view.activeVersionId!==item.versionId?'· older version; anchor stale against active version':''}</p>{item.contextBefore||item.contextAfter?<p>Context: …{item.contextBefore}<strong>{item.quote}</strong>{item.contextAfter}…</p>:null}<button type="button" disabled={loading} onClick={()=>void navigateExcerpt(item)}>Go to inspected version and page</button><button type="button" disabled={loading||readOnly} onClick={()=>{if(!allowInspectionTargetChange())return;setCorrectionLabel('Human correction');setCorrectionFor(item);setCorrectionQuote(item.quote)}}>Correct as new record</button></li>)}</ul>
    {correctionFor?<div className="manual-transcription"><h4>Correction to retained excerpt</h4><p>The original remains unchanged.</p><textarea readOnly={readOnly||loading} value={correctionQuote} maxLength={10000} onChange={e=>setCorrectionQuote(e.target.value)} rows={3} aria-label="Corrected passage" /><label>Required label <input disabled={readOnly||loading} value={correctionLabel} maxLength={200} onChange={e=>setCorrectionLabel(e.target.value)} /></label><button type="button" disabled={loading||readOnly||!correctionQuote.trim()||!correctionLabel.trim()} onClick={()=>void correct()}>Save correction</button><button type="button" disabled={loading} onClick={()=>setCorrectionFor(null)}>Cancel</button></div>:null}
    {progress?<p role="status">{progress}</p>:null}{message?<p role="status">{message}</p>:null}{error?<p role="alert">{error}</p>:null}
  </aside>
}
