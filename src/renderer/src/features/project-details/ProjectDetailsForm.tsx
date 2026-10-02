import { useEffect, useRef, useState } from 'react'
import type { ProjectDetailsInput, OpenProject } from '../../../../shared/projects'
import type { ProjectDetails } from '../../../../domain/projects/details'
import { useWorkspaceSession } from '../workspace/WorkspaceSession'
import { useDraftRegistry, useRetainedDraft } from '../workspace/DraftOwner'
import { AppButton } from '../../components/ui/Controls'
import { ProjectDetailsFields, detailsErrors } from './ProjectDetailsFields'
import styles from './ProjectDetails.module.css'

const fields = (p: OpenProject): ProjectDetails => ({title:p.title,byline:p.byline,description:p.description,projectKind:p.projectKind})
export default function ProjectDetailsForm({ project, disabled, readOnly }: { project: OpenProject; disabled: boolean; readOnly: boolean }): React.JSX.Element {
  const session = useWorkspaceSession(), registry = useDraftRegistry()
  const [value,setValue] = useState(() => fields(project)), [busy,setBusy] = useState(false), [error,setError] = useState(''), [message,setMessage] = useState(''), [attempted,setAttempted] = useState(false)
  const state = useRef({value, baseline:fields(project), revision:project.detailsRevisionId, busy:false, pending:null as ProjectDetailsInput|null})
  const panel = useRef<HTMLFormElement>(null)
  const scope = {projectId:project.projectId,workspaceId:project.workspaceId}
  const dirty = (): boolean => JSON.stringify(state.current.value)!==JSON.stringify(state.current.baseline)
  function change(next: ProjectDetails): void { state.current.value=next;setValue(next);setMessage('');registry.changed() }
  function adopt(next: OpenProject): void { state.current.baseline=fields(next);state.current.revision=next.detailsRevisionId;change(fields(next));setAttempted(false) }
  useEffect(() => { if (!dirty() && !state.current.pending && !state.current.busy) adopt(project) }, [project.detailsRevisionId])
  const binding=useRetainedDraft('project-details',{
    read:()=>({scope,kind:'project-details',entityId:project.projectId,label:'project details',dirty:dirty(),composing:false,busy:state.current.busy,pendingOperation:state.current.pending,policy:'explicit',issue:error||undefined,target:{kind:'workspace',scope,view:'details'}}),focus:()=>panel.current?.focus()
  })
  async function save(): Promise<void> {
    setAttempted(true)
    if (!state.current.pending && Object.values(detailsErrors(state.current.value,false,state.current.baseline.title)).some(Boolean)) return
    state.current.busy=true;setBusy(true);setError('');setMessage('');registry.changed()
    try {
      const saved=await session.flush(false,'save',['project-details'])
      if (!saved) { setError('Finish protecting the other drafts before saving project details.');return }
      state.current.pending ??= {...scope,operationId:crypto.randomUUID(),expectedHead:saved.headCommitId,expectedRevisionId:state.current.revision,...state.current.value,title:state.current.value.title===state.current.baseline.title?state.current.value.title:state.current.value.title.trim(),byline:state.current.value.byline.trim()}
      registry.changed()
      const result=await window.collie.updateProjectDetails(state.current.pending)
      if (!result.ok) {
        if (result.error.code!=='UNAVAILABLE') state.current.pending=null
        setError(result.error.code==='UNAVAILABLE'?'The save result is unknown. Retry this exact save before changing the fields.':result.error.message)
        return
      }
      state.current.pending=null;session.acceptProjectDetails(result.value);adopt(result.value)
      setMessage('Project details are protected on this device. Save updates the selected project file.');await session.refresh()
    } catch { setError('The save result is unknown. Keep this form open and retry the same save.') }
    finally { state.current.busy=false;setBusy(false);registry.changed() }
  }
  async function reload(): Promise<void> {
    state.current.busy=true;setBusy(true);registry.changed()
    try {
      const result=await window.collie.openSection({...scope,documentId:project.documentId})
      if (!result.ok) {setError(result.error.message);return}
      session.acceptProjectDetails(result.value);adopt(result.value);setError('');setMessage('The form now shows the saved project details.')
    } catch {setError('Saved details are unavailable. The form was kept.')}
    finally {state.current.busy=false;setBusy(false);registry.changed()}
  }
  return <form ref={panel} tabIndex={-1} {...binding} className={styles['project-details-form']} aria-labelledby="project-details-heading" noValidate onSubmit={event=>{event.preventDefault();if(!disabled&&!readOnly&&!busy)session.run(save)}}>
    <h2 id="project-details-heading">Project details</h2>
    <ProjectDetailsFields value={value} onChange={change} creating={false} disabled={disabled||readOnly||busy||!!state.current.pending} showErrors={attempted} originalTitle={state.current.baseline.title} />
    <div className={styles['project-details-actions']}>
      <AppButton type="submit" disabled={disabled||readOnly||busy||!dirty()&&!state.current.pending}>{state.current.pending?'Retry details save':'Save project details'}</AppButton>
      <AppButton variant="default" disabled={disabled||busy||!!state.current.pending} onClick={()=>session.run(reload)}>Replace form with saved details</AppButton>
    </div>
    <p className={styles['project-type-description']}>The project title is independent of its filename. Author and description stay with this project, including its backups and independent copies.</p>
    {error?<p role="alert">{error}</p>:null}{message?<p role="status">{message}</p>:null}
  </form>
}
