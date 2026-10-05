import { useState } from 'react'
import { ExternalLink } from 'lucide-react'
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
  const { status, pending, waiting } = connections
  const [changing, setChanging] = useState(false)
  const local = status?.route.kind === 'local-codex-chatgpt'
  const direct = status?.route.kind === 'local-chatgpt-plan'
  const account = status?.connections.find((a) => a.id === status.activeConnectionId)
  const otherAccounts = status?.connections.filter((a) => a.id !== account?.id) ?? []
  const canConnect = !!status?.actions.connect && !blocked
  return (
    <div className={styles['chatgpt-account-controls']}>
      <p>Connecting sends no writing. Requests share only the context you review.</p>
      {account ? (
        <div className={styles['ai-current-account']}>
          <p className={styles['ai-account-label']}>{account.label}</p>
          <p>
            {direct
              ? account.state === 'signed-in'
                ? 'This is the account used across your projects.'
                : account.state === 'expired'
                  ? 'Renew the session, or continue with ChatGPT to authorize this saved account again.'
                  : 'This saved account is signed out. Continue with ChatGPT to reuse its registration.'
              : local
                ? account.state === 'signed-in'
                  ? 'Connected to Codex. Each feature’s availability is shown below.'
                  : status?.session.state === 'reconnect-required'
                    ? 'Continue with ChatGPT to reconnect this account.'
                    : 'Saved on this device. Resume explicitly to check the account with Codex.'
                : account.state === 'signed-in'
                  ? 'Signed in for future requests. AI usage eligibility is still unresolved.'
                  : account.state === 'expired'
                    ? 'This session has expired. Reconnect to authorize this account again.'
                    : 'This saved account is signed out.'}
          </p>
          <div className={styles['ai-account-actions']}>
            {local && account.state !== 'signed-in' ? (
              <AppButton
                variant="default"
                disabled={!status?.actions.resume || blocked}
                pending={pending?.kind === 'resume'}
                onClick={(event) =>
                  void connections.accountAction('resume', account.id, event.currentTarget)
                }
              >
                Resume Codex connection
              </AppButton>
            ) : null}
            {!local || account.state !== 'signed-in' ? (
              <AppButton
                variant="default"
                disabled={!canConnect}
                leftSection={<ExternalLink size={16} aria-hidden="true" />}
                onClick={(event) => void connections.connect(account.id, event.currentTarget)}
              >
                Reauthorize account
              </AppButton>
            ) : null}
            {!local ? (
              <AppButton
                variant="subtle"
                disabled={!status?.actions.refresh || blocked || account.state === 'signed-out'}
                pending={pending?.kind === 'refresh' && pending.connectionId === account.id}
                onClick={(event) =>
                  void connections.accountAction('refresh', account.id, event.currentTarget)
                }
              >
                Renew session
              </AppButton>
            ) : null}
            <AppButton
              variant="subtle"
              disabled={blocked}
              aria-expanded={changing}
              onClick={() => setChanging((open) => !open)}
            >
              Change account
            </AppButton>
            <AppButton
              variant="subtle"
              disabled={!status?.actions.disconnect || blocked}
              onClick={(event) => onDisconnect(account.id, event.currentTarget)}
            >
              Disconnect
            </AppButton>
          </div>
        </div>
      ) : null}
      {(!account || changing) && !waiting ? (
        <div className={styles['ai-account-choice']}>
          {local && account ? (
            <p>
              A successful browser sign-in replaces this connection with the account you choose.
              Cancelling keeps the saved account and leaves it available to resume. Writing and
              saved AI history stay on this device.
            </p>
          ) : null}
          <AppButton
            variant="default"
            disabled={!canConnect || (!local && (status?.connections.length ?? 0) >= 8)}
            leftSection={<ExternalLink size={16} aria-hidden="true" />}
            onClick={(event) =>
              void connections.connect(local ? (account?.id ?? null) : null, event.currentTarget)
            }
          >
            {account ? 'Connect another account' : 'Connect ChatGPT'}
          </AppButton>
          {direct && account ? (
            <p>
              This button adds another ChatGPT account or workspace. Use a saved account below to
              keep its existing registration.
            </p>
          ) : null}
          {(status?.connections.length ?? 0) >= 8 ? (
            <p>The saved-account limit has been reached. Reconnect or select a saved account.</p>
          ) : null}
          {otherAccounts.length ? (
            <div className={styles['ai-saved-accounts']}>
              <h3>Saved accounts on this device</h3>
              {otherAccounts.map((saved) => (
                <div className={styles['ai-saved-account']} key={saved.id}>
                  <div>
                    <p className={styles['ai-account-label']}>{saved.label}</p>
                    <p>
                      {saved.state === 'signed-in'
                        ? direct
                          ? saved.planConsent
                            ? 'Signed in · plan permission granted'
                            : 'Signed in · plan permission missing'
                          : 'Signed in · eligibility unresolved'
                        : saved.state === 'expired'
                          ? 'Session expired'
                          : 'Signed out'}
                    </p>
                  </div>
                  <div className={styles['ai-account-actions']}>
                    {saved.state === 'signed-in' ? (
                      <AppButton
                        variant="default"
                        disabled={!status?.actions.select || blocked}
                        onClick={(event) => {
                          void connections
                            .accountAction('select', saved.id, event.currentTarget)
                            .then((confirmed) => {
                              if (confirmed) setChanging(false)
                            })
                        }}
                      >
                        Use this account
                      </AppButton>
                    ) : (
                      <AppButton
                        variant="default"
                        disabled={!canConnect}
                        onClick={(event) => void connections.connect(saved.id, event.currentTarget)}
                      >
                        {direct ? 'Continue with ChatGPT' : 'Reconnect'}
                      </AppButton>
                    )}
                    {saved.state !== 'signed-out' ? (
                      <AppButton
                        variant="subtle"
                        disabled={!status?.actions.disconnect || blocked}
                        onClick={(event) => onDisconnect(saved.id, event.currentTarget)}
                      >
                        Disconnect
                      </AppButton>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {status?.local?.cleanupCount ? (
        <AppButton
          variant="default"
          disabled={blocked || !status.actions.cleanup}
          onClick={(event) => void connections.localAction('cleanup', event.currentTarget)}
        >
          Clean up inactive sessions
        </AppButton>
      ) : null}
    </div>
  )
}
