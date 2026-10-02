import { useWorkspaceSession } from './WorkspaceSession'
import ProjectFileActions from '../projects/ProjectFileActions'
import { sameScope } from '../../../../shared/project-files'
import { AppButton } from '../../components/ui/Controls'
import { StatusBanner } from '../../components/ui/Feedback'
import styles from './WorkspaceNavigation.module.css'

export function WorkspaceStatus(): React.JSX.Element {
  const { destination, project, fileActive, files, dirty, available, acting, working, closing, storage, location, drafts, blocker, notice, error, setError,
    run, save, current, outlineRetry, performOutline, returnToDraft, showAccess, accessTransition, accessReadOnly, navigate, flush, refresh,
    exports, chooseProject, trackExport } = useWorkspaceSession()
  const operations = drafts.states().filter(s => s.policy === 'operation' && (s.status || s.issue) || s.pendingOperation && !s.busy)
  const fileStateReady = !!project && sameScope(project,files.scope)
  const fileNeedsAttention = fileActive || fileStateReady && ['checking','external-change','unavailable','interrupted'].includes(files.state)
  return <div className={`projects ${styles['session-status']}`}>
    {project && destination.kind === 'workspace' ? <p className={styles['current-project']}>{project.title} · {dirty ? 'Changes need local protection' : 'Protected on this device'}</p> : null}
    {notice ? <p role="status">{notice}</p> : null}
    {storage.state === 'unavailable' ? <StatusBanner tone="error" title="Storage unavailable">Keep this window open and copy any unprotected writing.</StatusBanner> : null}
    {location?.state === 'required' ? <StatusBanner tone="warning" title="Choose a local working folder"><AppButton variant="default" onClick={() => { void navigate({kind:'settings',page:'data'}) }}>Open Data and recovery</AppButton></StatusBanner> : null}
    {error ? <StatusBanner tone="error" title="Your attention is needed">{error}</StatusBanner> : null}
    {blocker ? <StatusBanner tone="warning" title={blocker.label}>{blocker.message}<div className={styles['session-actions']}><AppButton variant="default" onClick={returnToDraft}>Return to pending draft</AppButton></div></StatusBanner> : null}
    {accessTransition || accessReadOnly ? <StatusBanner tone="warning" title={accessTransition ? 'Editing access changed' : 'Project open for reading'}>
      Reading, export and recovery remain available. <AppButton variant="default" onClick={showAccess}>Review Collie access</AppButton>
    </StatusBanner> : null}
    {outlineRetry ? <StatusBanner tone="error" title="Outline operation needs reconciliation">Your visible writing is retained. <AppButton disabled={working || closing} onClick={() => run(() => performOutline())}>Retry pending outline/history operation</AppButton></StatusBanner> : null}
    {operations.map(operation => <div key={operation.id} className={styles['operation-notice']} role={operation.issue ? 'alert' : 'status'}>
      <p>{operation.label}: {operation.issue || operation.status || 'Outcome needs reconciliation'}</p>
      <AppButton variant="subtle" onClick={() => { void navigate(operation.target) }}>View operation</AppButton>
    </div>)}
    {exports.map(operation => <div key={operation.job.id} className={styles['operation-notice']} role={operation.issue || operation.job.error ? 'alert' : 'status'}>
      <p>Export: {operation.issue || `${operation.job.state} · ${operation.job.phase}`}. Export is separate from project-file Save.</p>
      <AppButton variant="subtle" disabled={acting || closing} onClick={() => run(async () => {
        if (!sameScope(current.current, operation.scope)) await chooseProject(operation.scope)
        if (sameScope(current.current, operation.scope)) await navigate({kind:'workspace',scope:operation.scope,view:'export'})
      })}>View export result</AppButton>
      {operation.job.state === 'rendering' ? <AppButton variant="default" onClick={() => {
        void window.collie.cancelDocx({...operation.scope,jobId:operation.job.id}).then(result => {
          if (result.ok) trackExport(operation.scope,result.value); else setError(result.error.message)
        }).catch(() => setError('Export cancellation could not be confirmed. Its progress and retained result remain available.'))
      }}>Cancel export</AppButton> : null}
    </div>)}
    {closing ? <p role="status">Protecting writing and finishing file work before closing…</p> : null}
    {project && !fileStateReady ? <p role="status">Checking project-file status…</p> : null}
    {project && destination.kind === 'workspace' && destination.view !== 'details' && fileStateReady && !fileNeedsAttention ? <div className={styles['file-summary']}>
      <p>{!project.destination ? 'Protected locally · no project file selected' : files.state === 'pending' ? 'Newer writing protected locally · selected file is older' : 'Selected project file saved on this device'}</p>
      <AppButton variant="default" disabled={!available || acting || closing} onClick={() => run(() => save(false))}>Save project file</AppButton>
      <AppButton variant="subtle" onClick={() => { void navigate({kind:'workspace',scope:{projectId:project.projectId,workspaceId:project.workspaceId},view:'details'}) }}>Project file actions</AppButton>
    </div> : null}
    {fileNeedsAttention ? <details open>
      <summary>Project file needs attention</summary><ProjectFileActions />
    </details> : null}
    {project && dirty ? <AppButton variant="default" disabled={acting || closing} onClick={() => run(async () => { await flush(); await refresh() })}>Protect pending drafts</AppButton> : null}
  </div>
}
