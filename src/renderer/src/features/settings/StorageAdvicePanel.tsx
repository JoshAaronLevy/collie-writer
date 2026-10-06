import { AppButton } from '../../components/ui/Controls'
import { storageBytes } from '../../../../shared/storage-space'
import { useStorageNotices } from './storageNoticeContext'
import { STORAGE_ADVICE } from '../../../../shared/storage-advice'
import styles from './StorageInventoryPanel.module.css'

export default function StorageAdvicePanel({ disabled }: { disabled: boolean }): React.JSX.Element {
  const { report, visible, preferences, now, issue, dismiss, restore, select } = useStorageNotices()
  const hidden = preferences.filter((e) => e.active && (e.dismissed || e.until > now)).length
  return (
    <section aria-labelledby="storage-advice-heading">
      <h3 id="storage-advice-heading">Storage notices</h3>
      <p>
        Notices use your last finished or partial inventory, across all pages. Refresh to measure
        again. These are product defaults, not limits on your project or permission to delete data:
        search cache {storageBytes(STORAGE_ADVICE.projectCache)} per project /{' '}
        {storageBytes(STORAGE_ADVICE.appCache)} overall, local project data{' '}
        {storageBytes(STORAGE_ADVICE.project)}, available volume space below the greater of{' '}
        {storageBytes(STORAGE_ADVICE.volumeFloor)} or{' '}
        {Math.round(STORAGE_ADVICE.volumeFraction * 100)}%.
      </p>
      {issue ? <p role="status">{issue}</p> : null}
      {visible.length ? (
        visible.map((c) => (
          <div className={styles['storage-advice-notice']} key={c.key}>
            <h4>
              {c.kind === 'volume'
                ? 'Low available space'
                : c.kind === 'cache'
                  ? 'Review search cache growth'
                  : 'Review local project size'}{' '}
              · {c.title}
            </h4>
            <p>
              {c.bytes === null
                ? 'Current size or capacity is unknown.'
                : `${c.kind === 'volume' ? 'Available space' : 'Measured file lengths'}: ${storageBytes(c.bytes)}. Notice threshold: ${storageBytes(c.threshold)}.`}{' '}
              {c.signal !== 'high'
                ? 'This earlier condition remains active until a complete measurement shows sufficient recovery.'
                : ''}
            </p>
            <p>
              {c.kind === 'cache'
                ? 'Open the affected project, then use Clear search cache in Data to review verified search files. '
                : ''}
              Review the breakdown and relevant volume. Existing Project file actions offer Backup
              and Save As; another destination still needs local working-folder space. Recovery
              material and unknown files remain retained.
            </p>
            <div className={styles['storage-inventory-actions']}>
              <AppButton variant="default" disabled={disabled} onClick={() => select(c)}>
                Review {c.kind === 'volume' ? 'volume' : 'breakdown'}
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
      <AppButton variant="subtle" disabled={disabled || !hidden} onClick={restore}>
        Show dismissed and snoozed notices
      </AppButton>
      {report?.omitted ? (
        <p>
          {report.omitted} additional condition readings did not fit this bounded summary. Review
          the project pages; omission does not clear earlier notices.
        </p>
      ) : null}
      <p>
        Dismissals are remembered for up to 30 days between measurements; snoozes last 24 hours.{' '}
        Size notices clear below {Math.round(STORAGE_ADVICE.sizeResetFraction * 100)}% of their
        threshold; low-space notices clear at {Math.round(STORAGE_ADVICE.volumeResetFactor * 100)}%
        of theirs. Dismissal and snooze affect advice only. File operations recheck space
        independently, and close still requires protection of pending work.
      </p>
    </section>
  )
}
