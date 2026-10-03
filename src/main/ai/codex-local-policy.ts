import type { AiExecutionReadiness } from '../../shared/ai-catalog'
import type { AiFeatureAvailability, AiSession } from '../../shared/ai-route'
import { selectAiRoute } from './deployment'
import { AiError } from './errors'

/** Published 0.160.0 has model-driven tools outside the feature flags and a
 * mandatory SQLite log sink. Ephemeral threads do not close either gap. This
 * must be replaced with enforced controls, never an approval/bypass flag. */
export function localExecutionReadiness(): AiExecutionReadiness {
  return {state:'unavailable',blockers:['local-tool-isolation-unavailable','local-content-logging-unavailable']}
}
export function requireLocalTextIsolation(): void {
  if (selectAiRoute().kind!=='local-codex-chatgpt') throw new AiError('development-access-unavailable')
  if (localExecutionReadiness().state==='unavailable') throw new AiError('isolation-unresolved')
}
export function localFeatureAvailability(session: AiSession): AiFeatureAvailability {
  const reason = session.state==='saved-needs-resume' ? 'resume-required' :
    session.state==='unavailable' ? session.reason : session.state==='signed-out'||session.state==='reconnect-required' ? 'reconnect-required' : null
  // CD04 shares durable dispatch across both adapters. Its transport prerequisite
  // is still refused; a catalog or connection cannot enable either action.
  return {conversation:{state:'unavailable',reason:reason??'local-tool-isolation-unavailable'},
    proofread:{state:'unavailable',reason:reason??'local-tool-isolation-unavailable'}}
}
