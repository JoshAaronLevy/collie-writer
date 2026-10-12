import { RecoveryNotice } from '../recovery/RecoveryNotice'
import { useRecovery } from '../recovery/recoveryContext'
import { useProjectImport } from '../imports/importContext'
import type { ExportOperation } from './useExportOperations'
import { useWorkspaceSession } from './workspaceContext'
import SaveMenu from './SaveMenu'
import FileOperation from '../projects/FileOperation'
import {
  projectFileNeedsAttention,
  projectFilePresentation
} from '../projects/project-file-presentation'
import { sameScope } from '../../../../shared/project-files'
import { AppButton } from '../../components/ui/Controls'
import { StatusBanner } from '../../components/ui/Feedback'
import styles from './WorkspaceNavigation.module.css'
import { useStorageNotices } from '../settings/storageNoticeContext'

export function WorkspaceStatus(): React.JSX.Element {
  const recovery = useRecovery()
  const storageAdvice = useStorageNotices()
  const projectImport = useProjectImport()
  const {
    destination,
    project,
    list,
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
    trackExport,
    dismissExportNotice,
    setLocalCopyTarget
  } = useWorkspaceSession()
  const writing = destination.kind === 'workspace' && destination.view === 'write'
  const storageVisible = destination.kind === 'settings' && destination.page === 'data'
  const exportVisible = destination.kind === 'workspace' && destination.view === 'export'
  const operations = drafts
    .states()
    .filter(
      (s) =>
        !['project-file-save', 'ai-work-action', 'conversations', 'proofreading'].includes(s.id) &&
        !(
          sameScope(project, s.scope) &&
          destination.kind === 'workspace' &&
          ['search-index', 'export-preparation', 'writing-import'].includes(s.kind) &&
          s.target.kind === 'workspace' &&
          s.target.view === destination.view
        ) &&
        ((s.policy === 'operation' && (s.status || s.issue)) || (s.pendingOperation && !s.busy))
    )
  const fileStateReady = !!project && sameScope(project, files.scope)
  const fileNeedsAttention =
    projectFileNeedsAttention(files, project) || saveState === 'unconfirmed'
  const filePresentation = projectFilePresentation(project, files, dirty, saveState)
  const exportNotices = exports.filter(
    (item) =>
      !item.noticeDismissed &&
      !(exportVisible && sameScope(project, item.scope)) &&
      (item.job.state !== 'complete' ||
        item.issue ||
        item.job.error ||
        item.job.space?.length ||
        item.job.losses.length ||
        item.job.files?.some((file) => file.state !== 'complete' || file.losses.length))
  )
  function exportNotice(operation: ExportOperation): React.JSX.Element {
    return (
      <div
        key={operation.job.id}
        className={styles['operation-notice']}
        role={operation.issue || operation.job.error ? 'alert' : 'status'}
      >
        <p>
          Export ·{' '}
          {list.projects.find((item) => sameScope(item, operation.scope))?.title ??
            'Another local project'}
          :{' '}
          {operation.issue ||
            (operation.job.state === 'complete'
              ? 'Finished with omissions or formatting limits.'
              : operation.job.state === 'rendering' || operation.job.state === 'publishing'
                ? 'Exporting…'
                : operation.job.state === 'cancelled'
                  ? 'Export stopped. Completed files are kept.'
                  : 'Export needs attention. Existing files are kept.')}
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
        {!['rendering', 'publishing'].includes(operation.job.state) ? (
          <AppButton
            variant="subtle"
            title="The result stays available in Export"
            onClick={() => dismissExportNotice(operation.job.id)}
          >
            Dismiss notice
          </AppButton>
        ) : null}
      </div>
    )
  }
  return (
    <div className={`projects ${styles['session-status']}`}>
      {storageAdvice.visible.length && !storageVisible ? (
        <div className={styles['operation-notice']}>
          <p>Storage needs attention. Review the affected project or disk space.</p>
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
      {location?.state === 'required' && destination.kind !== 'setup' && !storageVisible ? (
        <StatusBanner tone="warning" title="Choose a local working folder">
          <AppButton
            variant="default"
            onClick={() => {
              void navigate({ kind: 'settings', page: 'data' })
            }}
          >
            Open Storage
          </AppButton>
        </StatusBanner>
      ) : null}
      <RecoveryNotice />
      {error &&
      !recovery.opened &&
      error !== blocker?.message &&
      !(project && retry && !committing) &&
      !(files.job?.state === 'awaiting-choice' && files.job.inspection) ? (
        <StatusBanner tone="error" title="Your attention is needed">
          {error}
        </StatusBanner>
      ) : null}
      {project && retry && !committing ? (
        <StatusBanner tone="error" title="Recent changes may be unsaved">
          <p>
            Collie could not confirm saving recent changes on this computer. Keep this window open.
            Retry saving your visible writing, or copy it elsewhere if saving remains unavailable.
          </p>
          {error ? <p>{error}</p> : null}
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
      {(accessTransition || accessReadOnly) &&
      destination.kind !== 'setup' &&
      !(destination.kind === 'settings' && destination.page === 'access') ? (
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
            disabled={closing || navigating}
            onClick={(event) => {
              if (operation.kind === 'working-copy-removal') setLocalCopyTarget(operation.scope)
              else if (
                operation.kind.startsWith('project-import') &&
                sameScope(current.current, operation.scope)
              )
                projectImport.open(event.currentTarget)
              else void navigate(operation.target)
            }}
          >
            {operation.kind.startsWith('project-import') ? 'Return to import' : 'View operation'}
          </AppButton>
        </div>
      ))}
      {exportNotices.map(exportNotice)}
      {closing ? (
        <p role="status">Protecting writing and finishing file work before closing…</p>
      ) : null}
      {project && !fileStateReady && !writing ? (
        <p role="status">Checking project-file status…</p>
      ) : null}
      {project &&
      destination.kind === 'workspace' &&
      fileStateReady &&
      !recovery.opened &&
      (!writing || fileNeedsAttention) ? (
        <div className={styles['file-summary']} role={fileNeedsAttention ? 'alert' : 'status'}>
          <div>
            <p>{filePresentation.label}</p>
            {fileNeedsAttention ? <p>{filePresentation.detail}</p> : null}
          </div>
          <SaveMenu />
        </div>
      ) : null}
      {!recovery.opened ? <FileOperation /> : null}
    </div>
  )
}
