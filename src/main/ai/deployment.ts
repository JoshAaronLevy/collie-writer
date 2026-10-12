import { app } from 'electron'
import type { AiFunding, AiRoute } from '../../shared/ai-route'
import { RELEASE } from '../release'
import { AiError } from './errors'

/** Read only trusted main identity. In particular RELEASE's development fallback
 * for missing package metadata MUST NOT enable the owner-only route in a package. */
export function selectAiRoute(): Exclude<AiRoute, { kind: 'local-codex-chatgpt' }> {
  if (
    !app.isPackaged &&
    RELEASE.channel === 'development' &&
    RELEASE.distribution === 'development' &&
    RELEASE.appId === 'com.colliewriter.app.dev'
  ) {
    return {
      kind: 'local-chatgpt-plan',
      policyRevision: 1,
      scope: 'owner-unpackaged-development',
      providerClassification: 'unresolved'
    }
  }
  if (app.isPackaged && RELEASE.channel === 'development')
    return { kind: 'unavailable', reason: 'packaged-development-refused' }
  if (
    app.isPackaged &&
    RELEASE.distribution === 'direct' &&
    ((RELEASE.channel === 'production' && RELEASE.appId === 'com.colliewriter.app') ||
      (RELEASE.channel === 'beta' && RELEASE.appId === 'com.colliewriter.app.beta'))
  ) {
    return { kind: 'registered-openai', policyRevision: 1 }
  }
  return { kind: 'unavailable', reason: 'unsupported-app-identity' }
}

export function routeFunding(route: AiRoute): AiFunding {
  if (route.kind === 'local-codex-chatgpt' || route.kind === 'local-chatgpt-plan')
    return {
      kind: 'normal-subscription',
      credits: 'account-settings',
      apiKeyFallback: false,
      appBillingChanges: false
    }
  if (route.kind === 'registered-openai')
    return {
      kind: 'included-only',
      enforcement: 'unresolved',
      apiKeyFallback: false,
      appBillingChanges: false
    }
  return { kind: 'unavailable', apiKeyFallback: false, appBillingChanges: false }
}

export const OPENAI = Object.freeze({
  issuer: 'https://auth.openai.com',
  authorize: 'https://auth.openai.com/api/accounts/authorize',
  token: 'https://auth.openai.com/api/accounts/oauth/token',
  discovery: 'https://auth.openai.com/.well-known/openid-configuration',
  jwks: 'https://auth.openai.com/.well-known/jwks.json',
  resource: 'https://api.openai.com/v1'
})
/** RF16 keeps unapproved commercial identities closed without dormant authoring.
 * Historical credentials and operations confer no permission to send new work. */
export function requireDirectRoute(): void {
  const route = selectAiRoute()
  if (route.kind !== 'local-chatgpt-plan')
    throw new AiError(
      route.kind === 'registered-openai'
        ? 'commercial-activation-pending'
        : 'development-access-unavailable'
    )
}
