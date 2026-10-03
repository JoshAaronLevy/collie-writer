import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { ConversationEvent } from '../../../../../shared/conversations'
import type { ProofreadBundle, ProofreadCapture, ProofreadFinding, ProofreadRequest, ProofreadReview, ProofreadSummary, ProofreadSource } from '../../../../../shared/proofreading'
import type { OpenInput } from '../../../../../shared/projects'
import { sameScope } from '../../../../../shared/project-files'
import { editorIsComposing, serializeEditor } from '../../../editor/adapter'
import { mechanicsTargets, sameMarks } from '../../../../../domain/ai/proofreading'
import { useWorkspaceSession } from '../../workspace/WorkspaceSession'
import { scopeOf } from '../../workspace/useWorkspaceController'
import { useRetainedDraft } from '../../workspace/DraftOwner'
import { useAiConnections } from '../../ai-connections/AiConnectionsProvider'
import { selectedRanges } from '../selection'
import { reviewConnection, sameReviewConnection, type ReviewConnection } from '../review-connection'

type Reviewed={input:ProofreadReview;capture:ProofreadCapture;approved:boolean}&ReviewConnection
const sizeMessage='This scope exceeds one request: at most 128 text runs, 64,000 context characters, and 80,000 including the complete structured request, instructions and result schema. Select a smaller passage. Nothing was trimmed.'
function useProofreadingController(){
  const session=useWorkspaceSession(),connections=useAiConnections()
  const [reviewed,setReviewed]=useState<Reviewed|null>(null),[items,setItems]=useState<ProofreadSummary[]>([]),[total,setTotal]=useState(0),[offset,setOffset]=useState(0)
  const [selected,setSelected]=useState<string|null>(null),[bundle,setBundle]=useState<ProofreadBundle|null>(null)
  const [busy,setBusy]=useState(false),[issue,setIssue]=useState(''),[notice,setNotice]=useState(''),[pending,setPending]=useState<ProofreadRequest|null>(null),[event,setEvent]=useState<ConversationEvent|null>(null)
  const current=useRef(session),connectionRef=useRef(connections),state=useRef({selected,offset}),locked=useRef(false),pendingRef=useRef<ProofreadRequest|null>(null)
  const sequence=useRef(0),listSequence=useRef(0),timer=useRef<ReturnType<typeof setTimeout>|null>(null),panel=useRef<HTMLElement|null>(null)
  current.current=session;connectionRef.current=connections;state.current={selected,offset};pendingRef.current=pending
  const project=session.project,scope=project?scopeOf(project):null,readOnly=session.accessReadOnly||session.accessTransition
  function belongs(captured:OpenInput):boolean{return sameScope(current.current.project,captured)}
  function show(attemptId?:string):void{
    const s=current.current;if(!s.project||s.composition.current)return
    const reveal=()=>{s.writingView.setAiTool('proofreading');s.writingView.revealPanel('ai');requestAnimationFrame(()=>{if(panel.current&&!panel.current.closest('[hidden],[inert]'))panel.current.focus()})}
    if(s.proofreadingLocked){reveal();return}
    const captured=scopeOf(s.project)
    void s.navigate({kind:'workspace',scope:captured,view:'write',documentId:s.project.documentId}).then(ok=>{if(ok&&belongs(captured)){const target=attemptId??(event?.pending||event?.issue?event.attemptId:null);if(target&&!pendingRef.current&&!locked.current)choose(target);reveal()}})
  }
  useRetainedDraft('proofreading',{
    read:()=>({scope:scope??{projectId:'',workspaceId:''},kind:'proofreading',entityId:selected,label:'proofreading review',dirty:!!reviewed,composing:false,busy,pendingOperation:pending??(event?.pending?event:null),policy:'retain',issue:issue||undefined,target:project?{kind:'workspace',scope:scopeOf(project),view:'write',documentId:project.documentId}:{kind:'library'}}),focus:show
  })
  async function list(captured:OpenInput):Promise<void>{
    const id=++listSequence.current,result=await window.collie.proofreading({...captured,action:'list',offset:state.current.offset})
    if(!belongs(captured)||id!==listSequence.current)return
    if(result.ok&&result.value.type==='list'){setItems(result.value.items);setTotal(result.value.total)}else if(!result.ok)setIssue(result.error.message)
  }
  async function read(captured:OpenInput,id:string):Promise<void>{
    const seq=++sequence.current,result=await window.collie.proofreading({...captured,action:'attempt',attemptId:id})
    if(!belongs(captured)||seq!==sequence.current||state.current.selected!==id)return
    if(result.ok&&result.value.type==='turn')setBundle(result.value.turn);else if(!result.ok)setIssue(result.error.message)
  }
  async function refresh(captured:OpenInput):Promise<void>{
    await current.current.refreshConversationHead(captured)
    if(!belongs(captured))return
    await list(captured);if(state.current.selected)await read(captured,state.current.selected)
  }
  useEffect(()=>{
    sequence.current++;listSequence.current++;state.current.selected=null;state.current.offset=0
    setSelected(null);setBundle(null);setItems([]);setTotal(0);setOffset(0);setReviewed(null);setPending(null);setEvent(null);setIssue('');setNotice('')
    if(timer.current){clearTimeout(timer.current);timer.current=null}
    if(!scope)return
    const captured=scope;let alive=true
    void (async()=>{const result=await window.collie.proofreading({...captured,action:'reconcile'});if(!alive||!belongs(captured))return;if(!result.ok)setIssue('Saved reviews remain readable. Use Retry local recovery to finish protecting retained output.');await refresh(captured)})()
    return()=>{alive=false}
  },[project?.projectId,project?.workspaceId])
  useEffect(()=>{if(scope)void list(scope)},[project?.projectId,project?.workspaceId,offset])
  useEffect(()=>{if(scope&&selected)void read(scope,selected)},[project?.projectId,project?.workspaceId,selected,project?.revisionId])
  useEffect(()=>window.collie.onProofreadingChanged(value=>{
    if(!belongs(value))return
    setEvent(value);if(value.issue)setIssue(value.issue)
    if(!timer.current)timer.current=setTimeout(()=>{timer.current=null;void refresh(scopeOf(value))},300)
  }),[])
  useEffect(()=>()=>{if(timer.current)clearTimeout(timer.current)},[])
  const hadWork=useRef(false)
  useEffect(()=>{
    if(!scope)return
    const work=connections.status?.work.find(item=>item.feature==='proofreading'&&sameScope(item.scope,scope)&&!['retained-outcome','handoff-required','record-unavailable'].includes(item.state))
    const refreshNeeded=!!work||hadWork.current||!!bundle&&['preparing','running','stopping'].includes(bundle.attempt.state)
    hadWork.current=!!work
    if(work)setEvent({...scope,attemptId:work.attemptId,pending:true,issue:work.state==='protection-required'?'AI output needs local protection.':null})
    else setEvent(previous=>previous?{...previous,pending:false}:previous)
    if(refreshNeeded&&!timer.current)timer.current=setTimeout(()=>{timer.current=null;void refresh(scope)},300)
  },[connections.status?.sequence,project?.projectId,project?.workspaceId])
  const selectedConnection=reviewConnection(connections.status,'proofread')
  useEffect(()=>{
    if(reviewed&&!sameReviewConnection(reviewed,selectedConnection))setNotice('The connection or model changed. Your captured text is kept; review this capture again before saving or running it.')
    setReviewed(previous=>previous&&!sameReviewConnection(previous,selectedConnection)?{...previous,approved:false}:previous)
  },[selectedConnection.connectionId,selectedConnection.model,selectedConnection.reviewRevision])
  function choose(id:string):void {if(locked.current||pendingRef.current||current.current.proofreadingLocked)return;state.current.selected=id;setSelected(id);setBundle(null);setIssue('');setNotice('')}
  async function capture(input:ProofreadReview,account:ReviewConnection):Promise<void>{
    const result=await window.collie.proofreading(input)
    if(!belongs(input))return
    if(result.ok&&result.value.type==='review'){
      const approved=sameReviewConnection(account,reviewConnection(connectionRef.current.status,'proofread'))
      setReviewed({input,capture:result.value.capture,...account,approved})
      setNotice(approved?'Review the included text and exclusions. Nothing has been sent.':'The connection changed during capture. The exact text is kept; review this capture again.')
    }else setIssue(!result.ok&&result.error.code==='LIMIT_EXCEEDED'?sizeMessage:!result.ok&&result.error.code==='STALE_REVISION'?'The captured writing changed. Choose the intended scope again; the previous capture is kept.':!result.ok&&result.error.code==='VALIDATION'?'This scope has no supported text runs. Choose a paragraph, heading or list passage; tables, quotations and rich atoms are excluded.':!result.ok?result.error.message:'The capture could not be prepared.')
  }
  async function prepare(kind:'passage'|'section'):Promise<void>{
    if(!scope||locked.current||pendingRef.current||readOnly||session.busy||session.closing||session.navigating)return
    const s=current.current,editor=s.editorRef.current,original=s.project,account=reviewConnection(connectionRef.current.status,'proofread')
    if(!editor||editor.isDestroyed||!original||editorIsComposing(editor)||s.composition.current){setIssue('Finish composing in the manuscript before choosing a review scope.');return}
    const before=editor.state.doc,ranges=kind==='passage'?selectedRanges(editor):null
    if(kind==='passage'&&!ranges){setIssue('Select text in the manuscript first. For a selection containing an image, choose a smaller text passage.');return}
    locked.current=true;setBusy(true);setIssue('')
    try{
      const saved=await s.flush(false,'save',['proofreading'])
      if(!saved||!belongs(original)||current.current.editorRef.current!==editor||editor.isDestroyed||editorIsComposing(editor)||current.current.project?.documentId!==original.documentId||saved.documentId!==original.documentId||!editor.state.doc.eq(before)){setIssue('The passage changed during local protection. Choose the intended scope again.');return}
      const source:ProofreadSource=kind==='passage'?{kind,documentId:saved.documentId,revisionId:saved.revisionId,ranges:ranges!}:{kind,documentId:saved.documentId,revisionId:saved.revisionId}
      const input:ProofreadReview={...scopeOf(saved),action:'review',expectedHead:saved.headCommitId,captureId:crypto.randomUUID(),createdAt:new Date().toISOString(),source}
      await capture(input,account)
    }catch{setIssue('The scope could not be prepared. Your writing is unchanged.')}
    finally{locked.current=false;setBusy(false)}
  }
  async function reviewAgain():Promise<void>{
    if(!scope||!reviewed||blocked||readOnly||locked.current||pendingRef.current||session.composition.current)return
    const original=reviewed,account=reviewConnection(connectionRef.current.status,'proofread')
    locked.current=true;setBusy(true);setIssue('')
    try{
      const saved=await current.current.flush(false,'save',['proofreading'])
      if(!saved||!belongs(scope))return
      // Revalidate the original protected source. Never recapture the current
      // selection as a substitute for the text the user is reviewing.
      await capture({...scope,action:'review',expectedHead:saved.headCommitId,captureId:crypto.randomUUID(),createdAt:new Date().toISOString(),source:original.capture.source},account)
    }catch{setIssue('The capture could not be reviewed again. Its text is kept and nothing was sent.')}
    finally{locked.current=false;setBusy(false)}
  }
  async function request(input:ProofreadRequest):Promise<void>{
    if(locked.current||pendingRef.current&&pendingRef.current!==input)return
    locked.current=true;setBusy(true);setIssue('');setPending(input);pendingRef.current=input
    try{
      const result=await window.collie.proofreading(input)
      if(!belongs(input))return
      if(!result.ok){
        if(!['UNAVAILABLE','DISK_FULL','PROJECT_LOCKED'].includes(result.error.code)){setPending(null);pendingRef.current=null}
        if(input.action==='submit'&&result.error.code==='STALE_REVISION')setReviewed(previous=>previous?{...previous,approved:false}:previous)
        setIssue(result.error.code==='STALE_REVISION'?'The project, finding or connection changed, or the review expired. Review the capture again; no correction was applied.':result.error.code==='LIMIT_EXCEEDED'?'This review exceeds a supported storage or request limit. Retained reviews are kept.':result.error.message);return
      }
      setPending(null);pendingRef.current=null
      if(input.action==='submit'){setReviewed(null);setSelected(input.attemptId);state.current.selected=input.attemptId;setNotice(input.send?'Request retained in the local working project. Its actual outcome appears below; only valid completed output can become findings.':'Review saved in the local working project. Nothing was sent or queued. Project Save updates its chosen file.')}
      await refresh(scopeOf(input))
    }catch{setIssue('This local action is unconfirmed. Retry the same action; a retry cannot resend inference.')}
    finally{locked.current=false;setBusy(false)}
  }
  async function submit(send:boolean):Promise<void>{
    if(!scope||!reviewed||locked.current||pendingRef.current||readOnly||blocked)return
    const original=reviewed
    if(!original.approved||!sameReviewConnection(original,reviewConnection(connectionRef.current.status,'proofread'))){setIssue('The connection or model changed. Review this capture again; its text is kept.');return}
    if(send&&!mayRun(original)){setIssue('Run is unavailable. Read the connection status; local saving remains available.');return}
    locked.current=true;setBusy(true)
    let valid=false
    try{const s=current.current,editor=s.editorRef.current,before=editor?.state.doc,saved=await s.flush(false,'save',['proofreading']);valid=!!saved&&belongs(scope)&&saved.headCommitId===original.input.expectedHead&&!!editor&&current.current.editorRef.current===editor&&!editor.isDestroyed&&!editorIsComposing(editor)&&!!before&&editor.state.doc.eq(before)}catch{setIssue('The writing could not be protected for this request. Keep the current capture and try again.');return}finally{locked.current=false;setBusy(false)}
    if(!valid){setIssue('The writing or project changed after review. Choose the scope again; the previous capture remains visible.');return}
    if(!sameReviewConnection(original,reviewConnection(connectionRef.current.status,'proofread'))||send&&!mayRun(original)){setIssue('Availability changed while protecting the writing. Review the connection and this capture again.');return}
    await request({...scope,action:'submit',attemptId:crypto.randomUUID(),review:original.input,digest:original.capture.digest,send,connectionId:original.connectionId,model:original.model})
  }
  async function decide(f:ProofreadFinding,decision:'apply'|'ignore'|'undo-ignore'):Promise<void>{
    if(!scope||!bundle||locked.current||pendingRef.current||readOnly||current.current.proofreadingLocked)return
    if(decision==='apply'){
      locked.current=true;setBusy(true)
      try{const ok=await current.current.applyProofreading(bundle.capture,f);if(ok){setIssue('');setNotice('Correction accepted. Other findings from that revision are stale.')}await refresh(scope)}finally{locked.current=false;setBusy(false)}
      return
    }
    locked.current=true;setBusy(true)
    let expectedHead:string|null=null
    try{const saved=await current.current.flush(false,'save',['proofreading']);if(saved&&belongs(scope))expectedHead=saved.headCommitId}catch{setIssue('The writing could not be protected. This finding decision is unchanged.')}finally{locked.current=false;setBusy(false)}
    if(!expectedHead)return
    await request({...scope,action:'decide',operationId:crypto.randomUUID(),attemptId:f.runId,findingId:f.id,expectedRevision:f.revisionId,expectedHead,decision})
  }
  async function original(f:ProofreadFinding):Promise<void>{
    if(!scope||!bundle||locked.current||pendingRef.current||current.current.proofreadingLocked)return
    const captured=bundle.capture,s=current.current
    if(!await s.flush(false,'save',['proofreading']))return
    const result=await window.collie.proofreading({...scope,action:'attempt',attemptId:f.runId})
    if(!belongs(scope)||!result.ok||result.value.type!=='turn'||result.value.turn.validity!=='current'){setIssue('The original revision is stale or unavailable. Its captured quote remains readable.');return}
    if(!await s.navigate({kind:'workspace',scope,view:'write',documentId:captured.source.documentId}))return
    requestAnimationFrame(()=>{
      const live=current.current,editor=live.editorRef.current,p=live.project,t=captured.targets.find(t=>t.id===f.targetId)
      if(!belongs(scope)||live.manuscriptDirty||live.destination.kind!=='workspace'||live.destination.view!=='write'||!editor||!p||p.documentId!==captured.source.documentId||p.revisionId!==captured.source.revisionId||editorIsComposing(editor)||!t)return
      try{const exact=mechanicsTargets(serializeEditor(editor),captured.source).targets.find(item=>item.id===t.id);if(!exact||exact.blockId!==t.blockId||exact.from!==t.from||exact.text!==t.text||!sameMarks(exact.marks,t.marks))throw new Error('STALE');let position:number|null=null;editor.state.doc.descendants((node,pos)=>{if(node.attrs.blockId===t.blockId)position=pos+1});if(position===null)throw new Error('MISSING');editor.commands.setTextSelection({from:position+t.from+f.from,to:position+t.from+f.to});editor.commands.focus();editor.view.dispatch(editor.state.tr.scrollIntoView())}
      catch{setIssue('The original passage changed. No substitute passage was selected.')}
    })
  }
  async function history(f:ProofreadFinding):Promise<void>{if(!f.checkpointId||!scope)return;const s=current.current;if(await s.navigate({kind:'workspace',scope,view:'history',documentId:s.project?.documentId}))s.run(()=>s.loadHistory(f.checkpointId))}
  function mayRun(capture:Reviewed):boolean{
    const owner=connectionRef.current,s=current.current,feature=owner.status?.features.proofread
    return capture.approved&&sameReviewConnection(capture,reviewConnection(owner.status,'proofread'))&&feature?.state==='available'&&
      feature.connectionId===capture.connectionId&&feature.model===capture.model&&!owner.busy&&owner.issue!=='outcome-unknown'&&
      s.available&&!s.accessReadOnly&&!s.accessTransition&&!s.closing&&!s.navigating&&!s.proofreadingLocked
  }
  const capability=connections.status?.features.proofread
  const blocked=busy||!!pending||session.busy||session.closing||session.navigating||!session.available||session.proofreadingLocked
  const reviewCurrent=!!reviewed&&reviewed.approved&&sameReviewConnection(reviewed,selectedConnection)
  const canSend=!!reviewed&&mayRun(reviewed)&&!blocked
  const validity=bundle&&(bundle.validity==='current'&&project?.documentId===bundle.capture.source.documentId&&(session.manuscriptDirty||project.revisionId!==bundle.capture.source.revisionId)?'stale':bundle.validity)
  return {targetSectionOpen:!!bundle&&project?.documentId===bundle.capture.source.documentId,scope,items,total,offset,setOffset,selected,bundle,reviewed,reviewCurrent,issue,notice,pending,event,busy,blocked,readOnly,capability,canSend,panel,validity,proofreadingLocked:session.proofreadingLocked,
    show,choose,prepare,reviewAgain,submit,decide,original,history,
    clear:()=>{if(!blocked){setReviewed(null);setNotice('Unsubmitted capture cleared. Saved reviews remain.')}},
    retry:()=>pendingRef.current?void request(pendingRef.current):undefined,
    recover:()=>scope?void request({...scope,action:'reconcile'}):undefined,
    stop:()=>scope&&selected?void request({...scope,action:'cancel',attemptId:selected}):undefined,
    protect:()=>scope&&selected?void request({...scope,action:'protect',attemptId:selected}):undefined,
    retryApply:async()=>{if(locked.current)return;locked.current=true;setBusy(true);try{await current.current.applyProofreading();if(scope)await refresh(scope)}finally{locked.current=false;setBusy(false)}}
  }
}
type Proofreading=ReturnType<typeof useProofreadingController>
const Context=createContext<Proofreading|null>(null)
export function ProofreadingProvider({children}:{children:ReactNode}):React.JSX.Element {const value=useProofreadingController();return <Context.Provider value={value}>{children}</Context.Provider>}
export function useProofreading():Proofreading {const value=useContext(Context);if(!value)throw new Error('Proofreading owner is missing');return value}
