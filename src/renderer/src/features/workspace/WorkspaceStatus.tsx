import type { ExportOperation } from './useExportOperations'
import { useWorkspaceSession } from './workspaceContext'
import SaveMenu from './SaveMenu'
import ProjectFileActions from '../projects/ProjectFileActions'
import {
  projectFileNeedsAttention,
  projectFileStatusMessage
} from '../projects/project-file-presentation'
import { sameScope } from '../../../../shared/project-files'
import { AppButton } from '../../components/ui/Controls'
import { StatusBanner } from '../../components/ui/Feedback'
import styles from './WorkspaceNavigation.module.css'
import { useStorageNotices } from '../settings/storageNoticeContext'

export function WorkspaceStatus(): React.JSX.Element {
  const storageAdvice = useStorageNotices()
  const {
    destination,
    project,
    saveState,
    files,
    dirty,
    available,
    busy,
    acting,
    working,
    closing,
    navigating,
    retry,
    committing,
    storage,
    location,
    drafts,
    blocker,
    notice,
    error,
    setError,
    run,
    current,
    outlineRetry,
    performOutline,
    returnToDraft,
    showAccess,
    accessTransition,
    accessReadOnly,
    navigate,
    flush,
    refresh,
    exports,
    chooseProject,
    trackExport
  } = useWorkspaceSession()
  const writing = destination.kind === 'workspace' && destination.view === 'write'
  const operations = drafts
    .states()
    .filter(
      (s) =>
        s.id !== 'project-file-save' &&
        ((s.policy === 'operation' && (s.status || s.issue)) || (s.pendingOperation && !s.busy))
    )
  const fileStateReady = !!project && sameScope(project, files.scope)
  const fileNeedsAttention =
    projectFileNeedsAttention(files, project) || saveState === 'unconfirmed'
  function exportNotice(operation: ExportOperation): React.JSX.Element {
    return (
      <div
        key={operation.job.id}
        className={styles['operation-notice']}
        role={operation.issue || operation.job.error ? 'alert' : 'status'}
      >
        <p>
          Export: {operation.issue || `${operation.job.state} · ${operation.job.phase}`}. Export is
          separate from project-file Save.
        </p>
        <AppButton
          variant="subtle"
          disabled={acting || closing}
          onClick={() =>
            run(async () => {
              if (!sameScope(current.current, operation.scope)) await chooseProject(operation.scope)
              if (sameScope(current.current, operation.scope))
                await navigate({
                  kind: 'workspace',
                  scope: operation.scope,
                  view: 'export',
                  exportResultId: operation.job.id
                })
            })
          }
        >
          View export result
        </AppButton>
        {operation.job.state === 'rendering' ? (
          <AppButton
            variant="default"
            onClick={() => {
              void window.collie
                .cancelDocx({ ...operation.scope, jobId: operation.job.id })
                .then((result) => {
                  if (result.ok) trackExport(operation.scope, result.value)
                  else setError(result.error.message)
                })
                .catch(() =>
                  setError(
                    'Export cancellation could not be confirmed. Its progress and retained result remain available.'
                  )
                )
            }}
          >
            Cancel export
          </AppButton>
        ) : null}
      </div>
    )
  }
  return (
    <div className={`projects ${styles['session-status']}`}>
      {project && destination.kind === 'workspace' && !writing ? (
        <p className={styles['current-project']}>
          {project.title} · {dirty ? 'Changes need local protection' : 'Protected on this device'}
        </p>
      ) : null}
      {notice && !writing ? <p role="status">{notice}</p> : null}
      {storageAdvice.visible.length ? (
        <div className={styles['operation-notice']}>
          <p>{storageAdvice.visible.length} storage notice(s) from the last measurement.</p>
          <AppButton
            variant="subtle"
            disabled={closing || acting}
            onClick={() => void navigate({ kind: 'settings', page: 'data' })}
          >
            Review storage notices
          </AppButton>
        </div>
      ) : null}
      {storage.state === 'unavailable' ? (
        <StatusBanner tone="error" title="Storage unavailable">
          Keep this window open and copy any unprotected writing.
        </StatusBanner>
      ) : null}
      {location?.state === 'required' ? (
        <StatusBanner tone="warning" title="Choose a local working folder">
          <AppButton
            variant="default"
            onClick={() => {
              void navigate({ kind: 'settings', page: 'data' })
            }}
          >
            Open Data and recovery
          </AppButton>
        </StatusBanner>
      ) : null}
      {error ? (
        <StatusBanner tone="error" title="Your attention is needed">
          {error}
        </StatusBanner>
      ) : null}
      {project && retry && !committing ? (
        <StatusBanner tone="error" title="Local protection needs retry">
          <p>Your current writing is retained. Retry keeps the same local operation.</p>
          <AppButton
            disabled={!available || busy || acting || closing || navigating}
            onClick={() =>
              run(async () => {
                await flush()
                await refresh()
              })
            }
          >
            Retry local protection
          </AppButton>
        </StatusBanner>
      ) : null}
      {files.job?.space ||
      files.job?.error === 'DISK_FULL' ||
      exports.some(
        (item) =>
          item.job.space?.length ||
          item.job.error === 'DISK_FULL' ||
          item.job.files?.some((file) => file.error === 'DISK_FULL')
      ) ? (
        <AppButton
          variant="subtle"
          disabled={closing || acting}
          onClick={() => void navigate({ kind: 'settings', page: 'data' })}
        >
          Review storage and recovery
        </AppButton>
      ) : null}
      {blocker ? (
        <StatusBanner tone="warning" title={blocker.label}>
          {blocker.message}
          <div className={styles['session-actions']}>
            <AppButton variant="default" onClick={returnToDraft}>
              Return to pending draft
            </AppButton>
          </div>
        </StatusBanner>
      ) : null}
      {accessTransition || accessReadOnly ? (
        <StatusBanner
          tone="warning"
          title={accessTransition ? 'Editing access changed' : 'Project open for reading'}
        >
          Reading, export and recovery remain available.{' '}
          <AppButton variant="default" onClick={showAccess}>
            Review Collie access
          </AppButton>
        </StatusBanner>
      ) : null}
      {outlineRetry ? (
        <StatusBanner tone="error" title="Outline operation needs reconciliation">
          Your visible writing is retained.{' '}
          <AppButton disabled={working || closing} onClick={() => run(() => performOutline())}>
            Retry pending outline/history operation
          </AppButton>
        </StatusBanner>
      ) : null}
      {operations.map((operation) => (
        <div
          key={operation.id}
          className={styles['operation-notice']}
          role={operation.issue ? 'alert' : 'status'}
        >
          <p>
            {operation.label}:{' '}
            {operation.issue || operation.status || 'Outcome needs reconciliation'}
          </p>
          <AppButton
            variant="subtle"
            onClick={() => {
              void navigate(operation.target)
            }}
          >
            View operation
          </AppButton>
        </div>
      ))}
      {exports.filter((item) => item.job.state !== 'complete' || item.issue).map(exportNotice)}
      {exports.some((item) => item.job.state === 'complete' && !item.issue) ? (
        <details>
          <summary>
            Completed exports ·{' '}
            {exports.filter((item) => item.job.state === 'complete' && !item.issue).length}
          </summary>
          {exports.filter((item) => item.job.state === 'complete' && !item.issue).map(exportNotice)}
        </details>
      ) : null}
      {closing ? (
        <p role="status">Protecting writing and finishing file work before closing…</p>
      ) : null}
      {project && !fileStateReady && !writing ? (
        <p role="status">Checking project-file status…</p>
      ) : null}
      {project &&
      destination.kind === 'workspace' &&
      destination.view !== 'details' &&
      !writing &&
      fileStateReady &&
      !fileNeedsAttention ? (
        <div className={styles['file-summary']}>
          <p>{projectFileStatusMessage(files, dirty)}</p>
          <SaveMenu />
          <AppButton
            variant="subtle"
            onClick={() => {
              void navigate({
                kind: 'workspace',
                scope: { projectId: project.projectId, workspaceId: project.workspaceId },
                view: 'details'
              })
            }}
          >
            Project file actions
          </AppButton>
        </div>
      ) : null}
      {(project || files.job) && (!writing || fileNeedsAttention) ? (
        <details open={fileNeedsAttention || undefined}>
          <summary>
            {fileNeedsAttention
              ? 'Project file needs attention'
              : 'Project file status and progress'}
          </summary>
          <ProjectFileActions />
        </details>
      ) : null}
      {project && dirty && !writing ? (
        <AppButton
          variant="default"
          disabled={acting || closing}
          onClick={() =>
            run(async () => {
              await flush()
              await refresh()
            })
          }
        >
          Protect pending drafts
        </AppButton>
      ) : null}
    </div>
  )
}
