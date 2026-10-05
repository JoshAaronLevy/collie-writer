import { withoutKeys } from '../../shared/objects'
import type { AiTextCaptureFields } from '../../shared/ai-content'
import { requestDigest } from '../storage/digest'
/** The action-specific owner, template and references participate in the immutable content digest. */
export function captureDigest<T extends AiTextCaptureFields>(capture: T): string {
  const body = withoutKeys(capture, ['digest'])
  return requestDigest(body)
}
