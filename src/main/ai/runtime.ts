import type { AiModel, AiReason } from '../../shared/ai'

/** Sanitized text only. Provider handles and reasoning never cross this boundary. */
export type RuntimeUpdate = {
  text: string
  state: 'running' | 'completed' | 'cancelled' | 'failed' | 'unknown'
  reason: AiReason | null
}

export interface TextRuntime {
  models(): Promise<AiModel[]>
  execute(model: string, prompt: string, authorize: () => Promise<void>, update: (value: RuntimeUpdate) => void): Promise<RuntimeUpdate>
  interrupt(): Promise<void>
  close(): Promise<void>
}
