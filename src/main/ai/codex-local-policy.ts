import type { AiCatalog, AiExecutionReadiness } from '../../shared/ai-catalog'
import type { AiConnectionReason, AiFeatureAvailability, AiSession } from '../../shared/ai-route'
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
export function localFeatureAvailability(facts:{session:AiSession;catalog:AiCatalog|null;execution:AiExecutionReadiness;
  protectionPending:boolean;accountProtectionPending:boolean;busy:boolean;capacityFull:boolean;identityKnown:boolean}):AiFeatureAvailability {
  const {session,catalog,execution}=facts
  let reason:AiConnectionReason|null=null
  if(facts.accountProtectionPending)reason='local-protection-required'
  else if(facts.protectionPending)reason='output-protection-required'
  else if(session.state==='unavailable')reason=session.reason
  else if(session.state==='signed-out')reason='connect-required'
  else if(session.state==='saved-needs-resume')reason='resume-required'
  else if(session.state==='reconnect-required')reason='reconnect-required'
  else if(session.state!=='signed-in')reason='account-work-pending'
  else if(facts.busy)reason='ai-work-pending'
  else if(!catalog||catalog.state==='not-loaded')reason='model-refresh-required'
  else if(catalog.state==='loading')reason='account-work-pending'
  else if(catalog.state==='failed')reason=catalog.reason
  else if(!catalog.models.length)reason='no-text-models'
  else if(!catalog.selectedModelId)reason='model-selection-required'
  else if(!facts.identityKnown)reason='local-workspace-identity-unavailable'
  else if(facts.capacityFull)reason='operation-capacity-full'
  else if(execution.state==='unavailable')reason=execution.blockers[0]??'local-tool-isolation-unavailable'
  // This is a main-owned decision over actual runtime facts. CD03's enforced
  // policy still refuses execution; no setting can supply a ready state.
  if(reason||session.state!=='signed-in'||catalog?.state!=='loaded'||!catalog.selectedModelId)
    return {conversation:{state:'unavailable',reason:reason??'model-selection-required'},proofread:{state:'unavailable',reason:reason??'model-selection-required'}}
  return {conversation:{state:'available',connectionId:session.connectionId,model:catalog.selectedModelId},
    proofread:{state:'available',connectionId:session.connectionId,model:catalog.selectedModelId}}
}
