import { useEffect, useRef, useState } from 'react'
import { BookOpen, FolderOpen, PenLine, Settings } from 'lucide-react'
import type { AppInfo } from '../../shared/commands'
import type { StorageStatus } from '../../shared/storage'
import Projects from './features/projects/Projects'
import { WorkspaceSessionProvider, useWorkspaceSession } from './features/workspace/WorkspaceSession'
import { WorkspaceStatus } from './features/workspace/WorkspaceStatus'
import { RetainedRegion } from './features/workspace/RetainedRegion'
import { ActionMenu } from './components/ui/ActionMenu'
import { AppButton } from './components/ui/Controls'
import { StatusBanner } from './components/ui/Feedback'
import { useVisualPreferences } from './theme/VisualPreferencesProvider'
import styles from './App.module.css'

export default function App(): React.JSX.Element {
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [failed, setFailed] = useState(false)
  const [storageStatus, setStorageStatus] = useState<StorageStatus>({ state: 'starting', sequence: 0 })
  useEffect(() => {
    let active = true
    const applyStorageStatus = (next: StorageStatus): void => {
      if (active) setStorageStatus(previous => next.sequence >= previous.sequence ? next : previous)
    }
    const unsubscribe = window.collie.onStorageStatus(applyStorageStatus)
    window.collie.getStorageStatus().then(result => {
      applyStorageStatus(result.ok ? result.value : { state: 'unavailable', sequence: 0 })
    }).catch(() => applyStorageStatus({ state: 'unavailable', sequence: 0 }))
    window.collie.getInfo().then(result => {
      if (!active) return
      if (result.ok) setInfo(result.value)
      else setFailed(true)
    }).catch(() => { if (active) setFailed(true) })
    return () => { active = false; unsubscribe() }
  }, [])
  return <WorkspaceSessionProvider storage={storageStatus}><AppShell info={info} failed={failed} storageStatus={storageStatus} /></WorkspaceSessionProvider>
}

function AppShell({ info, failed, storageStatus }: { info: AppInfo | null; failed: boolean; storageStatus: StorageStatus }): React.JSX.Element {
  const { persistenceIssue, zoomIssue } = useVisualPreferences()
  const { navigate, returnToWork, project, navigating, destination, writingView } = useWorkspaceSession()
  const content = useRef<HTMLElement>(null)
  const channel = info ? info.channel === 'production' ? 'Direct' : info.channel === 'beta' ? 'Beta' : 'Development' : null

  return (
    <div className={styles['app-shell']} data-writing={destination.kind==='workspace'&&destination.view==='write'} data-focus={destination.kind==='workspace'&&destination.view==='write'&&writingView.preferences.focus}>
      <a className={styles['skip-link']} href="#workspace" onClick={event => {
        event.preventDefault()
        content.current?.focus()
      }}>Skip to workspace</a>
      <header className={styles['app-header']}>
        <div className={styles['app-identity']}>
          <span className={styles['app-symbol']}><PenLine size={22} aria-hidden="true" /></span>
          <span className={styles['app-wordmark']}>Collie Writer</span>
          {channel && channel !== 'Direct' ? <span className={styles['build-label']}>{channel}</span> : null}
        </div>
        <nav aria-label="App sections" className={styles['app-navigation']}>
          <AppButton variant="subtle" disabled={navigating} onClick={() => { void navigate({kind:'library'}) }}>Projects</AppButton>
          {project ? <AppButton variant="subtle" disabled={navigating} onClick={returnToWork}>Return to work</AppButton> : null}
          <AppButton variant="subtle" leftSection={<Settings size={18} aria-hidden="true" />}
            onClick={() => { void navigate({kind:'settings',page:'appearance'}) }}>Settings</AppButton>
          <ActionMenu label="App menu" actions={[
            { id: 'tutorial', label: 'Explore the tutorial', icon: <BookOpen size={18} aria-hidden="true" />, onSelect: () => { void navigate({kind:'help',page:'tutorial'}) } },
            { id: 'data', label: 'Data Locations and recovery', icon: <FolderOpen size={18} aria-hidden="true" />, onSelect: () => { void navigate({kind:'settings',page:'data'}) } },
            { id: 'settings', label: 'About and help', icon: <Settings size={18} aria-hidden="true" />, onSelect: () => { void navigate({kind:'help',page:'about'}) } }
          ]} />
        </nav>
      </header>
      <main ref={content} id="workspace" tabIndex={-1} className={styles['workspace-content']}>
        <aside className={styles['citation-attribution']} aria-label="Citation software attribution">
          <p>citeproc-js implements the Citation Style Language</p>
          <p>© Frank Bennett · https://citationstyles.org/</p>
          <p>Source and licenses are available in Help → Third-party licenses.</p>
        </aside>
        {persistenceIssue ? <div className={styles['app-notice']}>
          <StatusBanner tone="warning" title="Display preferences">{persistenceIssue}</StatusBanner>
        </div> : null}
        {zoomIssue ? <div className={styles['app-notice']}>
          <StatusBanner tone="warning" title="Interface zoom needs attention">
            Open Settings to retry your zoom choice. Local writing remains available.
          </StatusBanner>
        </div> : null}
        <WorkspaceStatus />
        <Projects />
        <RetainedRegion name="help-about" label="About and help">
        <h1>About Collie Writer</h1>
        <p>Use the native Help menu for bundled third-party licenses and explicit update actions. Review a content-free support preview in Settings.</p>
        <details className={styles['storage-details']}>
          <summary>Local storage details</summary>
          <h2>SQLite engine</h2>
          <p role="status">
            {storageStatus.state === 'starting'
              ? 'Waiting for a local working folder or starting storage…'
              : storageStatus.state === 'ready'
                ? `Loaded · SQLite ${storageStatus.runtime.sqliteVersion} · Node ${storageStatus.runtime.nodeVersion} · Node-API ${storageStatus.runtime.napiVersion}`
                : 'Storage is unavailable. Keep this window open and copy any unprotected text before quitting.'}
          </p>
        </details>
        </RetainedRegion>
      </main>
      <footer className={styles['app-footer']}>
        <p role="status">{failed
          ? 'Application information could not be loaded.'
          : info ? `Collie Writer ${info.version} · ${channel} build` : 'Starting Collie Writer…'}</p>
        <span>Ad-free, always.</span>
      </footer>
    </div>
  )
}
