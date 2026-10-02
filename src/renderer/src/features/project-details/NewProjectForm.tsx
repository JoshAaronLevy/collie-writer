import { useState } from 'react'
import { useWorkspaceSession } from '../workspace/WorkspaceSession'
import { kindForTemplate, templateForKind } from '../../../../domain/projects/templates'
import { AppButton } from '../../components/ui/Controls'
import { ProjectDetailsFields } from './ProjectDetailsFields'
import styles from './ProjectDetails.module.css'

/** Transitional usable create form. I05 owns the separate resumable wizard. */
export default function NewProjectForm(): React.JSX.Element {
  const s=useWorkspaceSession(), [attempted,setAttempted]=useState(false)
  const disabled=!s.available||s.acting||s.fileActive||s.closing
  return <form className={styles['project-details-form']} noValidate onSubmit={event=>{event.preventDefault();setAttempted(true);if(!disabled)s.run(s.createProject)}}>
    <ProjectDetailsFields value={{...s.newDetails,projectKind:kindForTemplate(s.newTemplate)}} creating disabled={disabled||!!s.pendingCreate.current} showErrors={attempted}
      onChange={value=>{s.setNewTemplate(templateForKind(value.projectKind));s.setNewDetails({title:value.title,byline:value.byline,description:value.description})}} />
    <AppButton type="submit" disabled={disabled}>{s.pendingCreate.current?'Retry project creation':'Create project'}</AppButton>
  </form>
}
