import { useId } from 'react'
import { AppButton } from '../../components/ui/Controls'
import { useAiConnections } from './connectionState'
import { connectionPresentation } from './connectionPresentation'
import styles from './AiConnections.module.css'

export function AiConnectionPanel({ compact = false }: { compact?: boolean }): React.JSX.Element {
  const connections = useAiConnections()
  const heading = useId()
  const view = connectionPresentation(
    connections.status,
    connections.statusUnavailable,
    connections.issue,
    connections.busy
  )
  const account = connections.status?.connections.find(
    (a) => a.id === connections.status?.activeConnectionId
  )
  return (
    <section
      className={styles['ai-connection-panel']}
      data-compact={compact}
      aria-labelledby={heading}
    >
      <h2 id={heading}>ChatGPT</h2>
      <p role="status">{view.description}</p>
      {account ? <p className={styles['ai-account-label']}>{account.label}</p> : null}
      <AppButton variant="default" onClick={(event) => connections.openDialog(event.currentTarget)}>
        Manage ChatGPT
      </AppButton>
    </section>
  )
}
