import { withoutKeys } from '../../shared/objects'
import type { AiTextCaptureFields } from '../../shared/ai-content'
import { requestDigest } from '../storage/digest'
/** The action-specific owner, template and references participate in the immutable content digest. */
export function captureDigest<
  T extends Omit<AiTextCaptureFields, 'version'> & { version: 1 | 2 | 3 | 4 | 5 }
>(capture: T): string {
  const body = withoutKeys(capture, ['digest'])
  return requestDigest(body)
}
