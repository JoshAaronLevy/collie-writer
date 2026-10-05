import { Component, type ReactNode } from 'react'
import styles from './ErrorBoundary.module.css'

class Presentation extends Component<{ render: () => ReactNode }> {
  render(): ReactNode {
    return this.props.render()
  }
}

/** Place inside the state/draft owner, around presentation only. Never wrap an
 * editor host or another draft owner: React removes a boundary's failed subtree.
 * The callback also puts JSX computations inside the boundary without moving hooks. */
export default class PresentationBoundary extends Component<
  { label: string; render: () => ReactNode },
  { failed: boolean; pending: boolean; message: string }
> {
  state = { failed: false, pending: false, message: '' }
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }
  private restart = async (): Promise<void> => {
    this.setState({ pending: true, message: '' })
    try {
      const result = await window.collie.recoverWindow('restart')
      this.setState({
        message:
          result.ok && result.value
            ? 'Reopening the protected workspace…'
            : 'Restart paused. Return to the affected draft to save or explicitly clear it, finish composing, or resolve pending work. Surviving panels remain available.'
      })
    } catch {
      this.setState({
        message:
          'Recovery is unavailable. Keep this window open and copy any visible unprotected text.'
      })
    } finally {
      this.setState({ pending: false })
    }
  }
  render(): ReactNode {
    if (!this.state.failed) return <Presentation render={this.props.render} />
    return (
      <section
        className={styles['panel-error']}
        role="alert"
        aria-label={`${this.props.label} recovery`}
      >
        <h2>{this.props.label} could not be displayed.</h2>
        <p>
          This panel’s state owner is still mounted. Retained input is not necessarily protected on
          disk. Previously protected writing remains in local recovery; check the workspace
          protection status for pending changes. Text still being composed may be uncertain.
        </p>
        <p>Retry this panel first. Other panels and their draft owners remain available.</p>
        <button
          type="button"
          disabled={this.state.pending}
          onClick={() => this.setState({ failed: false, message: '' })}
        >
          Retry panel
        </button>
        <button type="button" disabled={this.state.pending} onClick={() => void this.restart()}>
          {this.state.pending ? 'Checking protection…' : 'Restart after protecting work'}
        </button>
        <p>
          Restart uses Collie’s normal close protection checks. Explicit drafts and unresolved work
          must be settled first; active AI requires the existing stop confirmation.
        </p>
        {this.state.message ? <p role="status">{this.state.message}</p> : null}
      </section>
    )
  }
}
