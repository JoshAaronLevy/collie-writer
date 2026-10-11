import { IconDeviceFloppy, IconHourglass, IconAlertTriangle } from '@tabler/icons-react'
import { IconButton } from '../../components/ui/IconButton'
import ProjectActionsMenu from '../projects/ProjectActionsMenu'
import { sameScope } from '../../../../shared/project-files'
import { projectFilePresentation } from '../projects/project-file-presentation'
import { useWorkspaceSession } from './workspaceContext'
import styles from './SaveMenu.module.css'

export default function SaveMenu(): React.JSX.Element {
  const {
    project,
    files,
    available,
    busy,
    acting,
    closing,
    navigating,
    fileActive,
    saveState,
    dirty,
    run,
    save
  } = useWorkspaceSession()
  const disabled =
    !project ||
    !sameScope(project, files.scope) ||
    !available ||
    busy ||
    acting ||
    closing ||
    navigating ||
    fileActive
  const saving = saveState === 'saving'
  const unconfirmed = saveState === 'unconfirmed'
  const presentation = projectFilePresentation(project, files, dirty, saveState)
  return (
    <div className={styles['save-menu']} role="group" aria-label="Save project">
      <IconButton
        className={styles['save-button']}
        variant="default"
        pending={saving}
        disabled={disabled}
        label={presentation.saveLabel}
        description={`${presentation.label}. ${presentation.detail}`}
        onClick={() => run(() => save(false))}
      >
        <IconDeviceFloppy aria-hidden="true" />
        {saving || unconfirmed ? (
          <span className={styles['save-state']} aria-hidden="true">
            {saving ? <IconHourglass /> : <IconAlertTriangle />}
          </span>
        ) : null}
      </IconButton>
      {project ? <ProjectActionsMenu project={project} className={styles['save-options']} /> : null}
    </div>
  )
}
