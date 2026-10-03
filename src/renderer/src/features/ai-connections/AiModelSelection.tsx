import { useId } from 'react'
import { AppButton, SelectField } from '../../components/ui/Controls'
import { useWorkspaceSession } from '../workspace/WorkspaceSession'
import { useAiConnections } from './AiConnectionsProvider'
import { connectionReason } from './connection-copy'
import styles from './AiConnections.module.css'

export function AiModelSelection(): React.JSX.Element | null {
  const connections=useAiConnections(), session=useWorkspaceSession(), heading=useId()
  const {status,pending,busy,issue}=connections
  if (status?.route.kind!=='local-codex-chatgpt'||!status.catalog) return null
  const catalog=status.catalog, connectionId=status.activeConnectionId
  const selected=catalog.state==='loaded'?catalog.models.find(model=>model.id===catalog.selectedModelId):undefined
  const blocked=busy||session.closing||session.navigating||!session.available||issue==='outcome-unknown'
  return <section className={styles['ai-model-selection']} aria-labelledby={heading}>
    <h3 id={heading}>Codex models</h3>
    <p>Refresh reads the catalog reported by your connected Codex runtime. It sends no writing and does not run a model. A listed model may still be refused by your account.</p>
    <AppButton variant="default" disabled={!connectionId||!status.actions.refreshModels||blocked} pending={pending?.kind==='refreshModels'} onClick={event=>{
      if (connectionId) void connections.accountAction('refreshModels',connectionId,event.currentTarget)
    }}>Refresh models</AppButton>
    {catalog.state==='not-loaded'?<p>Connect or resume, then refresh models. Choices stay in memory for this connection.</p>:null}
    {catalog.state==='loading'?<p role="status">Reading the Codex model catalog…</p>:null}
    {catalog.state==='failed'?<p role="alert">{connectionReason[catalog.reason]}</p>:null}
    {catalog.state==='loaded' && catalog.models.length===0?<p role="status">Codex reported no supported visible text models. Refresh later to request another catalog read.</p>:null}
    {catalog.state==='loaded' && catalog.models.length>0?<>
      <SelectField label="Model for future reviewed requests" value={catalog.selectedModelId??''} disabled={!status.actions.selectModel||blocked}
        data={[{value:'',label:'Choose a model',disabled:true},...catalog.models.map(model=>({value:model.id,label:model.label}))]}
        onChange={event=>{
          if (connectionId) void connections.selectModel({connectionId,catalogRevision:catalog.revision,modelId:event.currentTarget.value},event.currentTarget)
        }}/>
      {selected?<p>Selected: {selected.label}. Runtime default effort: {selected.defaultReasoningEffort}. Reported efforts: {selected.reasoningEfforts.join(', ')}. Collie uses the runtime default; this choice starts no request.</p>:null}
    </>:null}
    <div className={styles['ai-execution-availability']}>
      <h3>Text requests unavailable</h3>
      {status.execution?.blockers.map(reason=><p key={reason}>{connectionReason[reason]}</p>)}
      <p>{connectionReason[status.features.conversation.reason]} {connectionReason[status.features.proofread.reason]}</p>
    </div>
  </section>
}
