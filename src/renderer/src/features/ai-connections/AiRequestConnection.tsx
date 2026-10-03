import { AppButton } from '../../components/ui/Controls'
import { useWorkspaceSession } from '../workspace/WorkspaceSession'
import { useAiConnections } from './AiConnectionsProvider'
import { AiModelSelection } from './AiModelSelection'
import { AiCapacity } from './AiCapacity'
import { DirectConnectionProgress } from './DirectConnectionProgress'
import { connectionLabel, connectionReason, featureDescription, fundingDescription } from './connection-copy'
import styles from './AiConnections.module.css'

/** Both retained writing tools share the same account and model owner. */
export function AiRequestConnection({action,disabled=false}:{action:'conversation'|'proofread';disabled?:boolean}):React.JSX.Element {
  const connections=useAiConnections(),session=useWorkspaceSession(),status=connections.status
  const account=status?.connections.find(item=>item.id===status.activeConnectionId),capability=status?.features[action]
  const blocked=disabled||session.closing||session.navigating
  const accountBlocked=blocked||connections.busy||!session.available||connections.issue==='outcome-unknown'
  return <section className={styles['ai-request-connection']} data-ai-connection-surface aria-label={`${action==='conversation'?'Conversation':'Proofreading'} connection`}>
    <h2 tabIndex={-1}>{status?.direct?'ChatGPT plan connection':'Codex connection'}</h2>
    <p role="status">{connectionLabel(status,connections.checking,connections.pending?.kind)}{account?` · ${account.label}`:''}</p>
    <p>{capability?featureDescription(capability):'Check connection status to read availability. Local review and saving do not need an AI connection.'}</p>
    {connections.issue?<p className={styles['ai-request-error']} role="alert">{connectionReason[connections.issue]}</p>:null}
    {status?.local?.issue?<p>{connectionReason[status.local.issue]}</p>:null}
    <div className={styles['ai-request-actions']}>
      <AppButton variant="default" disabled={blocked} onClick={()=>void session.navigate({kind:'settings',page:'ai'})}>{account?'Open connection settings':status?.direct?'Connect ChatGPT…':'Connect Codex…'}</AppButton>
      {status?.actions.resume&&account?<AppButton variant="default" disabled={accountBlocked} onClick={event=>void connections.accountAction('resume',account.id,event.currentTarget)}>Resume Codex connection</AppButton>:null}
      {status?.local?.protectionPending||status?.direct?.protectionPending?<AppButton disabled={accountBlocked||!status.actions.protectConnection} onClick={event=>void connections.localAction('protectConnection',event.currentTarget)}>Retry saving connection state</AppButton>:null}
      {connections.waiting?<AppButton variant="default" disabled={!connections.canCancel} onClick={()=>void connections.cancel()}>Cancel sign-in</AppButton>:null}
      <AppButton variant="subtle" disabled={blocked||connections.checking||!session.available} onClick={()=>void connections.checkStatus(true)}>Check connection status</AppButton>
    </div>
    <DirectConnectionProgress status={status}/>
    <details><summary>Choose model and view availability</summary><AiModelSelection disabled={blocked}/></details>
    <AiCapacity/>
    {status?<p className={styles['ai-sharing-note']}>{fundingDescription(status.funding)}</p>:null}
  </section>
}
