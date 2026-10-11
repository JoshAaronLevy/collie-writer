import { AppButton } from '../../components/ui/Controls'
import { StatusBanner } from '../../components/ui/Feedback'
import { useWorkspaceSession } from '../workspace/workspaceContext'
import { recoveryHeading } from './recovery-presentation'
import { useRecovery } from './recoveryContext'

export function RecoveryNotice(): React.JSX.Element | null {
  const recovery = useRecovery()
  const session = useWorkspaceSession()
  if (!recovery.issues.length || recovery.opened) return null
  return (
    <StatusBanner
      tone="warning"
      title={
        recovery.issues.length === 1
          ? recoveryHeading(recovery.issues[0])
          : `${recovery.issues.length} recovery issues need attention`
      }
    >
      {recovery.issues.length > 1 ? (
        <p>
          {Array.from(new Set(recovery.issues.map((i) => i.title).filter(Boolean)))
            .slice(0, 3)
            .join(', ') || 'Some project or recovery records could not be read.'}
        </p>
      ) : null}
      <AppButton
        variant="default"
        disabled={session.acting || session.closing || session.navigating || session.fileActive}
        onClick={(event) => recovery.open(event.currentTarget)}
      >
        Review recovery
      </AppButton>
    </StatusBanner>
  )
}
