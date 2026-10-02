import { AppButton } from '../../components/ui/Controls'
import { useAiConnections } from './AiConnectionsProvider'
import { connectionLabel } from './connection-copy'
import styles from './AiConnections.module.css'

export function AiProviderIndicator({ onOpen, active }: { onOpen: () => void; active: boolean }): React.JSX.Element {
  const { status, checking } = useAiConnections()
  const account = status?.connections.find(item => item.id === status.activeConnectionId)
  return <AppButton variant={active ? 'default' : 'subtle'} aria-pressed={active} onClick={onOpen}
    className={styles['ai-provider-indicator']} classNames={{ label: styles['ai-provider-indicator-label'] }} title={`ChatGPT · Codex: ${connectionLabel(status, checking)}${account ? ` · ${account.label}` : ''}`}>
    AI <span className={styles['ai-provider-indicator-state']}>{!status && checking ? 'Checking…' : status?.state === 'signing-in' ? 'Signing in…' : account?.state === 'signed-in' ? 'ChatGPT · unavailable' : 'Unavailable'}</span>
  </AppButton>
}
