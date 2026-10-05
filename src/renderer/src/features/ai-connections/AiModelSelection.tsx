import { useId } from 'react'
import { AppButton, SelectField } from '../../components/ui/Controls'
import { useWorkspaceSession } from '../workspace/workspaceContext'
import { useAiConnections } from './connectionState'
import { connectionReason, featureDescription } from './connection-copy'
import styles from './AiConnections.module.css'

export function AiModelSelection({
  disabled = false
}: {
  disabled?: boolean
}): React.JSX.Element | null {
  const connections = useAiConnections(),
    session = useWorkspaceSession(),
    heading = useId()
  const { status, pending, busy, issue } = connections
  if (
    !status ||
    !['local-codex-chatgpt', 'local-chatgpt-plan'].includes(status.route.kind) ||
    !status.catalog
  )
    return null
  const direct = status.route.kind === 'local-chatgpt-plan'
  const catalog = status.catalog,
    connectionId = status.activeConnectionId
  const selected =
    catalog.state === 'loaded'
      ? catalog.models.find((model) => model.id === catalog.selectedModelId)
      : undefined
  const blocked =
    disabled ||
    busy ||
    session.closing ||
    session.navigating ||
    !session.available ||
    issue === 'outcome-unknown'
  return (
    <section className={styles['ai-model-selection']} aria-labelledby={heading}>
      <h3 id={heading}>{direct ? 'Model' : 'Codex models'}</h3>
      <p>
        {direct
          ? 'Collie sets up models after you connect and remembers your choice for this account. Setup sends no writing and starts no AI request.'
          : 'Refresh reads the catalog reported by your connected Codex runtime. It sends no writing and does not run a model. A listed model may still be refused by your account.'}
      </p>
      <AppButton
        variant="default"
        disabled={!connectionId || !status.actions.refreshModels || blocked}
        pending={pending?.kind === 'refreshModels' || pending?.kind === 'prepareConnection'}
        onClick={(event) => {
          if (connectionId)
            void connections.accountAction(
              direct ? 'prepareConnection' : 'refreshModels',
              connectionId,
              event.currentTarget
            )
        }}
      >
        {direct && (catalog.state !== 'loaded' || !catalog.models.length)
          ? 'Try again'
          : 'Refresh models'}
      </AppButton>
      {catalog.state === 'not-loaded' ? (
        <p>
          {direct
            ? 'Connect ChatGPT to set up models automatically. For a saved account, choose Try again.'
            : 'Connect or resume, then refresh models.'}{' '}
          {direct ? '' : 'Choices stay in memory for this connection.'}
        </p>
      ) : null}
      {catalog.state === 'loading' ? (
        <p role="status">{direct ? 'Setting up ChatGPT…' : 'Reading the model catalog…'}</p>
      ) : null}
      {status.connectionHealth.reason === 'model-unavailable' ? (
        <p role="status">Your previous model is unavailable. Choose a replacement below.</p>
      ) : null}
      {catalog.state === 'failed' ? <p role="alert">{connectionReason[catalog.reason]}</p> : null}
      {catalog.state === 'loaded' && catalog.models.length === 0 ? (
        <p role="status">No supported models are available. Try again later.</p>
      ) : null}
      {catalog.state === 'loaded' && catalog.models.length > 0 ? (
        <>
          <SelectField
            label={direct ? 'Model for this account' : 'Model for future reviewed requests'}
            value={catalog.selectedModelId ?? ''}
            disabled={!status.actions.selectModel || blocked}
            data={[
              { value: '', label: 'Choose a model', disabled: true },
              ...catalog.models.map((model) => ({ value: model.id, label: model.label }))
            ]}
            onChange={(event) => {
              if (connectionId)
                void connections.selectModel(
                  {
                    connectionId,
                    catalogRevision: catalog.revision,
                    modelId: event.currentTarget.value
                  },
                  event.currentTarget
                )
            }}
          />
          {selected ? (
            <p>
              {direct
                ? `Selected: ${selected.label}. Saved for this account. Changing it starts no request.`
                : `Selected: ${selected.label}. Runtime default effort: ${selected.defaultReasoningEffort}. Reported efforts: ${selected.reasoningEfforts.join(', ')}. Collie uses the runtime default; this choice starts no request.`}
            </p>
          ) : null}
        </>
      ) : null}
      <div className={styles['ai-execution-availability']}>
        <h3>Text request availability</h3>
        {status.execution?.state === 'unavailable'
          ? status.execution.blockers.map((reason) => (
              <p key={reason}>{connectionReason[reason]}</p>
            ))
          : null}
        <p>Conversations: {featureDescription(status.features.conversation)}</p>
        <p>Proofreading: {featureDescription(status.features.proofread)}</p>
      </div>
    </section>
  )
}
