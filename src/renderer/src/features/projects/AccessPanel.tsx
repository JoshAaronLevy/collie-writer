import { AppButton } from '../../components/ui/Controls'
import styles from '../settings/CollieAccess.module.css'
import type { AccessView } from '../../../../shared/access'
import { canEditProject, sameProject } from '../../../../shared/access'
import type { OpenProject, ProjectList } from '../../../../shared/projects'
import DirectAccessPanel from './DirectAccessPanel'

const stateLabels: Record<AccessView['state'], string> = {
  free: 'Free access',
  subscription: 'Subscription access',
  grace: 'Subscription · offline access',
  lifetime: 'Lifetime access',
  expired: 'Subscription access ended',
  revoked: 'Paid access ended',
  unavailable: 'Paid access could not be confirmed'
}
export default function AccessPanel({
  access,
  project,
  list,
  disabled,
  designate,
  finish,
  importGrant
}: {
  access: AccessView | null
  project: OpenProject | null
  list: ProjectList
  disabled: boolean
  designate: () => void
  finish: () => void
  importGrant: () => void
}): React.JSX.Element {
  const designated = list.projects.find((p) => sameProject(p, access?.freeProject ?? null))
  return (
    <section className={styles['collie-access']} aria-labelledby="access-title">
      <h2 id="access-title" tabIndex={-1}>
        Collie access
      </h2>
      {!access ? (
        <p role="status">Reading local access settings…</p>
      ) : (
        <>
          <p role="status">
            {stateLabels[access.state]}.{' '}
            {access.paid
              ? 'All your projects are editable.'
              : 'Edit one personal project at a time; switch whenever you want.'}
          </p>
          <p>
            Reading, exports, backups and recovery remain available for every project. Free access
            has no time limit.
          </p>
          {!access.paid ? (
            <p>
              Free writing project:{' '}
              {designated?.title ??
                (access.freeProject ? 'A project outside this list' : 'None selected')}
              .
            </p>
          ) : null}
          {project && !canEditProject(access, project) ? (
            <AppButton variant="default" disabled={disabled} onClick={designate}>
              Write in this project
            </AppButton>
          ) : null}
          {access.transition ? (
            <div role="alert">
              <p>
                Editing access changed. Finish the change to save pending drafts, or choose this
                project for free writing. Keep this window open if saving cannot finish.
              </p>
              <AppButton variant="default" type="button" disabled={disabled} onClick={finish}>
                Finish access change
              </AppButton>
            </div>
          ) : null}
          {access.paidThrough ? (
            <p>
              Paid through {new Date(access.paidThrough).toLocaleString()}.
              {access.graceUntil
                ? ` Offline access until ${new Date(access.graceUntil).toLocaleString()}.`
                : ''}
            </p>
          ) : null}
          {access.clockWarning ? (
            <p role="alert">
              Correct this computer’s clock or restore current purchase access. Reading, exports,
              backups and free writing remain available.
            </p>
          ) : null}
          {access.storageWarning ? (
            <p role="alert">
              Editing access could not be fully read or saved. Your projects are kept. Contact
              support if switching projects or restoring access remains unavailable.
            </p>
          ) : null}
          <details>
            <summary>Edition details</summary>
            <p>
              Paid access adds unlimited editable projects, saved export recipes and multi-format
              exports. Free access can use existing recipes for one format at a time.
            </p>
            <p>
              Both editions cover nonfiction writing. Lifetime includes all future updates to the
              purchased edition. Taxes and the total appear before payment.
            </p>
            <p>
              Lifetime access works offline; subscriptions include up to 14 days of offline access
              after the paid period. Go online and refresh purchase access to receive renewals or
              changes.
            </p>
            {access.issuerConfigured ? (
              <AppButton variant="default" type="button" disabled={disabled} onClick={importGrant}>
                Restore from access file…
              </AppButton>
            ) : null}
          </details>
          <DirectAccessPanel />
        </>
      )}
    </section>
  )
}
