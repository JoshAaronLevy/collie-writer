import { useRef, useState } from 'react'
import type { AiContentWork } from '../../../../shared/ai'
import { sameScope } from '../../../../shared/project-files'
import { AppButton } from '../../components/ui/Controls'
import { StatusBanner } from '../../components/ui/Feedback'
import { useWorkspaceSession } from '../workspace/WorkspaceSession'
import { useRetainedDraft } from '../workspace/DraftOwner'
import { useAiConnections } from '../ai-connections/AiConnectionsProvider'
import { useConversations } from './conversations/ConversationProvider'
import { useProofreading } from './proofreading/ProofreadingProvider'
import styles from './AiWorkNotice.module.css'

type Pending={work:AiContentWork;action:'cancel'|'protect'}
const key=(work:AiContentWork):string=>`${work.feature}:${work.scope.projectId}:${work.scope.workspaceId}:${work.attemptId}`
const labels:Record<AiContentWork['state'],string>={running:'Request in progress',stopping:'Stop requested; outcome not yet confirmed',protecting:'Protecting the actual outcome locally','protection-required':'Local protection needs attention'}

/** Always mounted. An exact acknowledgment survives removal of its work item. */
export function AiWorkNotice():React.JSX.Element|null {
  const session=useWorkspaceSession(),connections=useAiConnections(),conversations=useConversations(),proofreading=useProofreading()
  const [pending,setPending]=useState<Pending|null>(null),[busy,setBusy]=useState(false),[issue,setIssue]=useState('')
  const held=useRef<Pending|null>(null),locked=useRef(false),region=useRef<HTMLDivElement>(null)
  const work=connections.status?.work??[]
  useRetainedDraft('ai-work-action',{
    read:()=>({scope:pending?.work.scope??{projectId:'',workspaceId:''},kind:'ai-work',entityId:pending?.work.attemptId??null,
      label:'AI stop or protection acknowledgment',dirty:false,composing:false,busy,pendingOperation:pending,policy:'operation',
      target:{kind:'settings',page:'ai'}}),focus:()=>{if(!session.composition.current)region.current?.focus()}
  })
  async function act(input:Pending):Promise<void> {
    if(locked.current||held.current&&held.current!==input)return
    locked.current=true;held.current=input;setPending(input);setBusy(true);setIssue('')
    const request={...input.work.scope,action:input.action,attemptId:input.work.attemptId}
    try {
      const result=input.work.feature==='conversation'?await window.collie.conversation(request):await window.collie.proofreading(request)
      if(!result.ok){
        if(!['UNAVAILABLE','DISK_FULL','PROJECT_LOCKED'].includes(result.error.code)){held.current=null;setPending(null)}
        setIssue(result.error.code==='NOT_FOUND'?'The original local execution binding is missing. Saved history remains readable; this request was not resent.':result.error.message)
      }else {held.current=null;setPending(null)}
      await connections.checkStatus()
    }catch{setIssue('This local acknowledgment is uncertain. Keep Collie open and retry the same action; it cannot send a new request.')}
    finally{locked.current=false;setBusy(false)}
  }
  if(!work.length&&!pending&&!issue)return null
  return <div ref={region} tabIndex={-1} className={styles['ai-work-notice']}>
    <StatusBanner title="AI work" tone={issue||work.some(item=>item.state==='protection-required')?'warning':'info'}>
      <p>Account changes wait for this work to settle. Stop preserves actual partial output and does not guarantee restored usage.</p>
      {issue?<p role="alert">{issue}</p>:null}
      {pending?<AppButton disabled={busy} pending={busy} onClick={()=>void act(pending)}>Retry the same local action</AppButton>:null}
      <ul className={styles['ai-work-list']}>{work.map(item=><li key={key(item)}>
        <p><strong>{item.feature==='conversation'?'Conversation':'Proofreading'}</strong> · {sameScope(session.project,item.scope)?session.project?.title:'Another local project'} · {labels[item.state]}</p>
        <div className={styles['ai-work-actions']}>
          <AppButton variant="subtle" disabled={!sameScope(session.project,item.scope)||busy||session.closing} onClick={()=>item.feature==='conversation'?conversations.show(item.attemptId):proofreading.show(item.attemptId)}>Open saved request</AppButton>
          {item.state==='running'?<AppButton variant="default" disabled={!!pending||busy||session.closing} onClick={()=>void act({work:item,action:'cancel'})}>Stop request</AppButton>:null}
          {item.state==='protection-required'?<AppButton variant="default" disabled={!!pending||busy||session.closing} onClick={()=>void act({work:item,action:'protect'})}>Retry local output protection</AppButton>:null}
        </div>
      </li>)}</ul>
      <AppButton variant="subtle" disabled={connections.checking} onClick={()=>void connections.checkStatus(true)}>Check work status</AppButton>
      {!work.length&&!pending&&issue?<AppButton variant="subtle" onClick={()=>setIssue('')}>Dismiss notice</AppButton>:null}
    </StatusBanner>
  </div>
}
