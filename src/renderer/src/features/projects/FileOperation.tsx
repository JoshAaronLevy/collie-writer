import { fileBusy, type FileStatus } from '../../../../shared/project-files'
import type { ProjectResult } from '../../../../shared/projects'
import { AppDialog } from '../../components/ui/AppDialog'
import { AppButton } from '../../components/ui/Controls'
import { useWorkspaceSession } from '../workspace/workspaceContext'
import styles from './ProjectDialogs.module.css'

const phases = {
  reading: 'Reading project file…',
  capture: 'Preparing project…',
  archive: 'Creating project file…',
  staging: 'Preparing destination…',
  replacing: 'Writing project file…',
  verifying: 'Checking saved file…',
  done: 'Finished'
}

export default function FileOperation(): React.JSX.Element | null {
  const { files, error, setError } = useWorkspaceSession()
  const job = files.job
  if (!job || job.kind === 'check') return null
  const active = fileBusy(job)
  const choosing = job.state === 'awaiting-choice' && !!job.inspection
  const consent = job.state === 'awaiting-consent'
  const restoring = job.kind === 'restore' || job.kind === 'recover'
  const local = job.inspection?.local
  function respond(request: Promise<ProjectResult<FileStatus>>): void {
    setError('')
    void request
      .then((result) => {
        if (!result.ok) setError(result.error.message)
      })
      .catch(() =>
        setError(
          'The file action could not be confirmed. Check its status here before trying again.'
        )
      )
  }
  const cancel = (): void => respond(window.collie.cancelFileJob(job.id))
  return (
    <>
      {active && !choosing ? (
        <div role="status">
          <p>{consent ? 'Confirm replacement in the file dialog.' : phases[job.phase]}</p>
          {consent ? (
            <AppButton onClick={() => respond(window.collie.confirmFileOverwrite(job.id))}>
              Review replacement…
            </AppButton>
          ) : null}
          {job.cancellable ? (
            <AppButton variant="subtle" onClick={cancel}>
              Cancel
            </AppButton>
          ) : null}
        </div>
      ) : null}
      <AppDialog
        opened={choosing}
        onClose={cancel}
        title={
          restoring
            ? 'Restore a copy'
            : local
              ? 'Choose a project version'
              : 'Saved project version'
        }
      >
        <p>
          <strong>{job.inspection?.title}</strong>
        </p>
        <p>
          {local && !restoring
            ? 'A local version is already on this computer. Use it, or open the selected file as a separate project. Both versions will be kept.'
            : 'Open this saved version as a separate project. Existing work and files will be kept.'}
        </p>
        {job.inspection ? (
          <p>File saved {new Date(job.inspection.createdAt).toLocaleString()}.</p>
        ) : null}
        <p>The separate project’s first Save asks for a location.</p>
        <p className={styles['project-file-path']}>{job.path}</p>
        {error ? <p role="alert">{error}</p> : null}
        <div className={styles['project-dialog-actions']}>
          {local && !restoring ? (
            <AppButton
              onClick={() =>
                respond(window.collie.answerFileJob({ id: job.id, choice: 'use-local' }))
              }
            >
              Use local version
            </AppButton>
          ) : null}
          <AppButton
            variant={local && !restoring ? 'default' : 'filled'}
            onClick={() =>
              respond(window.collie.answerFileJob({ id: job.id, choice: 'open-copy' }))
            }
          >
            {restoring ? 'Restore a copy' : 'Open file as a copy'}
          </AppButton>
          <AppButton variant="subtle" onClick={cancel}>
            Cancel
          </AppButton>
        </div>
      </AppDialog>
    </>
  )
}
