import { fileBusy, type FileChoice, type FileStatus } from '../../../../shared/project-files'
import { projectMessages } from '../../../../shared/projects'
import { AppButton } from '../../components/ui/Controls'
import styles from './FilePanel.module.css'

const phases = { reading: 'Reading the file; a cloud placeholder may need downloading', capture: 'Capturing protected writing', archive: 'Building the project file', staging: 'Preparing the chosen location', replacing: 'Replacing the chosen file', verifying: 'Reopening the written file', done: 'Finished' }
export default function FilePanel({ status, dirty, disabled, save, locate, inspect, reveal, answer, cancel, consent }: {
  status: FileStatus; dirty: boolean; disabled: boolean; save: (as: boolean) => void; locate: () => void; inspect: () => void
  reveal: () => void
  answer: (id: string, choice: FileChoice) => void; cancel: (id: string) => void; consent: (id: string) => void
}): React.JSX.Element {
  const restoring = status.job?.kind === 'restore' || status.job?.kind === 'recover'
  const job = status.job, active = fileBusy(job), destination = status.destination
  const labels: Record<FileStatus['state'], string> = {
    unsaved: dirty ? 'New typing is not yet protected. No file destination selected.' : 'Unsaved project — recovery on this computer.', checking: 'Checking the chosen file…',
    saved: dirty ? 'The chosen file contains the last saved writing. New typing is not yet protected.' : 'Saved to the selected file on this device.',
    pending: 'Unsaved changes are protected on this device. Use Save to update the chosen file.',
    'external-change': 'The chosen file differs from its last saved version. Save writes your current local project.',
    unavailable: 'Destination unavailable. Local recovery remains on this computer.',
    interrupted: 'A previous file operation was interrupted. Retained candidates and previous files need inspection.'
  }
  return <section className={styles['project-file-panel']} aria-labelledby="file-heading" id="project-file" tabIndex={-1}>
    <h2 id="file-heading">Project file and Save</h2>
    {destination ? <p className={styles['project-file-path']}>{destination.path}</p> : <p>No file destination selected.</p>}
    <p role="status">{active && job?.kind === 'save' ? 'Saving to chosen location…' : labels[status.state]}</p>
    <div className={styles['project-file-actions']}>
      <AppButton disabled={disabled || active} onClick={() => save(false)}>{status.state === 'unavailable' ? 'Retry Save' : destination ? 'Save' : 'Save…'}</AppButton>
      <AppButton variant="default" disabled={disabled || active} onClick={() => save(true)}>Save As…</AppButton>
      {destination ? <><AppButton variant="subtle" disabled={disabled || active} onClick={reveal}>Show project file</AppButton><AppButton variant="subtle" disabled={disabled || active} onClick={locate}>Locate moved file…</AppButton><AppButton variant="subtle" disabled={disabled || active} onClick={inspect}>Inspect saved file</AppButton></> : null}
    </div>
    {status.state === 'external-change' ? <p>Save replaces this file with your local work and keeps the previous file for recovery. Inspect it to compare a separate copy, or use Save As to choose another location.</p> : null}
    {status.state === 'interrupted' ? <p>Your local writing is retained. Retry Save, inspect the file, or review retained versions in Data and recovery.</p> : null}
    {active && job ? <div className={styles['project-file-progress']} aria-live="polite">
      <p>{phases[job.phase]} · {(job.bytes / (1024 * 1024)).toFixed(1)} MiB processed</p>
      <p>Progress includes several read/write passes. It is not an upload percentage.</p>
      {job.state === 'awaiting-consent' ? <AppButton onClick={() => consent(job.id)}>Review replacement…</AppButton> : null}
      {job.cancellable ? <AppButton variant="default" onClick={() => cancel(job.id)}>Cancel file operation</AppButton> : <p>Finishing the replacement and acknowledgment. Keep Collie Writer open.</p>}
    </div> : null}
    {job?.state === 'awaiting-choice' && job.inspection ? <div className={styles['project-file-inspection']}>
      <h3>{restoring ? 'Restore an independent copy' : 'File ready to open'}</h3>
      <p>{job.inspection.title}</p>
      <p className={styles['project-file-path']}>{job.path}</p>
      <p>{restoring ? 'Restore keeps current work intact and opens a new identity without a destination.' : job.inspection.local ? 'This project already has local work. Open an independent copy of the incoming file to compare it, or keep your local version.' : 'The file has been read into local storage. Choose how to open it.'}</p>
      <div className={styles['project-file-actions']}>
        {restoring ? null : job.inspection.local ? <AppButton variant="default" onClick={() => answer(job.id, 'use-local')}>Keep local version</AppButton> : <AppButton onClick={() => answer(job.id, 'import')}>Open project</AppButton>}
        <AppButton onClick={() => answer(job.id, 'open-copy')}>{restoring ? 'Restore as new project' : 'Open independent copy'}</AppButton>
        <AppButton variant="subtle" onClick={() => cancel(job.id)}>Cancel</AppButton>
      </div>
      <p>An independent copy starts without a destination. Its first Save asks for a new location.</p>
    </div> : null}
    {job?.error ? <p role="alert">{projectMessages[job.error]}</p> : null}
    <p>Writing is protected automatically on this device and restored when you reopen Collie Writer. The project file updates only when you save it. Closing keeps unsaved writing locally. Your cloud provider manages uploads separately.</p>
  </section>
}
