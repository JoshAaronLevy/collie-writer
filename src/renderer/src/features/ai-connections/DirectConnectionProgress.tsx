import type { AiStatus } from '../../../../shared/ai'
import type { DirectStage } from '../../../../shared/ai-direct'
import { connectionReason } from './connection-copy'
import styles from './AiConnections.module.css'

const stages: Record<DirectStage, string> = {
  registration: 'App registration',
  'browser-sign-in': 'Browser sign-in',
  'code-exchange': 'Authorization-code exchange',
  'identity-validation': 'Account identity validation',
  'plan-authorization': 'ChatGPT plan authorization',
  renewal: 'Session renewal',
  'model-discovery': 'Account model discovery',
  'model-preference': 'Saving model choice',
  'inference-http': 'Request admission',
  'inference-stream': 'Response stream',
  'credential-storage': 'Protected credential storage'
}
const inference: Record<NonNullable<AiStatus['direct']>['inference'], string> = {
  'not-run': 'No request completed in this account session.',
  sending: 'Submitting the reviewed request…',
  streaming: 'Receiving text; completion is still pending.',
  completed:
    'OpenAI reported a completed response. The conversation shows its local saving status.',
  failed: 'The request failed. Any partial text remains in its conversation.',
  incomplete: 'OpenAI reported an incomplete response. Partial text is not a completed result.',
  unknown:
    'The stream was interrupted; remote completion is unknown. Nothing will resend automatically.',
  cancelled: 'Stopped before submission was confirmed.'
}
const recovery: Record<string, string> = {
  subscription_sharing_user_not_eligible:
    'OpenAI reports that this account is not eligible for plan sharing. This is an account-access prerequisite; no API billing fallback is available.',
  subscription_sharing_usage_limit_exceeded:
    'The account reached its shared usage limit. Review app access and usage in ChatGPT Settings; Collie will not buy credits or change spending settings.',
  subscription_sharing_usage_unavailable:
    'OpenAI could not determine available usage. Try a new reviewed request later; this saved attempt will not resend.',
  subscription_sharing_route_not_supported:
    'OpenAI refused this authorization route. Retain the stage, status and code for review before changing the integration.',
  chatpass_v2_scope_not_authorized:
    'Plan-use permission was refused. Reauthorize this saved account and review its app permissions in ChatGPT.',
  invalid_grant:
    'Use Continue with ChatGPT for this saved account. Collie retains its issued registration and starts a fresh authorization code flow.',
  invalid_client:
    'OpenAI refused the issued app registration. Retain this failure stage and code for review.'
}
export function DirectConnectionProgress({
  status
}: {
  status: AiStatus | null
}): React.JSX.Element | null {
  if (!status || !status.direct) return null
  const direct = status.direct
  const issue = direct.issue,
    catalog = status.catalog
  return (
    <div className={styles['ai-execution-availability']}>
      <h3>ChatGPT plan connection</h3>
      {direct.preparation === 'running' ? <p role="status">Setting up ChatGPT…</p> : null}
      {direct.preparation === 'waiting' ? (
        <p role="status">Setup will continue when current work is protected.</p>
      ) : null}
      {direct.preferences !== 'ready' ? (
        <p role="alert">
          {direct.preferences === 'pending'
            ? 'Your model choice is waiting to be saved. Keep Collie open and retry saving it on this device.'
            : 'Saved model choices could not be read. Your account has been kept. Retry reading the choices; Collie will not replace them automatically.'}
        </p>
      ) : null}
      <dl>
        <div>
          <dt>Account sign-in</dt>
          <dd>
            {direct.authentication === 'verified'
              ? 'Identity verified.'
              : direct.authentication === 'reconnect-required'
                ? 'Session needs renewal or reauthorization.'
                : 'No active verified session.'}
          </dd>
        </div>
        <div>
          <dt>Plan authorization</dt>
          <dd>
            {direct.planAuthorized
              ? 'Plan-use permission is present in the validated grant. Usage limits still apply.'
              : 'Plan use has not been authorized for the selected account.'}
          </dd>
        </div>
        <div>
          <dt>Models</dt>
          <dd>
            {catalog?.state === 'loaded'
              ? `${catalog.models.length} model choices received for this account${catalog.selectedModelId ? '; a model is selected.' : '; choose a model.'}`
              : catalog?.state === 'loading'
                ? 'Reading account models…'
                : catalog?.state === 'failed'
                  ? 'Model discovery failed.'
                  : 'Models have not been requested for this connection.'}
          </dd>
        </div>
        <div>
          <dt>Latest request in this session</dt>
          <dd>{inference[direct.inference]}</dd>
        </div>
      </dl>
      {direct.stage ? <p>Latest connection stage: {stages[direct.stage]}.</p> : null}
      {issue ? (
        <div role="alert" className={styles['ai-request-error']}>
          <p>
            {stages[issue.stage]}:{' '}
            {issue.kind === 'invalid-response'
              ? 'The response did not match the supported contract.'
              : issue.kind === 'incomplete'
                ? 'The provider returned an incomplete response.'
                : connectionReason[issue.reason]}
          </p>
          {issue.code && recovery[issue.code] ? <p>{recovery[issue.code]}</p> : null}
          {issue.stage === 'credential-storage' ? (
            <p>
              Keep Collie open and retry saving connection state. This action writes the retained
              state locally; it does not repeat sign-in or inference.
            </p>
          ) : null}
          {issue.httpStatus !== null || issue.code || issue.bodyKind ? (
            <p>
              {issue.httpStatus !== null ? `HTTP ${issue.httpStatus} · ` : ''}
              {issue.code ? `Code: ${issue.code}` : 'No safe machine error code'}
              {issue.bodyKind ? ` · Error shape: ${issue.bodyKind}` : ''}
              {issue.parameter ? ` · Field: ${issue.parameter}` : ''}
            </p>
          ) : null}
          {issue.requestId ? <p>OpenAI request reference: {issue.requestId}</p> : null}
        </div>
      ) : null}
    </div>
  )
}
