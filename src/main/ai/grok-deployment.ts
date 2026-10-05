import { AiError } from './errors'

/** Source/protocol reference, NOT a pinned distributable binary or permission. */
export const GROK_SOURCE_REVISION = '2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8'

type GrokLaunch = {
  executable: string
  cwd: string
  env: NodeJS.ProcessEnv
}

/** Missing engineering, deliberately not a configuration toggle.
 * The official ACP route consumes the runtime's cached subscription session.
 * Before spawning (initialize can refresh credentials), this owner must provide:
 * - a pinned, permitted binary and verified Collie-owned profile;
 * - supported encrypted credential lifecycle, never copied ~/.grok/auth.json;
 * - enforced included-only funding for every internal request;
 * - no tools, ambient config, automatic retries, sync or content diagnostics.
 * The returned environment must be built from an allowlist, never process.env.
 * See docs/ai/grok-runtime.md. No runtime is installed or launched by I14.
 */
export async function prepareGrokLaunch(): Promise<GrokLaunch> {
  throw new AiError('configuration-required')
}
