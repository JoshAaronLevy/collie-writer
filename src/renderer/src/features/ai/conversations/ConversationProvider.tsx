import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { AI_LIMITS } from '../../../../../shared/ai'
import { CONVERSATION_LIMITS, type AiCapture, type CaptureSource, type Conversation, type ConversationEvent, type ConversationRequest, type ConversationReview, type ConversationTurn, type ConversationValue } from '../../../../../shared/conversations'
import type { OpenInput } from '../../../../../shared/projects'
import { sameScope } from '../../../../../shared/project-files'
import { useWorkspaceSession } from '../../workspace/WorkspaceSession'
import { scopeOf } from '../../workspace/useWorkspaceController'
import { useRetainedDraft } from '../../workspace/DraftOwner'
import { useAiConnections } from '../../ai-connections/AiConnectionsProvider'
import { selectedRanges } from '../selection'
import { editorIsComposing } from '../../../editor/adapter'
import { reviewConnection, sameReviewConnection, type ReviewConnection } from '../review-connection'

type Draft = { text:string; historyIds:string[]; source:CaptureSource; review:({input:ConversationReview;capture:AiCapture;excluded:number}&ReviewConnection)|null }
const sizeMessage='This request exceeds a supported limit: 16,000 prompt characters, 64,000 context characters, or 80,000 including the structured request and instructions. Shorten the prompt, choose a smaller passage or select fewer previous messages. Nothing has been trimmed.'
const emptyDraft=():Draft=>({text:'',historyIds:[],source:{kind:'none'},review:null})
const activeStates=['preparing','running','stopping']
function useConversationController() {
  const session=useWorkspaceSession(),connections=useAiConnections()
  const [items,setItems]=useState<Conversation[]>([]),[total,setTotal]=useState(0),[query,setQuery]=useState(''),[view,setView]=useState<'active'|'archived'>('active'),[offset,setOffset]=useState(0)
  const [selected,setSelected]=useState<string|null>(null),[page,setPage]=useState<Extract<ConversationValue,{type:'page'}>|null>(null),[before,setBefore]=useState<number|null>(null)
  const [drafts,setDrafts]=useState<Record<string,Draft>>({}),[newTitle,setNewTitle]=useState(''),[rename,setRename]=useState('')
  const [issue,setIssue]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(false),[run,setRun]=useState<ConversationEvent|null>(null)
  const [pending,setPending]=useState<ConversationRequest|null>(null)
  const connectionRef=useRef(connections);connectionRef.current=connections
  const current=useRef(session),state=useRef({selected,query,view,offset,before,rename}),locked=useRef(false),pendingRef=useRef<ConversationRequest|null>(null)
  const readSequence=useRef(0),listSequence=useRef(0),refreshTimer=useRef<ReturnType<typeof setTimeout>|null>(null)
  const scroll=useRef(new Map<string,number>()),composer=useRef<HTMLTextAreaElement>(null),composing=useRef(false)
  current.current=session;state.current={selected,query,view,offset,before,rename};pendingRef.current=pending
  const project=session.project,scope=project?scopeOf(project):null,draft=selected?(drafts[selected]??emptyDraft()):emptyDraft()
  const readOnly=session.accessReadOnly||session.accessTransition,active=!!page?.turns.some(t=>activeStates.includes(t.attempt.state))
  function belongs(captured:OpenInput):boolean{return sameScope(current.current.project,captured)}
  function show(attemptId?:string):void {
    const s=current.current;if(!s.project||composing.current||s.composition.current)return
    const captured=scopeOf(s.project)
    void (async()=>{
      if(!await s.navigate({kind:'workspace',scope:captured,view:'write',documentId:s.project!.documentId}))return
      if(!belongs(captured))return
      s.writingView.setAiTool('conversation');s.writingView.revealPanel('ai')
      if(rename||pendingRef.current||locked.current)return
      const target=attemptId??(run?.pending||run?.issue?run.attemptId:null)
      if(target) {
        const origin=state.current.selected
        const result=await window.collie.conversation({...captured,action:'attempt',attemptId:target})
        if(belongs(captured)&&state.current.selected===origin&&!state.current.rename&&!composing.current&&!locked.current&&!pendingRef.current&&result.ok&&result.value.type==='turn')choose(result.value.turn.attempt.conversationId)
      } else if(!drafts[selected??'']?.text){const unsent=Object.entries(drafts).find(([,d])=>!!d.text);if(unsent)choose(unsent[0])}
    })()
  }
  const dirty=Object.values(drafts).some(d=>!!d.text)||!!newTitle||!!rename
  const draftEvents=useRetainedDraft('conversations',{
    read:()=>({scope:scope??{projectId:'',workspaceId:''},kind:'conversation',entityId:selected,label:'conversation drafts and requests',dirty,composing:composing.current,busy,pendingOperation:pending??(run?.pending?run:null),policy:'retain',issue:issue||undefined,target:project?{kind:'workspace',scope:scopeOf(project),view:'write',documentId:project.documentId}:{kind:'library'}}),
    focus:()=>{show();requestAnimationFrame(()=>{if(composer.current&&!composer.current.closest('[hidden],[inert]'))composer.current.focus()})}
  })
  async function list(captured:OpenInput):Promise<void> {
    const seq=++listSequence.current,s=state.current,result=await window.collie.conversation({...captured,action:'list',state:s.view,query:s.query,offset:s.offset})
    if(!belongs(captured)||seq!==listSequence.current)return
    if(result.ok&&result.value.type==='list'){setItems(result.value.items);setTotal(result.value.total)}else if(!result.ok)setIssue(result.error.message)
  }
  async function read(captured:OpenInput,id:string,cursor:number|null):Promise<void> {
    const seq=++readSequence.current;setLoading(true)
    try{const result=await window.collie.conversation({...captured,action:'read',conversationId:id,before:cursor})
      if(!belongs(captured)||seq!==readSequence.current||state.current.selected!==id||state.current.before!==cursor)return
      if(result.ok&&result.value.type==='page')setPage(result.value);else if(!result.ok)setIssue(result.error.message)
    }finally{if(seq===readSequence.current)setLoading(false)}
  }
  async function refresh(captured:OpenInput):Promise<void> {
    await current.current.refreshConversationHead(captured)
    if(!belongs(captured))return
    await list(captured)
    const s=state.current;if(s.selected)await read(captured,s.selected,s.before)
  }
  useEffect(()=>{
    if(refreshTimer.current){clearTimeout(refreshTimer.current);refreshTimer.current=null}
    readSequence.current++;listSequence.current++
    setItems([]);setTotal(0);setSelected(null);setPage(null);setBefore(null);setDrafts({});setNewTitle('');setRename('');setIssue('');setNotice('');setPending(null);setRun(null);scroll.current.clear();historyOrder.current.clear()
    if(!scope)return
    const captured=scope;let alive=true
    void (async()=>{
      // Local retained records only. This never prepares, starts, renews or logs in to a provider.
      const result=await window.collie.conversation({...captured,action:'reconcile'})
      if(!alive||!belongs(captured))return
      if(!result.ok)setIssue('Conversation recovery could not finish. Stored history is still readable; use Retry local recovery.')
      await refresh(captured)
    })()
    return()=>{alive=false}
  },[project?.projectId,project?.workspaceId])
  useEffect(()=>{if(scope)void list(scope)},[project?.projectId,project?.workspaceId,query,view,offset])
  useEffect(()=>{if(scope&&selected)void read(scope,selected,before)},[project?.projectId,project?.workspaceId,selected,before])
  useEffect(()=>window.collie.onConversationChanged(event=>{
    if(!belongs(event))return
    setRun(event);if(event.issue)setIssue(event.issue)
    if(!refreshTimer.current)refreshTimer.current=setTimeout(()=>{refreshTimer.current=null;void refresh({projectId:event.projectId,workspaceId:event.workspaceId})},300)
  }),[])
  useEffect(()=>()=>{if(refreshTimer.current)clearTimeout(refreshTimer.current)},[])
  const hadWork=useRef(false)
  useEffect(()=>{
    if(!scope)return
    const work=connections.status?.work.find(item=>item.feature==='conversation'&&sameScope(item.scope,scope))
    const refreshNeeded=!!work||hadWork.current||active
    hadWork.current=!!work
    if(work)setRun({...scope,attemptId:work.attemptId,pending:true,issue:work.state==='protection-required'?'AI output needs local protection.':null})
    else setRun(previous=>previous?{...previous,pending:false}:previous)
    if(refreshNeeded&&!refreshTimer.current)refreshTimer.current=setTimeout(()=>{refreshTimer.current=null;void refresh(scope)},300)
  },[connections.status?.sequence,project?.projectId,project?.workspaceId])
  const selectedConnection=reviewConnection(connections.status)
  useEffect(()=>{
    if(Object.values(drafts).some(d=>d.review&&!sameReviewConnection(d.review,selectedConnection)))setNotice('The connection or model changed. Your draft and selected context are kept; review them again.')
    setDrafts(previous=>Object.fromEntries(Object.entries(previous).map(([id,d])=>[id,d.review&&!sameReviewConnection(d.review,selectedConnection)?{...d,review:null}:d])))
  },[selectedConnection.connectionId,selectedConnection.model,selectedConnection.reviewRevision])
  function update(patch:Partial<Draft>):void {if(!selected||pendingRef.current||locked.current)return;if(!drafts[selected]?.text&&Object.values(drafts).filter(d=>!!d.text).length>=20){setIssue('Save or clear an existing conversation draft before keeping another. Up to 20 unsent drafts can be retained in this session.');return;}setDrafts(previous=>({...previous,[selected]:{...(previous[selected]??emptyDraft()),...patch,review:null}}))}
  function choose(id:string):void {if(composing.current||locked.current||pendingRef.current)return;if(rename){setIssue('Save or clear the rename draft before opening another conversation.');return;}setSelected(id);state.current.selected=id;state.current.before=null;setBefore(null);setPage(null);setRename('');setIssue('');setNotice('')}
  async function request(input:ConversationRequest):Promise<void> {
    if(locked.current||composing.current||pendingRef.current&&pendingRef.current!==input)return
    locked.current=true;setBusy(true);setIssue('');setNotice('');setPending(input);pendingRef.current=input
    try {
      const result=await window.collie.conversation(input)
      if(!belongs(input))return
      if(!result.ok){
        if(!['UNAVAILABLE','DISK_FULL','PROJECT_LOCKED'].includes(result.error.code)){setPending(null);pendingRef.current=null}
        if(input.action==='submit'&&result.error.code==='STALE_REVISION')setDrafts(previous=>{
          const d=previous[input.review.conversationId]
          return d?{...previous,[input.review.conversationId]:{...d,review:null}}:previous
        })
        setIssue(result.error.code==='LIMIT_EXCEEDED'?sizeMessage:result.error.code==='STALE_REVISION'?'The reviewed writing, conversation or connection changed, or the review expired. Review the request again; your draft is kept.':result.error.code==='DESTINATION_EXISTS'?'That file already exists. Export again using a new filename. The existing file was kept.':result.error.message)
        return
      }
      setPending(null);pendingRef.current=null
      if(input.action==='change'&&result.value.type==='changed'){if(input.expectedRevision===null)setNewTitle('');else setRename('');setSelected(input.conversationId);state.current.selected=input.conversationId;setPage(null);setBefore(null);state.current.before=null}
      if(input.action==='submit'){
        setDrafts(previous=>({...previous,[input.review.conversationId]:emptyDraft()}));setBefore(null);state.current.before=null
        const outcome=result.value.type==='turn'?result.value.turn.attempt.state:null
        setNotice(!input.send?'Request saved in the local working project. Nothing was sent or queued. Use project Save to update its selected file.':
          outcome==='not-sent'?'Request saved locally, but sending was refused. Read the reason below; nothing is queued for later delivery.':
          'Request retained in the local working project. Its status and any actual response appear below; project Save updates the selected file.')
      }
      if(result.value.type==='exported')setNotice(`Transcript exported to ${result.value.path}`)
      await refresh({projectId:input.projectId,workspaceId:input.workspaceId})
    } catch {setIssue('The local action is not confirmed. Keep this window open and retry the same action.')} finally {locked.current=false;setBusy(false)}
  }
  function change(kind:'create'|'rename'|'archive'|'restore'):void {
    if(!scope||readOnly||!project||composing.current||pendingRef.current)return
    const c=page?.conversation,title=(kind==='create'?newTitle:kind==='rename'?rename:c?.title??'').trim()
    if(!title){setIssue('Enter a conversation title.');return}
    if(kind!=='create'&&!c)return
    const input:ConversationRequest={...scope,action:'change',operationId:crypto.randomUUID(),conversationId:kind==='create'?crypto.randomUUID():c!.id,expectedRevision:kind==='create'?null:c!.revisionId,title,state:kind==='archive'?'archived':kind==='rename'?c!.state:'active'}
    void request(input)
  }
  async function attach(kind:'none'|'section'|'passage'):Promise<void> {
    if(!scope||!selected||locked.current||pendingRef.current||readOnly||page?.conversation.state!=='active')return
    if(kind==='none'){update({source:{kind:'none'}});return}
    const s=current.current,editor=s.editorRef.current,original=s.project
    if(!original||!editor||editor.isDestroyed||editorIsComposing(editor)||s.composition.current){setIssue('Finish composing in the manuscript first.');return}
    const document=editor.state.doc,ranges=kind==='passage'?selectedRanges(editor):null
    if(kind==='passage'&&!ranges){setIssue('Select a continuous text passage in the manuscript first. Images and non-text selections are not supported.');return}
    locked.current=true;setBusy(true)
    try{
      const saved=await s.flush(false,'save',['conversations'])
      if(!saved||!belongs(original)||current.current.editorRef.current!==editor||editor.isDestroyed||editorIsComposing(editor)||current.current.project?.documentId!==original.documentId||saved.documentId!==original.documentId||!editor.state.doc.eq(document)){setIssue('The writing changed while being protected. Select the intended passage again.');return}
      const source:CaptureSource=kind==='passage'?{kind,documentId:saved.documentId,revisionId:saved.revisionId,ranges:ranges!}:{kind,documentId:saved.documentId,revisionId:saved.revisionId}
      setDrafts(previous=>({...previous,[selected]:{...(previous[selected]??emptyDraft()),source,review:null}}));setNotice(`${kind==='passage'?'Selected passage':'Current section'} chosen. Review the exact text before saving or sending.`)
    }catch{setIssue('The writing could not be protected for this context. Your draft is kept; choose the intended passage again.')}finally{locked.current=false;setBusy(false)}
  }
  async function review():Promise<void> {
    if(!scope||!selected||!page||page.conversation.state!=='active'||readOnly||active||locked.current||pendingRef.current||composing.current||!draft.text.trim())return
    locked.current=true;setBusy(true);setIssue('')
    const id=selected,original={...draft},account=reviewConnection(connectionRef.current.status)
    try{
      const saved=await current.current.flush(false,'save',['conversations'])
      if(!saved||!belongs(scope))return
      const latest=await window.collie.conversation({...scope,action:'read',conversationId:id,before:null})
      if(!latest.ok||latest.value.type!=='page'){setIssue('The conversation could not be read for review.');return}
      const input:ConversationReview={...scope,action:'review',conversationId:id,expectedRevision:latest.value.conversation.revisionId,expectedHead:saved.headCommitId,captureId:crypto.randomUUID(),createdAt:new Date().toISOString(),prompt:original.text,source:original.source,historyIds:original.historyIds}
      const result=await window.collie.conversation(input)
      if(!belongs(scope)||state.current.selected!==id)return
      if(!sameReviewConnection(account,reviewConnection(connectionRef.current.status))){setIssue('The connection or model changed during review. Your draft is kept; review it again.');return}
      if(result.ok&&result.value.type==='review'){
        const value=result.value;setDrafts(previous=>({...previous,[id]:{...original,review:{input,capture:value.capture,excluded:value.excludedMessages,...account}}}))
      }else setIssue(!result.ok&&result.error.code==='LIMIT_EXCEEDED'?sizeMessage:!result.ok&&result.error.code==='STALE_REVISION'?'The source or conversation changed. Choose the passage or section again, then review.':!result.ok?result.error.message:'Review could not be prepared.')
    }catch{setIssue('Review could not be prepared. Your draft is kept; nothing was sent.')}finally{locked.current=false;setBusy(false)}
  }
  function submit(send:boolean):void {
    const reviewed=draft.review;if(!scope||!reviewed||readOnly||page?.conversation.state!=='active'||active||composing.current||locked.current||pendingRef.current)return
    if(!sameReviewConnection(reviewed,reviewConnection(connectionRef.current.status))){setIssue('The connection or model changed. Review the request again.');return}
    if(send&&!canSend){setIssue('Sending is unavailable. Read the connection status below; you can still save this reviewed request locally.');return}
    void request({...scope,action:'submit',attemptId:crypto.randomUUID(),review:reviewed.input,digest:reviewed.capture.digest,send,connectionId:reviewed.connectionId,model:reviewed.model})
  }
  function retryAsNew(t:ConversationTurn):void {
    if(!selected||draft.text||readOnly||busy||pending)return
    // Context and old account authority are never silently carried into another attempt.
    update({text:t.capture.prompt,source:{kind:'none'},historyIds:[]});setNotice('Prompt copied into a new draft. Choose any context and review it before a new request.')
  }
  function history(id:string,checked:boolean):void {
    const chosen=new Set(draft.historyIds);if(checked)chosen.add(id);else chosen.delete(id)
    if(chosen.size>CONVERSATION_LIMITS.history){setIssue('Choose at most 12 previous messages.');return}
    // Selected messages can span pages; stable transcript ordinals are retained separately.
    const messages=page?.turns.flatMap(t=>t.assistant?[t.user,t.assistant]:[t.user])??[]
    for(const m of messages)historyOrder.current.set(m.id,m.ordinal)
    update({historyIds:[...chosen].sort((a,b)=>(historyOrder.current.get(a)??0)-(historyOrder.current.get(b)??0))})
  }
  const historyOrder=useRef(new Map<string,number>())
  const capability=connections.status?.features.conversation
  const canSend=capability?.state==='available'&&!!draft.review&&sameReviewConnection(draft.review,selectedConnection)&&
    capability.connectionId===draft.review.connectionId&&capability.model===draft.review.model&&!connections.busy&&connections.issue!=='outcome-unknown'&&
    !readOnly&&!busy&&!pending&&!active&&page?.conversation.state==='active'&&session.available&&!session.closing&&!session.navigating
  return {items,total,query,setQuery,view,setView,offset,setOffset,selected,page,before,setBefore,draft,update,drafts,newTitle,setNewTitle,rename,setRename,issue,notice,busy,loading,pending,readOnly,active,run,canSend,capability,scope,scroll,composer,choose,change,attach,review,submit,retryAsNew,history,show,request,refresh,composing,draftEvents,
    retry:()=>pendingRef.current?void request(pendingRef.current):scope?void request({...scope,action:'reconcile'}):undefined,
    clear:()=>{if(selected&&!pending&&!busy){setDrafts(previous=>({...previous,[selected]:emptyDraft()}));setIssue('');setNotice('Unsent draft cleared. Saved history was kept.')}},
    recover:()=>scope?void request({...scope,action:'reconcile'}):undefined,
    cancel:(attemptId:string)=>scope?void request({...scope,action:'cancel',attemptId}):undefined,
    protect:(attemptId:string)=>scope?void request({...scope,action:'protect',attemptId}):undefined,
    exportTranscript:(includeContext:boolean)=>scope&&page?void request({...scope,action:'export',conversationId:page.conversation.id,expectedRevision:page.conversation.revisionId,includeContext}):undefined,
    capacity:AI_LIMITS.jobs}
}
type Conversations=ReturnType<typeof useConversationController>
const Context=createContext<Conversations|null>(null)
export function ConversationProvider({children}:{children:ReactNode}):React.JSX.Element {const controller=useConversationController();return <Context.Provider value={controller}>{children}</Context.Provider>}
export function useConversations():Conversations {const value=useContext(Context);if(!value)throw new Error('Conversation owner is missing');return value}
