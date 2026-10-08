import { useAiConnections } from './connectionState'
import { DirectConnectionProgress } from './DirectConnectionProgress'
import {
  connectionReason,
  featureDescription,
  fundingDescription,
  signInUnavailable
} from './connection-copy'
import styles from './AiConnections.module.css'

export function ChatGptConnectionDetails(): React.JSX.Element {
  const { status } = useAiConnections()
  const direct = status?.route.kind === 'local-chatgpt-plan'
  const local = status?.route.kind === 'local-codex-chatgpt'
  const unavailable = status ? signInUnavailable(status) : null
  return (
    <div className={styles['chatgpt-connection-details']}>
      <DirectConnectionProgress status={status} />
      <dl>
        <div>
          <dt>Sign-in access</dt>
          <dd>
            {status
              ? unavailable
                ? connectionReason[unavailable]
                : status.channelPermitted && status.configured
                  ? 'Configured for this build. Account sign-in is separate from AI eligibility.'
                  : 'Unavailable in this build.'
              : 'Status has not been loaded.'}
          </dd>
        </div>
        <div>
          <dt>Commercial activation</dt>
          <dd>
            {status?.commercialApproved
              ? 'An approval reference is recorded by the app. Other AI requirements still apply.'
              : direct
                ? 'Commercial approval is not recorded. This personal local milestone is separate; packaged use remains unavailable.'
                : 'Approval is not recorded for this build. Local writing remains available.'}
          </dd>
        </div>
        <div>
          <dt>Spending policy</dt>
          <dd>{status ? fundingDescription(status.funding) : 'Not established.'}</dd>
        </div>
        {status ? (
          <>
            <div>
              <dt>Conversations</dt>
              <dd>{featureDescription(status.capabilities.text)}</dd>
            </div>
            <div>
              <dt>Web research</dt>
              <dd>
                {status.capabilities.webResearch.contract === 'documented'
                  ? status.capabilities.webResearch.eligibility.state === 'observed-refusal'
                    ? 'The last web-search request was refused for this account and model. You can choose another model or send with Search the web off.'
                    : status.capabilities.webResearch.eligibility.state === 'observed-success'
                      ? 'Web search succeeded for this account and model in this session. Access can change; each request is checked by ChatGPT.'
                      : status.capabilities.webResearch.state === 'available'
                        ? 'Ready for an explicit Search the web request. ChatGPT will check access for your account and model when you send.'
                        : 'Finish connecting ChatGPT and choosing a model to request web search.'
                  : 'Unavailable with this connection. A web-research route has not been established for this build.'}
              </dd>
            </div>
            <div>
              <dt>Proofreading</dt>
              <dd>{featureDescription(status.features.proofread)}</dd>
            </div>
          </>
        ) : null}
        <div>
          <dt>Inference route</dt>
          <dd>
            {direct
              ? 'Direct text requests using the selected account’s ChatGPT-plan credential. No agent runtime or tool executor.'
              : status?.runtime === 'development-installed'
                ? 'The development runtime is present; safe execution is not enabled.'
                : status?.runtime === 'not-packaged'
                  ? 'The runtime is not included in this packaged build.'
                  : 'The runtime is unavailable.'}
          </dd>
        </div>
        <div>
          <dt>Models & workspace</dt>
          <dd>
            {direct
              ? 'Refresh models reads the selected registration’s account catalog. Its issued client ID remains bound to its original workspace. A completed request establishes inference access for that request.'
              : local
                ? 'Model choices come from the explicitly requested runtime catalog. Selection is not proof of account access. Collie must retain the runtime’s actual account and workspace identity for each request.'
                : 'No model or provider workspace is authorized for requests yet. Sign-in does not establish model eligibility.'}
          </dd>
        </div>
      </dl>
      {status?.reasons.includes('isolation-unresolved') ? (
        <p>{connectionReason['isolation-unresolved']}</p>
      ) : null}
      <p>
        Collie access and the provider account are separate. Connecting cannot change your free
        editable project or unlock paid Collie features.
      </p>

      <p>
        Check status reads local state only. Account setup may renew your session and load model
        choices. It sends no writing and starts no AI request.
      </p>
      <p>
        {direct
          ? 'Credentials and model preferences are encrypted in local application storage.'
          : 'Credentials stay in the separate account storage for this connection.'}
      </p>
    </div>
  )
}
