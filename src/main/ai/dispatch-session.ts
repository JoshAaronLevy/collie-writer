import type { AiPrepareInput } from '../../shared/ai'
import type { CodexTextUpdate } from './codex-text-turn'
import type { DispatchExecution } from './local-operation'

/** Main-only live authority. Never persisted, returned over IPC or reconstructed
 * from a journal. Registered OAuth and managed Codex have separate owners. */
export interface AiDispatchSession {
  readonly route:'registered-openai'|'local-codex-chatgpt'|'local-chatgpt-plan'
  authorize(input:AiPrepareInput,execution:DispatchExecution|null):void
  execute(input:AiPrepareInput,execution:DispatchExecution|null,authorize:()=>Promise<void>,update:(value:CodexTextUpdate)=>void):Promise<void>
  interrupt():Promise<void>
}
