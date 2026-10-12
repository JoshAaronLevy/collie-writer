import { useState } from 'react'
import { AppButton } from '../../components/ui/Controls'
import type { DirectIssue } from '../../../../shared/ai-direct'
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
const recovery: Record<string, string> = {
  subscription_sharing_user_not_eligible: 'ChatGPT has not enabled this account for use in Collie.',
  subscription_sharing_usage_limit_exceeded:
    'ChatGPT reported a shared usage limit; review your usage in ChatGPT before sending another request.',
  subscription_sharing_usage_unavailable:
    'ChatGPT could not read your available usage; try a new request later.',
  subscription_sharing_route_not_supported:
    'ChatGPT refused this connection; use the support details to report it.',
  chatpass_v2_scope_not_authorized:
    'ChatGPT refused this app’s permission; signing in again does not fix this connection problem.',
  chatpass_v2_invalid_authorization_context:
    'ChatGPT could not accept this connection; use the support details to report it.',
  subscription_sharing_invalid_user:
    'ChatGPT could not validate this account for the request; your saved connection is kept.',
  subscription_sharing_unsupported_capability:
    'ChatGPT refused a request option; the support details identify it when available.',
  subscription_sharing_user_unavailable:
    'ChatGPT could not read your account information; try a new request later.',
  invalid_grant: 'Reconnect this saved account to authorize it again.',
  invalid_client: 'ChatGPT refused this app’s registration; use the support details to report it.'
}
/** Only actual failures have support details; normal connection state lives in the dialog. */
export function ChatGptConnectionIssue({
  status
}: {
  status: AiStatus | null
}): React.JSX.Element | null {
  const direct = status?.direct
  if (!direct) return null
  const issue = direct.issue
  return (
    <>
      {issue &&
      (!direct.lastRequestFailure ||
        (issue.stage !== 'inference-http' && issue.stage !== 'inference-stream')) ? (
        <DirectIssueDetails key={JSON.stringify(issue)} issue={issue} />
      ) : null}
      {direct.lastRequestFailure ? (
        <details className={styles['chatgpt-disclosure']}>
          <summary>Last request error</summary>
          <p>
            {new Date(direct.lastRequestFailure.occurredAt).toLocaleString()} ·{' '}
            {direct.lastRequestFailure.model}
          </p>
          <DirectIssueDetails
            key={direct.lastRequestFailure.operationId}
            issue={direct.lastRequestFailure.issue}
            failure={direct.lastRequestFailure}
          />
        </details>
      ) : null}
    </>
  )
}

function DirectIssueDetails({
  issue,
  failure
}: {
  issue: DirectIssue
  failure?: NonNullable<NonNullable<AiStatus['direct']>['lastRequestFailure']>
}): React.JSX.Element {
  const [copyNotice, setCopyNotice] = useState('')
  return (
    <div role="alert" className={styles['ai-request-error']}>
      <p>
        {issue.code && recovery[issue.code]
          ? recovery[issue.code]
          : issue.stage === 'credential-storage'
            ? 'Retry saving connection state on this device; this does not repeat sign-in or send a request.'
            : issue.kind === 'invalid-response'
              ? 'The response did not match the supported contract.'
              : issue.kind === 'incomplete'
                ? 'The provider returned an incomplete response.'
                : failure && issue.reason === 'outcome-unknown'
                  ? 'The response stopped before completion was confirmed. Any retained text stays with the request.'
                  : failure && issue.reason === 'provider-failed'
                    ? 'ChatGPT could not complete this message.'
                    : connectionReason[issue.reason]}
      </p>
      <details className={styles['chatgpt-disclosure']}>
        <summary>Details for support</summary>
        <p>{stages[issue.stage]}</p>
        {issue.httpStatus !== null || issue.code || issue.bodyKind ? (
          <p>
            {issue.httpStatus !== null ? `HTTP ${issue.httpStatus} · ` : ''}
            {issue.code ? `Code: ${issue.code}` : 'No safe machine error code'}
            {issue.bodyKind ? ` · Error shape: ${issue.bodyKind}` : ''}
            {issue.parameter ? ` · Field: ${issue.parameter}` : ''}
          </p>
        ) : null}
        {issue.requestId ? <p>OpenAI request reference: {issue.requestId}</p> : null}
        {issue.responseType ? <p>Response format: {issue.responseType}</p> : null}
        <AppButton
          variant="subtle"
          onClick={() => {
            setCopyNotice('')
            void window.collie
              .conversationPresentation(
                'copy',
                JSON.stringify(
                  {
                    route: 'local-chatgpt-plan',
                    ...(failure
                      ? {
                          operationId: failure.operationId,
                          model: failure.model,
                          occurredAt: new Date(failure.occurredAt).toISOString()
                        }
                      : {}),
                    ...issue
                  },
                  null,
                  2
                )
              )
              .then((ok) =>
                setCopyNotice(
                  ok ? 'Copied' : 'Could not copy. Select the details to copy them manually.'
                )
              )
              .catch(() =>
                setCopyNotice('Could not copy. Select the details to copy them manually.')
              )
          }}
        >
          Copy error details
        </AppButton>
        {copyNotice ? <p role="status">{copyNotice}</p> : null}
      </details>
    </div>
  )
}
