import { useEffect, useState } from 'react'
import type { AppInfo } from '../../shared/commands'
import type { StorageStatus } from '../../shared/storage'
import Projects from './features/projects/Projects'
import SettingsPanel from './features/settings/SettingsPanel'

export default function App(): React.JSX.Element {
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [failed, setFailed] = useState(false)
  const [storageStatus, setStorageStatus] = useState<StorageStatus>({ state: 'starting', sequence: 0 })
  useEffect(() => {
    let active = true
    const applyStorageStatus = (next: StorageStatus): void => {
      if (active)
        setStorageStatus((previous) => (next.sequence >= previous.sequence ? next : previous))
    }
    const unsubscribe = window.collie.onStorageStatus(applyStorageStatus)
    window.collie.getStorageStatus().then((result) => {
      if (result.ok) applyStorageStatus(result.value)
      else applyStorageStatus({ state: 'unavailable', sequence: 0 })
    })
    window.collie
      .getInfo()
      .then((result) => {
        if (!active) return
        if (result.ok) setInfo(result.value)
        else setFailed(true)
      })
      .catch(() => {
        if (active) setFailed(true)
      })
    return () => {
      active = false
      unsubscribe()
    }
  }, [])
  return (
    <div className="shell">
      <a
        className="skip-link"
        href="#workspace"
        onClick={(event) => {
          event.preventDefault()
          document.getElementById('workspace')?.focus()
        }}
      >
        Skip to workspace
      </a>
      <header className="app-header">
        <span className="wordmark">Collie Writer</span>
        <nav aria-label="App sections" className="header-nav">
          <a href="#tutorial" onClick={event=>{event.preventDefault();const target=document.getElementById('tutorial-title');target?.focus();target?.scrollIntoView({block:'start'})}}>Tutorial</a>
          <a href="#data-locations" onClick={event=>{event.preventDefault();const target=document.getElementById('data-locations') as HTMLDetailsElement|null;if(target){target.open=true;target.focus();target.scrollIntoView({block:'start'})}}}>Data Locations</a>
          <a href="#settings" onClick={event=>{event.preventDefault();const target=document.getElementById('settings-title');target?.focus();target?.scrollIntoView({block:'start'})}}>Settings and privacy</a>
        </nav>
        <span className="build-label">Development</span>
      </header>
      <main id="workspace" tabIndex={-1}>
        <aside className="citation-attribution" aria-label="Citation software attribution">
          <p>citeproc-js implements the Citation Style Language</p>
          <p>© Frank Bennett · https://citationstyles.org/</p>
          <p>Source and licenses are available in Help → Third-party licenses.</p>
        </aside>
        <Projects storage={storageStatus} />
        <SettingsPanel />
        <section className="storage-panel" aria-labelledby="storage-title">
          <h2 id="storage-title">SQLite engine</h2>
          <p role="status">
            {storageStatus.state === 'starting'
              ? 'Waiting for a local working folder or starting storage…'
              : storageStatus.state === 'ready'
                ? `Loaded · SQLite ${storageStatus.runtime.sqliteVersion} · Node ${storageStatus.runtime.nodeVersion} · Node-API ${storageStatus.runtime.napiVersion}`
                : 'Could not load. Quit and reopen Collie Writer to try again.'}
          </p>
        </section>
      </main>
      <footer>
        <p role="status">
          {failed
            ? 'Application information could not be loaded. Reopen this window to try again.'
            : info
              ? `Collie Writer ${info.version} · Development build`
              : 'Starting Collie Writer…'}
        </p>
        <span>Ad-free, always.</span>
      </footer>
    </div>
  )
}
