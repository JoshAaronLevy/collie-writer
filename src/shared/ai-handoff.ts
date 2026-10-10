import { isId } from '../domain/editor/schema'
import { exact, isOpenInput, record, type OpenInput } from './projects'

/** Device-local proof of a committed portable outcome. Never a renderer grant. */
export type AiHandoffReceipt = {
  version: 1 | 2 | 3 | 4
  scope: OpenInput
  purpose: 'conversation' | 'proofread' | 'import'
  attemptId: string
  operationId: string
  operationVersion: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9
  payloadDigest: string
  captureDigest: string
  resultDigest: string
  sequence: number
  state: 'completed' | 'cancelled' | 'failed' | 'unknown'
  acknowledged: boolean
  portableRevision: string
  portableHead: string
  portableDigest: string
}
const digest = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v)
export function isAiHandoffReceipt(v: unknown): v is AiHandoffReceipt {
  return (
    record(v) &&
    exact(v, [
      'version',
      'scope',
      'purpose',
      'attemptId',
      'operationId',
      'operationVersion',
      'payloadDigest',
      'captureDigest',
      'resultDigest',
      'sequence',
      'state',
      'acknowledged',
      'portableRevision',
      'portableHead',
      'portableDigest'
    ]) &&
    ((v.version === 1 &&
      ['conversation', 'proofread'].includes(String(v.purpose)) &&
      v.operationVersion !== 7 &&
      v.operationVersion !== 8 &&
      v.operationVersion !== 9) ||
      (v.version === 2 && v.purpose === 'import' && v.operationVersion === 7) ||
      (v.version === 3 && v.purpose === 'import' && v.operationVersion === 8) ||
      (v.version === 4 && v.purpose === 'conversation' && v.operationVersion === 9)) &&
    isOpenInput(v.scope) &&
    [v.attemptId, v.operationId, v.portableRevision, v.portableHead].every(isId) &&
    (v.operationVersion === 1 ||
      v.operationVersion === 2 ||
      v.operationVersion === 3 ||
      v.operationVersion === 4 ||
      v.operationVersion === 5 ||
      v.operationVersion === 6 ||
      v.operationVersion === 7 ||
      v.operationVersion === 8 ||
      v.operationVersion === 9) &&
    (v.purpose !== 'conversation' || v.operationVersion !== 3) &&
    (v.purpose !== 'proofread' ||
      (v.operationVersion !== 4 && v.operationVersion !== 5 && v.operationVersion !== 6)) &&
    [v.payloadDigest, v.captureDigest, v.resultDigest, v.portableDigest].every(digest) &&
    Number.isSafeInteger(v.sequence) &&
    Number(v.sequence) >= 0 &&
    ['completed', 'cancelled', 'failed', 'unknown'].includes(String(v.state)) &&
    typeof v.acknowledged === 'boolean' &&
    (v.state === 'completed' || v.acknowledged)
  )
}
