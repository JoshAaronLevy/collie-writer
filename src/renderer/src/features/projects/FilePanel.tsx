import { fileBusy, type FileChoice, type FileStatus } from '../../../../shared/project-files'
import { projectMessages } from '../../../../shared/projects'
import { spaceMessage } from '../../../../shared/storage-space'
import { AppButton } from '../../components/ui/Controls'
import styles from './FilePanel.module.css'
import { projectFileStatusMessage } from './project-file-presentation'
import type { SavePresentation } from './project-file-presentation'
import { useId } from 'react'

const phases = {
  reading: 'Reading the file; a cloud placeholder may need downloading',
  capture: 'Capturing protected writing',
  archive: 'Building the project file',
  staging: 'Preparing the chosen location',
  replacing: 'Replacing the chosen file',
  verifying: 'Reopening the written file',
  done: 'Finished'
}
export default function FilePanel({
  status,
  dirty,
  saveState,
  disabled,
  save,
  locate,
  inspect,
  reveal,
  answer,
  cancel,
  consent
}: {
  status: FileStatus
  dirty: boolean
  saveState: SavePresentation
  disabled: boolean
  save: (as: boolean) => void
  locate: () => void
  inspect: () => void
  reveal: () => void
  answer: (id: string, choice: FileChoice) => void
  cancel: (id: string) => void
  consent: (id: string) => void
}): React.JSX.Element {
  const headingId = useId()
  const restoring = status.job?.kind === 'restore' || status.job?.kind === 'recover'
  const job = status.job,
    active = fileBusy(job),
    destination = status.destination
  return (
    <section className={styles['project-file-panel']} aria-labelledby={headingId} tabIndex={-1}>
      <h2 id={headingId}>Project file and Save</h2>
      {destination ? (
        <p className={styles['project-file-path']}>{destination.path}</p>
      ) : (
        <p>No file destination selected.</p>
      )}
      <p role="status">{projectFileStatusMessage(status, dirty)}</p>
      {saveState === 'unconfirmed' ? (
        <p role="alert">
          Save is not confirmed. Retry Save checks the same request before saving newer edits.
        </p>
      ) : null}
      <div className={styles['project-file-actions']}>
        <AppButton
          pending={saveState === 'saving'}
          disabled={disabled || active}
          onClick={() => save(false)}
        >
          {saveState === 'saving'
            ? 'Saving…'
            : saveState === 'unconfirmed' || status.state === 'unavailable'
              ? 'Retry Save'
              : destination
                ? 'Save'
                : 'Save…'}
        </AppButton>
        <AppButton
          variant="default"
          disabled={disabled || active || saveState === 'unconfirmed'}
          onClick={() => save(true)}
        >
          Save As…
        </AppButton>
        {destination ? (
          <>
            <AppButton variant="subtle" disabled={disabled || active} onClick={reveal}>
              Show project file
            </AppButton>
            <AppButton
              variant="subtle"
              disabled={disabled || active || saveState === 'unconfirmed'}
              onClick={locate}
            >
              Locate moved file…
            </AppButton>
            <AppButton
              variant="subtle"
              disabled={disabled || active || saveState === 'unconfirmed'}
              onClick={inspect}
            >
              Inspect saved file
            </AppButton>
          </>
        ) : null}
      </div>
      {status.state === 'external-change' ? (
        <p>
          Save replaces this file with your local work and keeps the previous file for recovery.
          Inspect it to compare a separate copy, or use Save As to choose another location.
        </p>
      ) : null}
      {status.state === 'interrupted' ? (
        <p>
          Your local writing is retained. Retry Save, inspect the file, or review retained versions
          in Data and recovery.
        </p>
      ) : null}
      {active && job ? (
        <div className={styles['project-file-progress']} aria-live="polite">
          <p>
            {phases[job.phase]} · {(job.bytes / (1024 * 1024)).toFixed(1)} MiB processed
          </p>
          <p>Progress includes several read/write passes. It is not an upload percentage.</p>
          {job.state === 'awaiting-consent' ? (
            <AppButton onClick={() => consent(job.id)}>Review replacement…</AppButton>
          ) : null}
          {job.cancellable ? (
            <AppButton variant="default" onClick={() => cancel(job.id)}>
              Cancel file operation
            </AppButton>
          ) : (
            <p>Finishing the replacement and acknowledgment. Keep Collie Writer open.</p>
          )}
        </div>
      ) : null}
      {job?.state === 'awaiting-choice' && job.inspection ? (
        <div className={styles['project-file-inspection']}>
          <h3>{restoring ? 'Restore an independent copy' : 'File ready to open'}</h3>
          <p>{job.inspection.title}</p>
          <p className={styles['project-file-path']}>{job.path}</p>
          <p>
            {restoring
              ? 'Restore keeps current work intact and opens a new identity without a destination.'
              : job.inspection.local
                ? 'This project already has local work. Open an independent copy of the incoming file to compare it, or keep your local version.'
                : 'The file has been read into local storage. Choose how to open it.'}
          </p>
          <div className={styles['project-file-actions']}>
            {restoring ? null : job.inspection.local ? (
              <AppButton variant="default" onClick={() => answer(job.id, 'use-local')}>
                Keep local version
              </AppButton>
            ) : (
              <AppButton onClick={() => answer(job.id, 'import')}>Open project</AppButton>
            )}
            <AppButton onClick={() => answer(job.id, 'open-copy')}>
              {restoring ? 'Restore as new project' : 'Open independent copy'}
            </AppButton>
            <AppButton variant="subtle" onClick={() => cancel(job.id)}>
              Cancel
            </AppButton>
          </div>
          <p>
            An independent copy starts without a destination. Its first Save asks for a new
            location.
          </p>
        </div>
      ) : null}
      {job?.error && job.state !== 'cancelled' ? (
        <p role="alert">
          {job.space
            ? spaceMessage(job.space)
            : `${projectMessages[job.error]}${job.error === 'DISK_FULL' ? ` Operation: project file ${job.kind}. Destination: ${job.path || 'not selected'}. Additional space and the failing volume are unknown; both the local working folder and destination may need space.` : ''}`}
        </p>
      ) : null}
      <p>
        A .collie file opens the whole saved project, including writing, research, citations,
        managed original files and saved AI conversations. Account credentials and unsent forms are
        not included.
      </p>
      <p>
        Writing is protected automatically on this device and restored when you reopen Collie
        Writer. The project file updates only when you save it. Closing keeps unsaved writing
        locally. Your cloud provider manages uploads separately.
      </p>
    </section>
  )
}
