import { useWorkspaceSession } from './WorkspaceSession'
import FilePanel from '../projects/FilePanel'
import { scopeOf } from './useWorkspaceController'
import { AppButton } from '../../components/ui/Controls'
import { StatusBanner } from '../../components/ui/Feedback'
import styles from './WorkspaceNavigation.module.css'

export function WorkspaceStatus(): React.JSX.Element {
  const { project, fileActive, files, dirty, available, acting, working, closing, storage, location, drafts, blocker, notice, error, setError,
    run, save, current, openFile, outlineRetry, performOutline, returnToDraft, showAccess, accessTransition, accessReadOnly, navigate, flush, refresh } = useWorkspaceSession()
  const operations = drafts.states().filter(s => s.policy === 'operation' && (s.status || s.issue || s.pendingOperation))
  return <div className={styles['session-status']}>
    {project ? <p className={styles['current-project']}>{project.title} · {dirty ? 'Changes need local protection' : 'Protected on this device'}</p> : null}
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
    {closing ? <p role="status">Protecting writing and finishing file work before closing…</p> : null}
    {project || fileActive ? <details open={fileActive || ['external-change','unavailable','interrupted'].includes(files.state)}>
      <summary>Project file and save actions</summary>
{project || fileActive ? <FilePanel status={files} dirty={dirty} disabled={!project || !available || acting || closing} save={as => run(() => save(as))} reveal={()=>run(async()=>{if(!current.current)return;const result=await window.collie.revealProjectFile(scopeOf(current.current));if(!result.ok)setError(result.error.message)})} locate={() => run(() => openFile(false, true))} inspect={() => run(() => openFile(true))} answer={(id, choice) => { void window.collie.answerFileJob({ id, choice }).then(result => { if (!result.ok) setError(result.error.message) }) }} cancel={id => { void window.collie.cancelFileJob(id).then(result => { if (!result.ok) setError(result.error.message) }) }} consent={id => { void window.collie.confirmFileOverwrite(id).then(result => { if (!result.ok) setError(result.error.message) }) }} /> : null}
    </details> : null}
    {project && dirty ? <AppButton variant="default" disabled={acting || closing} onClick={() => run(async () => { await flush(); await refresh() })}>Protect pending drafts</AppButton> : null}
  </div>
}
