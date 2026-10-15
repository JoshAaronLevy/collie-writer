import { AppButton } from '../../components/ui/Controls'
import { useWorkspaceSession } from './workspaceContext'
import styles from './WorkspaceNavigation.module.css'

export function WorkspaceModeSwitch(): React.JSX.Element {
  const session = useWorkspaceSession()
  return (
    <nav className={styles['workspace-mode-switch']} aria-label="Working mode">
      {(['write', 'plan'] as const).map((view) => (
        <AppButton
          key={view}
          variant={
            session.destination.kind === 'workspace' && session.destination.view === view
              ? 'default'
              : 'subtle'
          }
          aria-current={
            session.destination.kind === 'workspace' && session.destination.view === view
              ? 'page'
              : undefined
          }
          disabled={session.closing || session.navigating || session.busy}
          onClick={() => {
            const next = session.workspace(view)
            if (next) void session.navigate(next, true, view === 'write' ? 'resume' : 'top')
          }}
        >
          {view === 'write' ? 'Write' : 'Plan'}
        </AppButton>
      ))}
    </nav>
  )
}
