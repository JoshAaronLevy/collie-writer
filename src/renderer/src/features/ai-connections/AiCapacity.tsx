import { sameScope } from '../../../../shared/project-files'
import { AppButton } from '../../components/ui/Controls'
import { useWorkspaceSession } from '../workspace/WorkspaceSession'
import { useAiConnections } from './AiConnectionsProvider'
import styles from './AiConnections.module.css'

/** One main-owned capacity count for both tools, including closed originals. */
export function AiCapacity():React.JSX.Element|null {
  const session=useWorkspaceSession(),{status}=useAiConnections(),capacity=status?.capacity
  if(!capacity)return null
  const scopes=new Map([...capacity.projects,...(status?.work??[]).map(item=>item.scope)].map(scope=>[`${scope.projectId}:${scope.workspaceId}`,scope]))
  const others=[...scopes.values()].filter(scope=>!sameScope(scope,session.project))
  return <section className={styles['ai-capacity']} aria-label="Local AI capacity">
    <h3>Local AI capacity</h3>
    <p>{capacity.used===null?'Local AI capacity could not be read.':`${capacity.used} of ${capacity.limit} active AI slots used across local projects.`}</p>
    <p>Completed outcomes release a slot after they are saved in their original project. Other outcomes stay retained until you acknowledge them in the AI work notice. Saved history and encrypted records are kept.</p>
    {status?.work.some(item=>item.state==='record-unavailable')?<p>An execution binding also needs recovery. If its original protected record is missing, that feature's binding stays reserved even when the active slot count is lower.</p>:null}
    {others.length?<><p>Open the original projects below to finish local recovery. Independent copies cannot release their slots.</p>
      <ul>{others.map(scope=>{const project=session.list.projects.find(item=>sameScope(item,scope));return <li key={`${scope.projectId}:${scope.workspaceId}`}>
        {project?<AppButton variant="subtle" disabled={session.busy||session.closing||session.navigating} onClick={()=>void session.chooseProject(scope)}>Open {project.title}{project.archived?' (archived)':''}</AppButton>:<span>An original project is unavailable in this library. Keep its local working files and use Settings → Recovery.</span>}
      </li>})}</ul></>:null}
  </section>
}
