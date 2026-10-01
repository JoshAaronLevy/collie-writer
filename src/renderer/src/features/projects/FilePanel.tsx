import { fileBusy, type FileChoice, type FileStatus } from '../../../../shared/project-files'
import { projectMessages } from '../../../../shared/projects'

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
    saved: dirty ? 'The chosen file contains the last saved revision. New typing is not yet protected.' : `Saved to chosen location at revision ${destination?.headCommitId.slice(0, 8) ?? ''}.`,
    pending: 'Newer edits protected locally. The chosen file has an earlier revision.',
    'external-change': 'The chosen file changed externally. Local writing and the external file are separate versions.',
    unavailable: 'Destination unavailable. Local recovery remains on this computer.',
    interrupted: 'A previous file operation was interrupted. Retained candidates and previous files need inspection.'
  }
  return <section className="file-panel" aria-labelledby="file-heading" id="project-file" tabIndex={-1}>
    <h2 id="file-heading">Project file</h2>
    {destination ? <p className="location-path">{destination.path}</p> : <p>No file destination selected.</p>}
    <p role="status">{active && job?.kind === 'save' ? 'Saving to chosen location…' : labels[status.state]}</p>
    <div className="project-actions">
      <button disabled={disabled || active} onClick={() => save(false)}>{status.state === 'unavailable' ? 'Retry Save' : 'Save…'}</button>
      <button disabled={disabled || active} onClick={() => save(true)}>Save As…</button>
      {destination ? <><button disabled={disabled || active} onClick={reveal}>Show project file</button><button disabled={disabled || active} onClick={locate}>Locate moved file…</button><button disabled={disabled || active} onClick={inspect}>Inspect saved file</button></> : null}
    </div>
    {status.state === 'external-change' || status.state === 'interrupted' ? <p>Inspect the saved file to open a separate copy, or use Save As to keep your local branch in another file. No versions are merged automatically.</p> : null}
    {active && job ? <div className="file-progress" aria-live="polite">
      <p>{phases[job.phase]} · {(job.bytes / (1024 * 1024)).toFixed(1)} MiB processed{job.capturedHead ? ` · captured revision ${job.capturedHead.slice(0, 8)}` : ''}</p>
      <p>Progress includes several read/write passes. It is not an upload percentage.</p>
      {job.state === 'awaiting-consent' ? <button onClick={() => consent(job.id)}>Review replacement…</button> : null}
      {job.cancellable ? <button onClick={() => cancel(job.id)}>Cancel file operation</button> : <p>Finishing the replacement and acknowledgment. Keep Collie Writer open.</p>}
    </div> : null}
    {job?.state === 'awaiting-choice' && job.inspection ? <div className="file-inspection">
      <h3>{restoring ? 'Restore an independent copy' : 'File ready to open'}</h3>
      <p>{job.inspection.title} · project {job.inspection.projectId.slice(0, 8)} · revision {job.inspection.headCommitId.slice(0, 8)}</p>
      <p className="location-path">{job.path}</p>
      <p>{restoring ? 'Restore keeps current work intact and opens a new identity without a destination.' : job.inspection.local ? 'This project already has local work. Open an independent copy of the incoming file to compare it, or keep your local version.' : 'The file has been read into local storage. Choose how to open it.'}</p>
      <div className="project-actions">
        {restoring ? null : job.inspection.local ? <button onClick={() => answer(job.id, 'use-local')}>Keep local version</button> : <button onClick={() => answer(job.id, 'import')}>Open project</button>}
        <button onClick={() => answer(job.id, 'open-copy')}>{restoring ? 'Restore as new project' : 'Open independent copy'}</button>
        <button onClick={() => cancel(job.id)}>Cancel</button>
      </div>
      <p>An independent copy starts without a destination. Its first Save asks for a new location.</p>
    </div> : null}
    {job?.error ? <p role="alert">{projectMessages[job.error]}</p> : null}
    <p>Saved means this file was written and reopened. Your cloud provider manages uploads separately. Destination autosave runs after 30 seconds of idle writing; use Save for an immediate commit.</p>
  </section>
}
