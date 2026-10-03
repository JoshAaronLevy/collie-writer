import { app } from 'electron'
import type { AiFunding, AiRoute } from '../../shared/ai-route'
import { RELEASE, type ReleaseChannel } from '../release'
import { AiError } from './errors'

export const CODEX_VERSION = '0.160.0'
/** Source-owned CD01 policy, not a runtime flag or an assertion of provider approval. */
export const LOCAL_CODEX_POLICY = Object.freeze({
  revision: 1 as const,
  scope: 'owner-unpackaged-development' as const,
  providerClassification: 'unresolved' as const
})

/** Read only trusted main identity. In particular RELEASE's development fallback
 * for missing package metadata MUST NOT enable the owner-only route in a package. */
export function selectAiRoute(): AiRoute {
  if (!app.isPackaged && RELEASE.channel === 'development' && RELEASE.distribution === 'development' &&
    RELEASE.appId === 'com.colliewriter.app.dev') {
    return { kind: 'local-chatgpt-plan', policyRevision: 1,
      scope: 'owner-unpackaged-development', providerClassification: 'unresolved' }
  }
  if (app.isPackaged && RELEASE.channel === 'development') return { kind: 'unavailable', reason: 'packaged-development-refused' }
  if (app.isPackaged && RELEASE.distribution === 'direct' &&
    (RELEASE.channel === 'production' && RELEASE.appId === 'com.colliewriter.app' ||
      RELEASE.channel === 'beta' && RELEASE.appId === 'com.colliewriter.app.beta')) {
    return { kind: 'registered-openai', policyRevision: 1 }
  }
  return { kind: 'unavailable', reason: 'unsupported-app-identity' }
}

export function routeFunding(route: AiRoute): AiFunding {
  if (route.kind === 'local-codex-chatgpt'||route.kind==='local-chatgpt-plan') return { kind: 'normal-subscription', credits: 'account-settings', apiKeyFallback: false, appBillingChanges: false }
  if (route.kind === 'registered-openai') return { kind: 'included-only', enforcement: 'unresolved', apiKeyFallback: false, appBillingChanges: false }
  return { kind: 'unavailable', apiKeyFallback: false, appBillingChanges: false }
}

/** CD02 owns managed login; never fall through to registered OAuth for local auth. */
export function requireRegisteredRoute(): void {
  if (selectAiRoute().kind !== 'registered-openai') throw new AiError('development-access-unavailable')
}
export const OPENAI = Object.freeze({
  issuer: 'https://auth.openai.com',
  authorize: 'https://auth.openai.com/api/accounts/authorize',
  token: 'https://auth.openai.com/api/accounts/oauth/token',
  discovery: 'https://auth.openai.com/.well-known/openid-configuration',
  jwks: 'https://auth.openai.com/.well-known/jwks.json',
  resource: 'https://api.openai.com/v1'
})
/** Filled in source only after recording the authentic route and its channel scope.
 * No environment variable, renderer input or profile file confers provider rights. */
export type OpenAiRegistration = {
  clientId: string
  callbackPath: '/auth/callback'
  callbackPort: number // 0 only if this registration explicitly permits variable loopback ports.
  permissionReference: string
  commercialReference: string | null
}
export const OPENAI_REGISTRATIONS: Readonly<Record<ReleaseChannel, OpenAiRegistration | null>> = Object.freeze({
  development: null, beta: null, production: null
})
export function registration(): OpenAiRegistration {
  requireRegisteredRoute()
  const value = OPENAI_REGISTRATIONS[RELEASE.channel]
  if (!value) throw new AiError(RELEASE.channel==='development' ? 'development-access-unavailable' : 'commercial-activation-pending')
  if (!/^oaiapp_[A-Za-z0-9_-]+$/.test(value.clientId) || !value.permissionReference || value.callbackPath!=='/auth/callback' ||
    !Number.isInteger(value.callbackPort) || value.callbackPort<0 || value.callbackPort>65535 ||
    (RELEASE.channel==='production' && !value.commercialReference)) throw new AiError('configuration-required')
  return value
}
/** Deliberate production refusal, not an invented funding flag. Replace only with
 * a documented provider-enforced restriction bound to every internal request. */
export function requireIncludedFunding(): never { throw new AiError('funding-unknown') }

/** Config switches alone do not yet establish that this release has no implicit
 * tool/config discovery. Keep execution closed until the exact isolation contract
 * is established; the transport and documented restrictions are implemented. */
export function requireTextOnlyRuntime(): never { throw new AiError('isolation-unresolved') }
