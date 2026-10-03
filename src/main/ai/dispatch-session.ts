import type { AiPrepareInput } from '../../shared/ai'
import type { CodexTextUpdate } from './codex-text-turn'
import type { LocalExecution } from './local-operation'

/** Main-only live authority. Never persisted, returned over IPC or reconstructed
 * from a journal. Registered OAuth and managed Codex have separate owners. */
export interface AiDispatchSession {
  readonly route:'registered-openai'|'local-codex-chatgpt'
  authorize(input:AiPrepareInput,execution:LocalExecution|null):void
  execute(input:AiPrepareInput,execution:LocalExecution|null,authorize:()=>Promise<void>,update:(value:CodexTextUpdate)=>void):Promise<void>
  interrupt():Promise<void>
}
