import type { FileStatus } from '../../../../shared/project-files'
import type { OpenProject } from '../../../../shared/projects'
import { AppButton } from '../../components/ui/Controls'
import { projectFileStatusMessage } from '../projects/project-file-presentation'
import styles from './ProjectStorageSummary.module.css'

export default function ProjectStorageSummary({
  project,
  status,
  dirty,
  disabled,
  reveal,
  openActions
}: {
  project: OpenProject | null
  status: FileStatus | null
  dirty: boolean
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
              <p role="status">{projectFileStatusMessage(status, dirty)}</p>
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
      <p>
        A .collie file opens the whole saved project: writing, research, citations, managed original
        files and saved AI conversations. Account credentials and unsent forms are not included.
      </p>
      <p>
        First Save asks for a location. Later Save updates that file with a captured project;
        further edits may still be local. Normal close protects local writing without updating the
        file. Your cloud provider manages uploads separately.
      </p>
    </section>
  )
}
