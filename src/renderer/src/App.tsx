import { useEffect, useState } from 'react'
import type { AppInfo } from '../../shared/commands'
import type { StorageStatus } from '../../shared/storage'

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
        <span className="build-label">Development</span>
      </header>
      <main id="workspace" tabIndex={-1}>
        <p className="eyebrow">A place for thoughtful work</p>
        <h1>Room for your next idea.</h1>
        <p className="intro">A workspace for research and writing is taking shape.</p>
        <section className="welcome" aria-labelledby="welcome-title">
          <h2 id="welcome-title">Welcome to Collie Writer</h2>
          <p>
            This development build loads the SQLite engine in a separate process. Project creation
            and writing will arrive in later stages.
          </p>
          <p>
            You can select and copy text, adjust the text size from the View menu, and find
            application information in Help.
          </p>
        </section>
        <section className="storage-panel" aria-labelledby="storage-title">
          <h2 id="storage-title">SQLite engine</h2>
          <p role="status">
            {storageStatus.state === 'starting'
              ? 'Starting local storage…'
              : storageStatus.state === 'ready'
                ? `Loaded · SQLite ${storageStatus.runtime.sqliteVersion} · Node ${storageStatus.runtime.nodeVersion} · Node-API ${storageStatus.runtime.napiVersion}`
                : 'Could not load. Quit and reopen Collie Writer to try again.'}
          </p>
        </section>
        <aside className="citation-attribution" aria-label="Citation software attribution">
          <p>citeproc-js implements the Citation Style Language</p>
          <p>© Frank Bennett · https://citationstyles.org/</p>
          <p>Source and licenses are available in Help → Third-party licenses.</p>
        </aside>
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
