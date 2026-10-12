import { Component, type ReactNode } from 'react'
import { AppButton } from './ui/Controls'
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
  { label: string; render: () => ReactNode; writingRetained?: boolean },
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
            ? 'Restarting Collie Writer…'
            : 'Restart paused. Finish composing, save or cancel unfinished drafts, and resolve pending work before trying again.'
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
        <h2>{this.props.label} couldn’t open.</h2>
        {this.props.writingRetained ? <p>Your text is still in the editor.</p> : null}
        <p>Try again. You can still use other panels.</p>
        <AppButton
          disabled={this.state.pending}
          onClick={() => this.setState({ failed: false, message: '' })}
        >
          Try again
        </AppButton>
        <details className={styles['panel-restart']}>
          <summary>If this keeps happening</summary>
          <p>
            Save or copy any visible unsaved text before restarting. Collie checks unfinished drafts
            and work first; restarting does not save the project file.
          </p>
          <AppButton
            variant="default"
            pending={this.state.pending}
            onClick={() => void this.restart()}
          >
            {this.state.pending ? 'Checking unfinished work…' : 'Restart Collie Writer'}
          </AppButton>
        </details>
        {this.state.message ? <p role="status">{this.state.message}</p> : null}
      </section>
    )
  }
}
