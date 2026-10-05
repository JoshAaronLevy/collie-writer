import { Component, type ReactNode } from 'react'
import styles from './ErrorBoundary.module.css'

/** Last resort only: this boundary cannot retain state in its failed subtree. */
export default class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean; pending: boolean; message: string }
> {
  state = { failed: false, pending: false, message: '' }
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }
  componentDidCatch(): void {
    // No exception text or project content crosses this recovery channel.
    void window.collie?.recoverWindow('owner-lost').catch(() => {})
  }
  private recover = async (): Promise<void> => {
    this.setState({ pending: true, message: '' })
    try {
      const reported = await window.collie.recoverWindow('owner-lost')
      if (!reported.ok) throw new Error('Recovery unavailable')
      await window.collie.recoverWindow('restart')
      this.setState({
        message: 'Restart is paused because workspace protection cannot be confirmed.'
      })
    } catch {
      this.setState({
        message: 'Recovery is unavailable. Keep this window and your local working folder.'
      })
    } finally {
      this.setState({ pending: false })
    }
  }
  render(): ReactNode {
    if (this.state.failed)
      return (
        <main className={styles['window-error']}>
          <h1>Collie Writer could not display this window.</h1>
          <p>
            The workspace stopped. Previously protected local writing and saved project files remain
            on disk. Unsaved forms, composing text and other changes held only in this window may
            already be lost. Reopening cannot reconstruct lost memory.
          </p>
          <p>Automatic restart is paused. Keep your local working folder for recovery.</p>
          <button type="button" disabled={this.state.pending} onClick={() => void this.recover()}>
            {this.state.pending ? 'Checking recovery…' : 'Review recovery with Collie'}
          </button>
          {this.state.message ? <p role="status">{this.state.message}</p> : null}
        </main>
      )
    return this.props.children
  }
}
