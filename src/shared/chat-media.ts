import { isId } from '../domain/editor/schema'
import { exact, record, isOpenInput, type OpenInput } from './projects'

export const CHAT_MEDIA_LIMIT = 32 * 1024 * 1024
export const CHAT_MEDIA_ITEMS = 32
export type MediaKind = 'image' | 'audio' | 'video'
export type MediaTarget = OpenInput & { messageId: string; messageRevision: string }
export type MediaRequest = MediaTarget & { action: 'media'; index: number | null }
export type MediaItem = {
  index: number
  start: number | null
  end: number | null
  kind: MediaKind
  label: string
}
export type MediaValue =
  | { type: 'media-list'; items: MediaItem[]; more: boolean }
  | {
      type: 'media-source'
      kind: MediaKind
      url: string | null
      data: string | null
      mediaType: string | null
    }
  | { type: 'media-asset'; url: string; kind: MediaKind }
export function mediaKind(type: string): MediaKind | null {
  if (['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(type)) return 'image'
  if (['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4', 'audio/webm'].includes(type))
    return 'audio'
  if (['video/mp4', 'video/webm', 'video/ogg'].includes(type)) return 'video'
  return null
}
export const mediaExtensions: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  oga: 'audio/ogg',
  m4a: 'audio/mp4',
  mp4: 'video/mp4',
  webm: 'video/webm',
  ogv: 'video/ogg'
}
export function mediaLink(url: string): MediaKind | null {
  const embedded = /^data:([^;,]+);base64,/.exec(url)
  if (embedded) return mediaKind(embedded[1])
  const path = url.split(/[?#]/)[0].toLowerCase()
  if (/\.(png|jpe?g|gif|webp)$/.test(path)) return 'image'
  if (/\.(mp3|wav|oga|m4a)$/.test(path)) return 'audio'
  if (/\.(mp4|webm|ogv)$/.test(path)) return 'video'
  return null
}
export function isMediaRequest(v: unknown): v is MediaRequest {
  return (
    record(v) &&
    exact(v, ['projectId', 'workspaceId', 'action', 'messageId', 'messageRevision', 'index']) &&
    isOpenInput({ projectId: v.projectId, workspaceId: v.workspaceId }) &&
    v.action === 'media' &&
    isId(v.messageId) &&
    isId(v.messageRevision) &&
    (v.index === null ||
      (Number.isInteger(v.index) && Number(v.index) >= 0 && Number(v.index) < CHAT_MEDIA_ITEMS))
  )
}
export function isMediaValue(v: unknown): v is MediaValue {
  if (!record(v)) return false
  const kind = (k: unknown): boolean => ['image', 'audio', 'video'].includes(String(k))
  const offset = (n: unknown): boolean =>
    n === null || (Number.isSafeInteger(n) && Number(n) >= 0 && Number(n) <= 20_000_000)
  if (v.type === 'media-list')
    return (
      exact(v, ['type', 'items', 'more']) &&
      typeof v.more === 'boolean' &&
      Array.isArray(v.items) &&
      v.items.length <= CHAT_MEDIA_ITEMS &&
      v.items.every(
        (i, index) =>
          record(i) &&
          exact(i, ['index', 'start', 'end', 'kind', 'label']) &&
          i.index === index &&
          kind(i.kind) &&
          offset(i.start) &&
          offset(i.end) &&
          ((i.start === null && i.end === null) ||
            (typeof i.start === 'number' && typeof i.end === 'number' && i.end > i.start)) &&
          typeof i.label === 'string' &&
          i.label.length <= 300
      )
    )
  if (v.type === 'media-asset')
    return (
      exact(v, ['type', 'url', 'kind']) &&
      kind(v.kind) &&
      typeof v.url === 'string' &&
      /^collie-source:\/\/asset\/[a-f0-9-]{36}$/.test(v.url)
    )
  return (
    v.type === 'media-source' &&
    exact(v, ['type', 'kind', 'url', 'data', 'mediaType']) &&
    kind(v.kind) &&
    ((typeof v.url === 'string' &&
      v.url.length <= 2048 &&
      v.data === null &&
      v.mediaType === null) ||
      (v.url === null &&
        typeof v.data === 'string' &&
        v.data.length <= Math.ceil(CHAT_MEDIA_LIMIT / 3) * 4 &&
        /^[A-Za-z0-9+/]*={0,2}$/.test(v.data) &&
        typeof v.mediaType === 'string' &&
        mediaKind(v.mediaType) === v.kind))
  )
}
