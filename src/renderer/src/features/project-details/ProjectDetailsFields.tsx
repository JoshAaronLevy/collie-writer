import { TextInput } from '@mantine/core'
import { SelectField, TextareaField } from '../../components/ui/Controls'
import { projectTemplates, projectTypes, templateForKind, type ProjectKind } from '../../../../domain/projects/templates'
import { requiredProjectName, projectText, type ProjectDetails } from '../../../../domain/projects/details'
import styles from './ProjectDetails.module.css'

export function detailsErrors(value: ProjectDetails, creating: boolean, originalTitle?: string): Partial<Record<keyof ProjectDetails, string>> {
  return {
    title: value.title === originalTitle || requiredProjectName(value.title.trim()) ? undefined : 'Enter a title of 1–500 characters without line breaks or control characters.',
    byline: !creating && value.byline === '' || requiredProjectName(value.byline.trim()) ? undefined : 'Enter an author or byline of 1–500 characters.',
    description: projectText(value.description,10000) ? undefined : 'Use up to 10,000 characters, without invalid control characters.'
  }
}
export function ProjectDetailsFields({ value, onChange, disabled, creating, showErrors, originalTitle }: {
  value: ProjectDetails; onChange: (value: ProjectDetails) => void; disabled: boolean; creating: boolean; showErrors: boolean; originalTitle?: string
}): React.JSX.Element {
  const errors = showErrors ? detailsErrors(value,creating,originalTitle) : {}
  const selected = projectTypes[templateForKind(value.projectKind)]
  return <div className={styles['project-details-fields']}>
    <SelectField label="Project type" value={value.projectKind} disabled={disabled} onChange={event => onChange({...value,projectKind:event.currentTarget.value as ProjectKind})}
      data={projectTemplates.map(template => ({value:projectTypes[template].kind,label:projectTypes[template].name}))} />
    {value.projectKind==='study-critique'?<p className={styles['project-type-description']}>Build a research-supported argument against a study or publication. Add its PDF or link through the existing Sources tools after creating the project.</p>:null}
    <p className={styles['project-type-description']}>{creating?`Starts with empty sections: ${selected.sections.join(', ')}.`:'Changing the type keeps every existing section and its writing.'}</p>
    <TextInput label="Project title" required value={value.title} disabled={disabled} error={errors.title} errorProps={{role:'alert'}} onChange={event => onChange({...value,title:event.currentTarget.value})} />
    <TextInput label="Author / byline" required={creating} value={value.byline} disabled={disabled} error={errors.byline} errorProps={{role:'alert'}} description={creating?'Use your name, a pen name, or a shared byline.':'Older projects may leave this blank.'} onChange={event => onChange({...value,byline:event.currentTarget.value})} />
    <TextareaField label="Description (optional)" rows={4} value={value.description} disabled={disabled} error={errors.description} description="For your project notes. Exports leave it out unless you explicitly include it in document properties." onChange={event => onChange({...value,description:event.currentTarget.value})} />
  </div>
}
