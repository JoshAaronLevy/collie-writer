import { useId } from 'react'
import { AppButton, SelectField } from '../../components/ui/Controls'
import { useWorkspaceSession } from '../workspace/workspaceContext'
import { useAiConnections } from './connectionState'
import { connectionReason } from './connection-copy'
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
    !status.activeConnectionId ||
    status.route.kind !== 'local-chatgpt-plan' ||
    !status.catalog
  )
    return null
  const catalog = status.catalog,
    connectionId = status.activeConnectionId
  const blocked =
    disabled ||
    busy ||
    session.closing ||
    session.navigating ||
    !session.available ||
    issue === 'outcome-unknown'
  return (
    <section className={styles['ai-model-selection']} aria-labelledby={heading}>
      <h3 id={heading}>Model</h3>
      {catalog.state === 'loading' ? <p role="status">Setting up ChatGPT…</p> : null}
      {status.connectionHealth.reason === 'model-unavailable' ? (
        <p role="status">Your previous model is unavailable. Choose a replacement below.</p>
      ) : null}
      {catalog.state === 'failed' ? <p role="alert">{connectionReason[catalog.reason]}</p> : null}
      {catalog.state === 'loaded' && catalog.models.length === 0 ? (
        <p role="status">No supported models are available. Try again later.</p>
      ) : null}
      {catalog.state === 'loaded' && catalog.models.length > 0 ? (
        <SelectField
          label="Model for this account"
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
      ) : null}
      <AppButton
        variant="default"
        disabled={!connectionId || !status.actions.refreshModels || blocked}
        pending={pending?.kind === 'prepareConnection'}
        onClick={(event) => {
          if (connectionId)
            void connections.accountAction('prepareConnection', connectionId, event.currentTarget)
        }}
      >
        {catalog.state !== 'loaded' || !catalog.models.length ? 'Try again' : 'Refresh models'}
      </AppButton>
    </section>
  )
}
