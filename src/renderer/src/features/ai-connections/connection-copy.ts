import type { AiReason, AiStatus } from '../../../../shared/ai'
import type {
  AiActionAvailability,
  AiConnectionReason,
  AiFunding
} from '../../../../shared/ai-route'

export const connectionReason: Record<AiReason | AiConnectionReason, string> = {
  'local-login-not-implemented':
    'The local development route is defined. Browser sign-in is not implemented yet.',
  'local-execution-not-implemented': 'Local Codex execution is not implemented yet.',
  'conversation-adapter-not-ready':
    'Codex conversations are not ready yet. You can save a request locally.',
  'proofreading-adapter-not-ready':
    'Proofreading is unavailable on the current route. You can save a review locally.',
  'packaged-development-refused':
    'The local development connection is unavailable in packaged apps.',
  'unsupported-app-identity': 'This app identity cannot use the local development connection.',
  'commercial-requirements-pending':
    'Commercial provider configuration, included-only usage and safe execution remain unresolved.',
  'resume-required': 'Resume the saved Codex connection explicitly before requesting AI work.',
  'reconnect-required': 'Reconnect your account before requesting AI work.',
  'secure-session-unavailable': 'A secure isolated Codex session is unavailable on this device.',
  'login-timeout':
    'Codex did not finish this account action in time. If you closed the browser, cancel or start a new sign-in when available.',
  'callback-port-in-use':
    'Another app is using the Codex sign-in callback port. Finish its login or close it, then try again. Collie has not cancelled that login.',
  'browser-unavailable':
    'Collie could not confirm opening the system browser. Make a default browser available, then start a new sign-in. If an old sign-in window appears later, close it and use the newest attempt.',
  'login-denied':
    'Codex could not complete sign-in. Review any browser message, then start a new attempt when ready.',
  'login-offline':
    'Codex could not reach the account service. Continue writing locally and retry when online.',
  'login-completed-before-cancel':
    'Sign-in finished before cancellation could take effect. The connected account is shown below; choose Disconnect if you no longer want it connected.',
  'local-config-conflict':
    'External Codex configuration or an unexpected credential file conflicts with this isolated connection. Collie has stopped the session and retained its files. Keep your existing Codex settings; report this refusal for help.',
  'local-runtime-exited':
    'The Codex account process stopped. Resume the saved connection explicitly, or reconnect if needed.',
  'local-stop-pending':
    'Codex is still stopping. Keep Collie open while its current owner settles; no replacement connection can start yet.',
  'local-cleanup-required':
    'Some inactive Collie Codex credentials still need local sign-out. Use Clean up inactive sessions to retry their removal.',
  'local-protection-required':
    'An account metadata write is unconfirmed. Keep Collie open and retry saving connection state. This retry stays on this device.',
  'local-account-changed':
    'The saved account no longer matches this Codex profile. Continue with ChatGPT to authorize the intended account again.',
  'model-catalog-unavailable':
    'The provider could not supply a supported model catalog. Refresh models to try again. No model or request was substituted.',
  'model-catalog-timeout':
    'The provider did not finish listing models in time. Refresh models when you want to retry; no writing was sent.',
  'local-tool-isolation-unavailable':
    'Text requests are disabled: this Codex version can expose model-provided tools that Collie cannot yet suppress.',
  'local-content-logging-unavailable':
    'Text requests are disabled: this Codex version can save response content in its local diagnostic database. Protected runtime storage is not implemented yet.',
  'connect-required':
    'Connect your ChatGPT account to choose a model for future reviewed requests. Local saving is available without a connection.',
  'account-work-pending':
    'An account or model action is finishing. Wait for its result; your draft stays here.',
  'model-refresh-required':
    'Refresh models to read the connected account catalog, then choose a model. No writing is sent by these actions.',
  'model-selection-required': 'Choose a model below, then review your request again.',
  'no-text-models':
    'The provider returned no supported text models. You can save locally and explicitly refresh the catalog later.',
  'ai-work-pending':
    'An AI request is still finishing. Wait for its outcome, or stop it in its conversation or proofreading panel.',
  'output-protection-required':
    'Wait for local AI work to be protected. If protection needs attention, use the global work notice to return to its owner and retry local protection. This does not resend a request.',
  'operation-capacity-full':
    'All 64 active AI slots are occupied. Open the original projects shown under Local AI capacity, finish local protection, and acknowledge any retained uncertain outcomes in the AI work notice. These actions do not resend requests. Saved history and local saving remain available.',
  'local-workspace-identity-unavailable':
    'Codex has not supplied a usable account and workspace identity. Open connection settings and explicitly resume or reconnect the intended account; no request has been sent.',
  'plan-authorization-required':
    'Sign-in succeeded, but ChatGPT plan use is not authorized. Use Continue with ChatGPT for this saved account and review the plan-use consent.',
  'configuration-required': 'Sign-in has not been configured for this build.',
  'development-access-unavailable':
    'Supported development sign-in is not available in this build yet.',
  'commercial-activation-pending':
    'Provider approval and configuration for this release are still pending.',
  'secure-storage-unavailable':
    'Protected account storage is unavailable on this device. Writing remains available.',
  'storage-unavailable':
    'Local account storage needs attention. Keep this window open and review Data & recovery.',
  'signed-out': 'Sign in with your own account when the connection becomes available.',
  'session-expired': 'This account needs to be reconnected before new AI work can start.',
  'consent-required':
    'Account permission is missing. Reconnect and review the permissions in your browser.',
  'funding-unknown':
    'Subscription-only usage cannot yet be guaranteed, so AI requests are disabled. There is no paid-credit or API-key fallback.',
  'runtime-unavailable':
    'The AI runtime is unavailable in this build. Local writing and research still work.',
  'isolation-unresolved':
    'The runtime’s access to tools and local files must be constrained before AI requests can be enabled.',
  'model-unavailable':
    'The selected model is unavailable. No other model or account will be used automatically.',
  'read-only-project':
    'Choose an editable project under Collie access before starting new AI work.',
  busy: 'An account action, AI request or local acknowledgment is still finishing. Use its global notice to return, stop or reconcile it before changing accounts.',
  'invalid-request':
    'This account action could not be accepted. Check connection status before trying again.',
  cancelled:
    'Sign-in was cancelled. Your project and any previously connected account remain available.',
  'auth-failed':
    'Sign-in could not be completed. Check status, then try again when Connect is available.',
  offline:
    'The provider could not be reached. Continue writing locally and try again when you are online.',
  'quota-exhausted':
    'The provider reported a usage limit. Collie will not buy credits, change spending settings or switch billing routes.',
  'provider-failed':
    'The provider could not complete this action. Check status before trying again.',
  'outcome-unknown':
    'The action’s result could not be confirmed. Check status before starting another sign-in or account change.',
  'output-limit':
    'The request exceeded the supported content limit. Narrow its scope before a new request.',
  'context-changed':
    'The approved request no longer matches this action. Review the intended context again.'
}

export function featureDescription(feature: AiActionAvailability): string {
  return feature.state === 'unavailable'
    ? connectionReason[feature.reason]
    : 'Available for a new reviewed request. Provider access and usage limits are checked again when sending.'
}

export function fundingDescription(funding: AiFunding): string {
  if (funding.kind === 'normal-subscription')
    return 'Local development follows your normal ChatGPT subscription and account spending settings. Available credits may be consumed. Collie will not buy credits, enable top-ups, change your plan or use API-key fallback.'
  if (funding.kind === 'included-only') return connectionReason['funding-unknown']
  return 'AI spending is unavailable for this app identity.'
}

export function connectionLabel(
  status: AiStatus | null,
  checking = false,
  action?:
    | 'connect'
    | 'cancel'
    | 'refresh'
    | 'disconnect'
    | 'select'
    | 'resume'
    | 'cleanup'
    | 'protectConnection'
    | 'refreshModels'
    | 'selectModel'
): string {
  if (action === 'cancel') return 'Cancelling sign-in…'
  if (action === 'select') return 'Selecting account…'
  if (action === 'resume') return 'Resuming Codex connection…'
  if (action === 'cleanup') return 'Signing out inactive Codex sessions…'
  if (action === 'protectConnection') return 'Saving connection state on this device…'
  if (action === 'refreshModels' || status?.catalog?.state === 'loading')
    return 'Loading account models…'
  if (action === 'selectModel') return 'Selecting model…'
  if (action === 'connect' && status?.state !== 'signing-in') return 'Starting browser sign-in…'
  if (action === 'refresh') return 'Renewing account session…'
  if (action === 'disconnect') return 'Disconnecting account…'
  if (!status) return checking ? 'Checking connection…' : 'Connection status unavailable'
  if (status.route.kind === 'local-codex-chatgpt' && status.session.state === 'unavailable')
    return 'Local development · connection unavailable'
  if (status.session.state === 'saved-needs-resume')
    return 'Saved Codex connection · resume required'
  if (status.session.state === 'resuming') return 'Resuming Codex connection…'
  if (status.session.state === 'reconnect-required')
    return 'Account needs renewal or reauthorization'
  if (status.state === 'signing-in' && status.local && !status.local.cancellable)
    return 'Finishing Codex connection…'
  if (status.state === 'signing-in') return 'Waiting for browser sign-in'
  if (status.state === 'refreshing') return 'Renewing account session…'
  if (status.state === 'disconnecting') return 'Disconnecting account…'
  const account = status.connections.find((item) => item.id === status.activeConnectionId)
  if (account?.state === 'expired') return 'Account session expired'
  if (account?.state === 'signed-in')
    return status.features.conversation.state === 'available' ||
      status.features.proofread.state === 'available'
      ? 'Signed in · Reviewed requests available'
      : 'Signed in · AI unavailable'
  return status.channelPermitted && status.configured ? 'Not connected' : 'Connection unavailable'
}

export function signInUnavailable(status: AiStatus): AiReason | AiConnectionReason | null {
  const localPrerequisite = status.reasons.find((reason) =>
    ['secure-storage-unavailable', 'storage-unavailable', 'runtime-unavailable'].includes(reason)
  )
  if (status.route.kind === 'local-codex-chatgpt' && localPrerequisite) return localPrerequisite
  if (status.session.state === 'unavailable') return status.session.reason
  return (
    status.reasons.find((reason) =>
      [
        'development-access-unavailable',
        'commercial-activation-pending',
        'configuration-required',
        'secure-storage-unavailable',
        'storage-unavailable'
      ].includes(reason)
    ) ?? null
  )
}

export const connectionProblemReasons: AiReason[] = [
  'auth-failed',
  'offline',
  'cancelled',
  'consent-required',
  'session-expired',
  'quota-exhausted',
  'outcome-unknown',
  'provider-failed'
]
