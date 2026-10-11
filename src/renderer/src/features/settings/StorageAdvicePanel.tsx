import { AppButton } from '../../components/ui/Controls'
import { storageBytes } from '../../../../shared/storage-space'
import { useStorageNotices } from './storageNoticeContext'
import styles from './StorageInventoryPanel.module.css'

export default function StorageAdvicePanel({ disabled }: { disabled: boolean }): React.JSX.Element {
  const { report, visible, preferences, now, issue, dismiss, restore, select } = useStorageNotices()
  const hidden = preferences.filter((e) => e.active && (e.dismissed || e.until > now)).length
  return (
    <section aria-labelledby="storage-advice-heading">
      <h3 id="storage-advice-heading">Storage notices</h3>
      {issue ? <p role="status">{issue}</p> : null}
      {visible.length ? (
        visible.map((c) => (
          <div className={styles['storage-advice-notice']} key={c.key}>
            <h4>
              {c.kind === 'volume'
                ? 'Low available space'
                : c.kind === 'cache'
                  ? 'Large search cache'
                  : 'Large local project'}{' '}
              · {c.title}
            </h4>
            <p>
              {c.bytes === null
                ? 'Current size or capacity is unknown.'
                : `${c.kind === 'volume' ? 'Available space' : 'Measured size'}: ${storageBytes(c.bytes)}.`}{' '}
              {c.signal !== 'high' ? 'Refresh to check this earlier notice.' : ''}
            </p>
            <p>
              {c.kind === 'cache'
                ? 'Open this project to clear its search cache below.'
                : c.kind === 'volume'
                  ? 'Save needs space both here and in the local working folder.'
                  : 'Project content and recovery are kept. Local-copy removal is available from Projects when safe.'}
            </p>
            <div className={styles['storage-inventory-actions']}>
              <AppButton variant="default" disabled={disabled} onClick={() => select(c)}>
                Show {c.kind === 'volume' ? 'disk space' : 'project size'}
              </AppButton>
              <AppButton variant="subtle" disabled={disabled} onClick={() => dismiss(c.key, true)}>
                Snooze for 24 hours
              </AppButton>
              <AppButton variant="subtle" disabled={disabled} onClick={() => dismiss(c.key, false)}>
                Dismiss notice
              </AppButton>
            </div>
          </div>
        ))
      ) : (
        <p>
          No notices to display from the available readings. Unknown or unmeasured capacity does not
          mean enough space.
        </p>
      )}
      {hidden ? <p>{hidden} active condition(s) dismissed or snoozed.</p> : null}
      {hidden ? (
        <AppButton variant="subtle" disabled={disabled} onClick={restore}>
          Show dismissed and snoozed notices
        </AppButton>
      ) : null}
      {report?.omitted ? (
        <p>Some additional readings are omitted. Earlier notices stay retained.</p>
      ) : null}
    </section>
  )
}
