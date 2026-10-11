import type { SemanticValue } from '../../../../shared/import-semantic'
import type { DiscoveryValue } from '../../../../shared/import-discovery'
import { processedImportTasks } from '../../../../shared/import-recovery'
import { Loader } from '@mantine/core'
import styles from './ImportProvider.module.css'

/** Present protected results and activity; never infer quota or completion from elapsed time. */
export function ImportProgress({
  label,
  discovery,
  stopping,
  reducedMotion
}: {
  label: string
  discovery: DiscoveryValue | SemanticValue | null
  stopping: boolean
  reducedMotion: boolean
}): React.JSX.Element {
  const progress = discovery?.execution?.progress,
    total = discovery?.tasks.length ?? 0,
    completed = discovery ? processedImportTasks(discovery.tasks) : 0,
    work = discovery?.type === 'semantic' ? 'content tasks' : 'structure tasks',
    execution = discovery?.execution,
    seconds = progress ? Math.floor(progress.elapsedMs / 1000) : 0,
    elapsed = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`,
    activity = !progress
      ? 'Preparing the next request…'
      : progress.state === 'completed'
        ? 'Saving the response…'
        : ['failed', 'unknown', 'cancelled'].includes(progress.state)
          ? 'Checking the interrupted response…'
          : progress.responseCharacters > 0
            ? `Receiving response · ${progress.responseCharacters.toLocaleString()} characters`
            : 'Waiting for ChatGPT’s response…'
  return (
    <div className={styles.processing} tabIndex={-1} data-import-focus aria-label={label}>
      <div className={styles.processingHeading}>
        {reducedMotion ? null : <Loader size="sm" aria-hidden="true" />}
        <p>{label}</p>
      </div>
      {total > 0 ? (
        <>
          <progress
            className={styles.progressBar}
            value={completed}
            max={total}
            aria-label={`${work} processed`}
            aria-valuetext={`${completed} of ${total} ${work} processed`}
          />
          <p>
            {completed} of {total} {work} processed
          </p>
          {execution ? (
            <p className={styles.helper}>
              Request attempts this run: {execution.used} · limit {execution.ceiling}
            </p>
          ) : null}
          {!stopping ? (
            <p className={styles.helper}>
              {activity}
              {progress ? ` · ${elapsed} on this request` : ''}
            </p>
          ) : null}
          <p className={styles.helper}>
            Requests vary in duration. This progress does not measure account usage; Collie can’t
            see your remaining ChatGPT allowance. Cancel stops further requests and keeps completed
            findings.
          </p>
        </>
      ) : null}
    </div>
  )
}
