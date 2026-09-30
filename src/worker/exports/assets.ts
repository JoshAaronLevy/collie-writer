import { ContentError } from '../../domain/editor/schema'
import type { Compilation, Frozen } from '../../domain/compilation/model'

export type ManagedImage = { mediaType: 'image/png' | 'image/jpeg'; bytes: Uint8Array }
export type ImageResolver = (assetId: string) => Promise<ManagedImage>
/** Resolver is supplied by the worker's owned immutable blob lease, never a renderer path. */
export async function collectImages(model: Frozen<Compilation>, resolve: ImageResolver): Promise<Map<string, ManagedImage>> {
  const images = new Map<string, ManagedImage>()
  let totalBytes = 0
  for (const section of model.sections) for (const block of section.blocks) {
    if (block.kind !== 'image' || images.has(block.assetId)) continue
    const image = await resolve(block.assetId)
    const bytes = Buffer.from(image.bytes)
    totalBytes += bytes.length
    const png = image.mediaType === 'image/png' && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    const jpeg = image.mediaType === 'image/jpeg' && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
    if ((!png && !jpeg) || bytes.length > 25 * 1024 * 1024 || totalBytes > 256 * 1024 * 1024) throw new ContentError('INVALID_OR_OVERSIZED_IMAGE', block.assetId)
    images.set(block.assetId, { mediaType: image.mediaType, bytes })
  }
  return images
}
export const fontFiles = [
  ['Source Serif 4', 'SourceSerif4-Regular.ttf'],
  ['Noto Sans CJK SC', 'NotoSansCJKsc-Regular.otf'],
  ['Noto Naskh Arabic', 'NotoNaskhArabic-Regular.ttf'],
  ['Noto Sans Hebrew', 'NotoSansHebrew-Regular.ttf']
] as const
export function imageSize(width: number, height: number): { width: number; height: number } {
  // Fit within both Letter and A4 printable areas without stretching or clipping.
  const scale = Math.min(1, 595 / width, 780 / height)
  return { width: width * scale, height: height * scale }
}
