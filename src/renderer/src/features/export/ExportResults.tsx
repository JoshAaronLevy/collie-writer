import { useState } from 'react'
import type { ExportOperation } from '../workspace/useExportOperations'
import type { ExportFormat } from '../../../../shared/exports'
import { projectMessages } from '../../../../shared/projects'
import { AppButton } from '../../components/ui/Controls'
import { spaceMessage } from '../../../../shared/storage-space'
import { useWorkspaceSession } from '../workspace/workspaceContext'
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
  const { navigate, closing, acting } = useWorkspaceSession()
  const [revealError, setRevealError] = useState('')
  async function showFile(format: ExportFormat): Promise<void> {
    setRevealError('')
    try {
      const result = await window.collie.revealExport({ ...operation.scope, jobId: job.id, format })
      if (!result.ok)
        setRevealError(
          result.error.code === 'NOT_FOUND'
            ? 'The exported file is no longer at this location.'
            : result.error.message
        )
    } catch {
      setRevealError('The exported file could not be shown. Its location is listed below.')
    }
  }
  const files = job.files ?? [
    {
      format: 'docx' as const,
      path: job.destinationPath,
      state:
        job.state === 'complete'
          ? 'complete'
          : job.state === 'cancelled'
            ? 'cancelled'
            : ['rendering', 'publishing'].includes(job.state)
              ? 'pending'
              : 'failed',
      error: job.error,
      pages: null,
      losses: job.losses
    }
  ]
  return (
    <section
      id={`export-result-${job.id}`}
      tabIndex={-1}
      className={styles['export-result']}
      aria-label="Export result"
    >
      <h2 role="status">
        {job.state === 'complete'
          ? 'Export complete'
          : job.state === 'cancelled'
            ? 'Export cancelled'
            : job.state === 'interrupted'
              ? 'Export interrupted'
              : job.state === 'failed'
                ? 'Export stopped'
                : 'Exporting…'}
      </h2>
      {job.state !== 'complete' ? <p>{job.phase}</p> : null}
      <ul>
        {files.map((file) => (
          <li key={file.format}>
            <strong>
              {file.format === 'text'
                ? 'Plain text'
                : file.format === 'markdown'
                  ? 'Markdown'
                  : file.format.toUpperCase()}
              :{' '}
              {file.state === 'complete'
                ? 'Ready'
                : file.state === 'pending'
                  ? 'Preparing'
                  : file.state === 'cancelled'
                    ? 'Cancelled'
                    : 'Not completed'}
            </strong>
            <p>{file.path}</p>
            {file.pages ? <p>{file.pages} pages</p> : null}
            {file.error ? <p role="alert">{message(file.error)}</p> : null}
            {file.losses.length ? (
              <ul>
                {file.losses.map((loss, index) => (
                  <li key={index}>{loss}</li>
                ))}
              </ul>
            ) : null}
            {file.state === 'complete' ? (
              <AppButton
                variant="default"
                disabled={closing || acting}
                onClick={() => void showFile(file.format)}
              >
                Show file
              </AppButton>
            ) : null}
          </li>
        ))}
      </ul>
      {job.reportPath ? (
        <details>
          <summary>Export report</summary>
          <p>{job.reportPath}</p>
          <p>
            Interrupted outputs and candidates are kept. Inspect the destination before retrying an
            uncertain export.
          </p>
        </details>
      ) : null}
      {issue || revealError ? <p role="alert">{issue || revealError}</p> : null}
      {job.space?.map((space, index) => (
        <p key={index} role="alert">
          {spaceMessage(space)}
        </p>
      ))}
      {job.space?.length ||
      job.error === 'DISK_FULL' ||
      job.files?.some((file) => file.error === 'DISK_FULL') ? (
        <>
          {!job.space?.length ? (
            <p>
              The failing volume and additional bytes are unknown. Check the working folder and the
              destinations above.
            </p>
          ) : null}
          <AppButton
            variant="default"
            disabled={closing || acting}
            onClick={() => void navigate({ kind: 'settings', page: 'data' })}
          >
            Open Storage
          </AppButton>
        </>
      ) : null}
      {job.state === 'rendering' ? (
        <AppButton variant="default" disabled={closing || acting} onClick={cancel}>
          Cancel export
        </AppButton>
      ) : null}
      {job.state === 'publishing' ? (
        <p>Finishing the current file. Keep Collie Writer open.</p>
      ) : null}
    </section>
  )
}
