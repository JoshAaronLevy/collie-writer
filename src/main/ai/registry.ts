import { CodexRuntime } from './codex-runtime'
import { GrokRuntime } from './grok-runtime'
import type { AiStorage } from './storage'

/** Internal transport registry, NOT the set of connectable or eligible accounts.
 * Grok launch is closed in grok-deployment.ts; no renderer/provider-ID expansion
 * occurs until its protected account and portable-provenance owners are ready.
 */
export const PROVIDER_RUNTIMES = Object.freeze({
  'openai-codex': Object.freeze({ create: (storage: AiStorage) => new CodexRuntime(storage) }),
  'xai-grok-build': Object.freeze({ create: () => new GrokRuntime() })
})
