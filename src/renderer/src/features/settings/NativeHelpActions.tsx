import { useState } from 'react'
import type { HelpAction } from '../../../../shared/commands'
import { AppButton } from '../../components/ui/Controls'
import styles from './SettingsPanel.module.css'

export default function NativeHelpActions({
  kind
}: {
  kind: 'updates' | 'licenses'
}): React.JSX.Element {
  const [pending, setPending] = useState(false),
    [issue, setIssue] = useState('')
  async function act(action: HelpAction): Promise<void> {
    if (pending) return
    setPending(true)
    setIssue('')
    try {
      const result = await window.collie.helpAction(action)
      if (!result.ok) setIssue(result.error.message)
    } catch {
      setIssue('This action could not be confirmed. Use the native Help menu to retry.')
    } finally {
      setPending(false)
    }
  }
  return (
    <div className={styles['native-help-actions']}>
      {kind === 'licenses' ? (
        <AppButton variant="default" pending={pending} onClick={() => void act('licenses')}>
          Third-party licenses and source…
        </AppButton>
      ) : (
        <>
          <AppButton pending={pending} onClick={() => void act('check-updates')}>
            Check for updates…
          </AppButton>
          <AppButton variant="default" pending={pending} onClick={() => void act('install-update')}>
            Install downloaded update…
          </AppButton>
        </>
      )}
      {pending ? (
        <p role="status">Follow the native dialog. This action may still be in progress.</p>
      ) : null}
      {issue ? <p role="alert">{issue}</p> : null}
    </div>
  )
}
