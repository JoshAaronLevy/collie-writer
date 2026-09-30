import { useEffect, useState } from 'react'
import type { AppInfo } from '../../shared/commands'

export default function App(): React.JSX.Element {
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let active = true
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
            This early development build establishes the application shell. Project creation and
            writing will arrive in later stages.
          </p>
          <p>
            You can select and copy text, adjust the text size from the View menu, and find
            application information in Help.
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
