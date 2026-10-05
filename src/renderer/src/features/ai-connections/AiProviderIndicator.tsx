import { Tooltip } from '@mantine/core'
import { connectionHealth } from '../../../../shared/ai-connection-health'
import { AppButton } from '../../components/ui/Controls'
import { useAiConnections } from './connectionState'
import { connectionHealthDescription } from './connection-copy'
import styles from './AiConnections.module.css'

export function AiProviderIndicator({
  onOpen,
  active = false,
  global = false
}: {
  onOpen?: () => void
  active?: boolean
  global?: boolean
}): React.JSX.Element {
  const { status, statusUnavailable, dialogOpen, openDialog } = useAiConnections()
  if (global) {
    const health = statusUnavailable
      ? connectionHealth('status-unavailable')
      : (status?.connectionHealth ?? connectionHealth('checking'))
    const summary =
      health.state === 'ready'
        ? 'connected'
        : health.state === 'disconnected'
          ? 'not connected'
          : health.state === 'error'
            ? 'connection error'
            : health.state === 'progress'
              ? health.reason === 'disconnecting'
                ? 'disconnecting'
                : health.reason === 'renewing'
                  ? 'updating connection'
                  : health.reason === 'signing-in'
                    ? 'signing in'
                    : 'checking connection'
              : 'needs attention'
    return (
      <Tooltip
        label={connectionHealthDescription[health.reason]}
        events={{ hover: true, focus: true, touch: false }}
        interactive
        position="bottom"
        multiline
        transitionProps={{ duration: 0 }}
        classNames={{ tooltip: styles['ai-provider-tooltip'] }}
      >
        <AppButton
          variant={dialogOpen ? 'default' : 'subtle'}
          aria-haspopup="dialog"
          aria-expanded={dialogOpen}
          data-chatgpt-trigger
          aria-label={`ChatGPT — ${summary}. Open connection dialog.`}
          onClick={(event) => openDialog(event.currentTarget)}
          className={styles['chatgpt-status-button']}
          classNames={{ label: styles['chatgpt-status-label'] }}
        >
          ChatGPT
          <span
            aria-hidden="true"
            className={styles['chatgpt-status-dot']}
            data-state={health.state}
          />
        </AppButton>
      </Tooltip>
    )
  }
  return (
    <AppButton
      variant={active ? 'default' : 'subtle'}
      aria-pressed={active}
      onClick={onOpen}
      className={styles['ai-provider-indicator']}
      classNames={{ label: styles['ai-provider-indicator-label'] }}
      title={active ? 'AI assistance is open' : 'Open AI assistance'}
    >
      AI
    </AppButton>
  )
}
