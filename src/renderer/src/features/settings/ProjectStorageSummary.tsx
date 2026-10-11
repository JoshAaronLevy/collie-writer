import type { FileStatus } from '../../../../shared/project-files'
import type { OpenProject } from '../../../../shared/projects'
import { AppButton } from '../../components/ui/Controls'
import {
  projectFilePresentation,
  type SavePresentation
} from '../projects/project-file-presentation'
import styles from './ProjectStorageSummary.module.css'

export default function ProjectStorageSummary({
  project,
  status,
  dirty,
  saveState,
  disabled,
  reveal,
  openActions
}: {
  project: OpenProject | null
  status: FileStatus | null
  dirty: boolean
  saveState: SavePresentation
  disabled: boolean
  reveal: () => void
  openActions: () => void
}): React.JSX.Element {
  return (
    <section className={styles['project-storage-summary']} aria-labelledby="saved-project-heading">
      <h2 id="saved-project-heading">Selected project file</h2>
      {project ? (
        <>
          <p className={styles['project-storage-title']}>{project.title}</p>
          {status ? (
            <>
              <p className={styles['project-storage-path']}>
                {status.destination?.path ?? 'No project file selected yet.'}
              </p>
              <p role="status">
                {projectFilePresentation(project, status, dirty, saveState).label}
              </p>
            </>
          ) : (
            <p role="status">Waiting for this project&apos;s file status…</p>
          )}
          <div className={styles['project-storage-actions']}>
            {status?.destination ? (
              <AppButton variant="subtle" disabled={disabled} onClick={reveal}>
                Show project file
              </AppButton>
            ) : null}
            <AppButton variant="default" disabled={disabled} onClick={openActions}>
              Project file actions
            </AppButton>
          </div>
        </>
      ) : (
        <p>Open a project from Projects to see its selected file and Save status.</p>
      )}
    </section>
  )
}
