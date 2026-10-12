import type { AiPrepareInput, AiReason } from '../../shared/ai'
import type { WebResearch } from '../../shared/conversation-research'
import type { ImportRefusal } from '../../shared/import-recovery'
import type { DirectTextExecution } from './direct-conversation'

// Live authority excludes frozen executions that are only valid recovery inputs.
export type CurrentAiExecution = Exclude<
  DirectTextExecution,
  { template: 'project-import-analysis-v1' | 'project-import-analysis-v2' }
>
/** Main-only output; protected before feature settlement. No opaque provider IDs
 * or hidden reasoning enter saved content or renderer state. */
export type AiTextUpdate = {
  importRefusal?: ImportRefusal | null
  research?: WebResearch
  text: string
  commentary: string
  finalText: string | null
  state: 'running' | 'completed' | 'cancelled' | 'failed' | 'unknown'
  reason: AiReason | null
}
/** Main-only live authority. Never persisted or reconstructed from a journal. */
export interface AiDispatchSession {
  readonly route: 'local-chatgpt-plan'
  authorize(input: AiPrepareInput, execution: CurrentAiExecution): void
  execute(
    input: AiPrepareInput,
    execution: CurrentAiExecution,
    authorize: () => Promise<void>,
    update: (value: AiTextUpdate) => void
  ): Promise<void>
  interrupt(): Promise<void>
}
