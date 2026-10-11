import type { DataLocations } from '../../../../shared/project-lifecycle'
import { AppButton } from '../../components/ui/Controls'
import recoveryStyles from './RecoveryPanel.module.css'

export function RecoveryPanel({
  data,
  disabled,
  refresh,
  reveal,
  inspect,
  recoverReset
}: {
  data: DataLocations | null
  disabled: boolean
  refresh: () => void
  inspect: (id: string) => void
  reveal: () => void
  recoverReset: (id: string) => void
}): React.JSX.Element {
  return (
    <details className={recoveryStyles['recovery-panel']} id="data-locations" tabIndex={-1}>
      <summary>Recovery history and backups</summary>
      <p>
        Review local recovery and separate files before restoring a copy. Inspection never replaces
        current writing.
      </p>
      <div className={recoveryStyles['recovery-actions']}>
        <AppButton variant="default" disabled={disabled} onClick={refresh}>
          Refresh recovery
        </AppButton>
        <AppButton variant="subtle" disabled={disabled} onClick={reveal}>
          Show local working folder
        </AppButton>
      </div>
      {data ? (
        <>
          {data.issues ? (
            <p>{data.issues} recovery entries need attention. Existing work is kept.</p>
          ) : null}
          <h3>Backups and retained versions</h3>
          <p>
            Inspection validates the archive and offers an independent copy. Current work and
            original files stay intact.
          </p>
          {data.items.length ? (
            <ul className={recoveryStyles['recovery-version-list']}>
              {data.items.map((item) => (
                <li key={item.id}>
                  <strong>
                    {item.kind === 'backup'
                      ? 'Backup file'
                      : item.kind === 'previous'
                        ? 'Previous selected-file copy'
                        : item.kind === 'candidate'
                          ? 'Retained local snapshot'
                          : 'Retained incoming file'}
                  </strong>
                  <p className={recoveryStyles['recovery-path']}>{item.path}</p>
                  <p>{item.status}</p>
                  <AppButton variant="default" disabled={disabled} onClick={() => inspect(item.id)}>
                    Inspect and restore copy
                  </AppButton>
                </li>
              ))}
            </ul>
          ) : (
            <p>
              No retained portable versions found. Local projects remain recoverable in the project
              list above.
            </p>
          )}
          {data.resets.length ? (
            <>
              <h3>Reset recovery</h3>
              <ul className={recoveryStyles['reset-recovery-list']}>
                {data.resets.map((batch) => (
                  <li key={batch.id}>
                    <div>
                      <p>{batch.projects} projects from an earlier reset are available.</p>
                      <ul>
                        {batch.titles.map((title, index) => (
                          <li key={index}>{title}</li>
                        ))}
                      </ul>
                    </div>
                    <AppButton
                      variant="default"
                      disabled={disabled}
                      onClick={() => recoverReset(batch.id)}
                    >
                      Restore projects
                    </AppButton>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </>
      ) : (
        <p>Recovery details are loading or unavailable. Existing work is retained.</p>
      )}
    </details>
  )
}
