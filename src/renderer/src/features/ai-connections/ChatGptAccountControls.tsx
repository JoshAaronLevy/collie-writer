import { useState } from 'react'
import { IconExternalLink } from '@tabler/icons-react'
import { AppButton } from '../../components/ui/Controls'
import { useAiConnections } from './connectionState'
import styles from './AiConnections.module.css'

export function ChatGptAccountControls({
  blocked,
  onDisconnect
}: {
  blocked: boolean
  onDisconnect: (id: string, trigger: HTMLButtonElement) => void
}): React.JSX.Element {
  const connections = useAiConnections()
  const { status, waiting } = connections
  const [changing, setChanging] = useState(false)
  const account = status?.connections.find((a) => a.id === status.activeConnectionId)
  const savedAccounts = status?.connections.filter((a) => a.id !== account?.id) ?? []
  const reconnect = account ?? (savedAccounts.length === 1 ? savedAccounts[0] : null)
  const canConnect = !!status?.actions.connect && !blocked
  return (
    <div className={styles['chatgpt-account-controls']}>
      <p className={styles['ai-sharing-note']}>
        Sign-in sends no writing. Requests use your chosen context and your account’s usage and
        spending settings.
      </p>
      {account ? <p className={styles['ai-account-label']}>{account.label}</p> : null}
      <div className={styles['ai-account-actions']}>
        {(!account || account.state !== 'signed-in' || !account.planConsent) && !waiting ? (
          <AppButton
            disabled={!canConnect || (!reconnect && savedAccounts.length >= 8)}
            leftSection={<IconExternalLink size={16} aria-hidden="true" />}
            onClick={(event) =>
              void connections.connect(reconnect?.id ?? null, event.currentTarget)
            }
          >
            {reconnect ? 'Reconnect ChatGPT' : 'Connect ChatGPT'}
          </AppButton>
        ) : null}
        {account || savedAccounts.length ? (
          <AppButton
            variant="subtle"
            disabled={blocked}
            aria-expanded={changing}
            onClick={() => setChanging((open) => !open)}
          >
            {account ? 'Change account' : 'Saved accounts'}
          </AppButton>
        ) : null}
        {account && account.state !== 'signed-out' ? (
          <AppButton
            variant="subtle"
            disabled={!status?.actions.disconnect || blocked}
            onClick={(event) => onDisconnect(account.id, event.currentTarget)}
          >
            Sign out
          </AppButton>
        ) : null}
      </div>
      {changing && !waiting ? (
        <div className={styles['ai-account-choice']}>
          {account?.state === 'signed-in' ? (
            <AppButton
              variant="default"
              disabled={!canConnect}
              onClick={(event) => void connections.connect(account.id, event.currentTarget)}
            >
              Reconnect this account
            </AppButton>
          ) : null}
          <AppButton
            variant="default"
            disabled={!canConnect || (status?.connections.length ?? 0) >= 8}
            onClick={(event) => void connections.connect(null, event.currentTarget)}
          >
            Connect another account
          </AppButton>
          {(status?.connections.length ?? 0) >= 8 ? (
            <p>Choose a saved account; the saved-account limit has been reached.</p>
          ) : null}
          {savedAccounts.map((saved) => (
            <div className={styles['ai-saved-account']} key={saved.id}>
              <p className={styles['ai-account-label']}>
                {saved.label} ·{' '}
                {saved.state === 'signed-in'
                  ? 'Signed in'
                  : saved.state === 'expired'
                    ? 'Session expired'
                    : 'Signed out'}
              </p>
              <div className={styles['ai-account-actions']}>
                <AppButton
                  variant="default"
                  disabled={
                    blocked || (saved.state === 'signed-in' ? !status?.actions.select : !canConnect)
                  }
                  onClick={(event) => {
                    if (saved.state === 'signed-in')
                      void connections
                        .accountAction('select', saved.id, event.currentTarget)
                        .then((confirmed) => {
                          if (confirmed) setChanging(false)
                        })
                    else void connections.connect(saved.id, event.currentTarget)
                  }}
                >
                  {saved.state === 'signed-in' ? 'Use this account' : 'Reconnect'}
                </AppButton>
                {saved.state !== 'signed-out' ? (
                  <AppButton
                    variant="subtle"
                    disabled={!status?.actions.disconnect || blocked}
                    onClick={(event) => onDisconnect(saved.id, event.currentTarget)}
                  >
                    Sign out
                  </AppButton>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
