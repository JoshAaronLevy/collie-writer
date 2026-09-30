import { Component, type ReactNode } from 'react'
export default class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }
  render(): ReactNode {
    if (this.state.failed)
      return (
        <main className="error-panel">
          <h1>Collie Writer could not display this window.</h1>
          <p>Close and reopen the window to try again.</p>
          <button onClick={() => window.location.reload()}>Reload window</button>
        </main>
      )
    return this.props.children
  }
}
