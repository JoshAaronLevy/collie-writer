import type { ExportOperation } from '../workspace/useExportOperations'
import { projectMessages } from '../../../../shared/projects'
import { AppButton } from '../../components/ui/Controls'
import styles from './ExportWorkspace.module.css'

function message(code: string): string {
  if (code === 'DESTINATION_EXISTS') return 'Existing output kept. Choose another name or folder.'
  return code in projectMessages ? projectMessages[code as keyof typeof projectMessages] : code
}
export default function ExportResults({
  operation,
  cancel
}: {
  operation: ExportOperation
  cancel: () => void
}): React.JSX.Element {
  const { job, issue } = operation
  return (
    <section
      id={`export-result-${job.id}`}
      tabIndex={-1}
      className={styles['export-result']}
      aria-label={`Export from revision ${job.headCommitId.slice(0, 8)}`}
    >
      <p role="status">
        {job.state}: {job.phase}
      </p>
      <p>
        Captured revision {job.headCommitId.slice(0, 8)}. Later writing does not change this export.
      </p>
      {job.files ? (
        <ul>
          {job.files.map((file) => (
            <li key={file.format}>
              <strong>
                {file.format.toUpperCase()}: {file.state}
              </strong>
              <p>{file.path}</p>
              {file.pages ? <p>{file.pages} pages</p> : null}
              {file.error ? <p>{message(file.error)}</p> : null}
              {file.losses.length ? (
                <ul>
                  {file.losses.map((loss, index) => (
                    <li key={index}>{loss}</li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <>
          <p>DOCX destination: {job.destinationPath}</p>
          {job.error ? <p role="alert">{message(job.error)}</p> : null}
          {job.losses.map((loss, index) => (
            <p key={index}>{loss}</p>
          ))}
        </>
      )}
      {job.reportPath ? (
        <details>
          <summary>Retained local report</summary>
          <p>{job.reportPath}</p>
          <p>
            Keep reports and candidates if an outcome is interrupted or uncertain. Review the
            destination before retrying.
          </p>
        </details>
      ) : null}
      {issue ? <p role="alert">{issue}</p> : null}
      {job.state === 'rendering' ? (
        <AppButton variant="default" onClick={cancel}>
          Cancel remaining export work
        </AppButton>
      ) : null}
      {job.state === 'publishing' ? <p>Finishing publication. Keep Collie Writer open.</p> : null}
    </section>
  )
}
