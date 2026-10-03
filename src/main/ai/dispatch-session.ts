import type { AiPrepareInput } from '../../shared/ai'
import type { CodexTextUpdate } from './codex-text-turn'
import type { LocalExecutionV2 } from './local-operation'

/** Main-only live authority. Never persisted, returned over IPC or reconstructed
 * from a journal. Registered OAuth and managed Codex have separate owners. */
export interface AiDispatchSession {
  readonly route:'registered-openai'|'local-codex-chatgpt'
  authorize(input:AiPrepareInput,execution:LocalExecutionV2|null):void
  execute(input:AiPrepareInput,execution:LocalExecutionV2|null,authorize:()=>Promise<void>,update:(value:CodexTextUpdate)=>void):Promise<void>
  interrupt():Promise<void>
}
