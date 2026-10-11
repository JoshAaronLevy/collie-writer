import type { RecoveryIssue } from '../../../../shared/recovery'
import { projectMessages } from '../../../../shared/projects'

export function recoveryHeading(issue: RecoveryIssue): string {
  const project = issue.title ? `“${issue.title}”` : 'a project with an unavailable title'
  if (issue.kind === 'save' && issue.cause === 'DESTINATION_UNAVAILABLE')
    return `The project file for ${project} is unavailable`
  if (issue.kind === 'save' && issue.cause === 'EXTERNAL_CHANGE')
    return `The project file for ${project} has changed`
  if (issue.kind === 'save' || issue.kind === 'backup')
    return `The ${issue.kind} for ${project} could not be confirmed`
  if (issue.kind === 'discovery' && issue.projectId)
    return `The library details for ${project} could not be read`
  if (issue.kind === 'snapshots') return `Saved versions for ${project} could not be read`
  if (issue.kind === 'reset') return 'Projects from an earlier reset could not be read'
  if (issue.kind === 'operation') return 'An interrupted file record could not be read'
  return 'Some recovery information could not be read'
}

export function recoveryExplanation(issue: RecoveryIssue): string {
  if (issue.kind === 'discovery' && issue.projectId)
    return issue.scope
      ? 'Open this project to read its contents and refresh its library details. Its files have been kept.'
      : 'Collie could not identify one local workspace for this project. Its files have been kept; you can open a backup.'
  if (issue.cause === 'DESTINATION_UNAVAILABLE') return 'The project file is unavailable.'
  if (issue.cause === 'EXTERNAL_CHANGE')
    return 'The file differs from the version Collie expected. Recovery has not replaced it.'
  if (issue.cause === 'PROJECT_LOCKED')
    return 'Project work is still active, or another Collie process is using this project. Try again when that work has finished.'
  if (issue.cause) return projectMessages[issue.cause]
  return 'The cause is not yet known. Existing files have been kept.'
}
