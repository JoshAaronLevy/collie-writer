import type Database from 'better-sqlite3'
import { fromMarkdown } from 'mdast-util-from-markdown'
import { gfm } from 'micromark-extension-gfm'
import { gfmFromMarkdown } from 'mdast-util-gfm'
import type { Nodes } from 'mdast'
import {
  CHAT_MEDIA_ITEMS,
  CHAT_MEDIA_LIMIT,
  mediaKind,
  mediaLink,
  type MediaRequest,
  type MediaItem,
  type MediaValue,
  type MediaKind
} from '../../shared/chat-media'
import { record, type OpenInput } from '../../shared/projects'
import { IMPORT_LIMITS, type ImportFile } from '../../shared/project-import'
import type { ConversationMessage } from '../../shared/conversations'
import { ProjectError } from '../../domain/projects/errors'
import { externalMessage, externalOrigin, hasExternalSchema } from './external-conversations'
import { OriginalTranscriptText } from './conversation-transcript'
import { readImportBlob, readGraph } from './import-graphs'
import { parseInputJson, valueAt } from './import-readers/json'

type Context = OpenInput & { db: Database.Database; root: string; workspace: string }
type Reference = Omit<MediaItem, 'index'> & { url: string | null }
const unavailable = (): never => {
  throw new ProjectError('NOT_FOUND')
}
/** Read-only projection of exact accepted originals; no attachment schema or file-path guessing. */
export async function chatMedia(
  ctx: Context,
  input: MediaRequest,
  message: (id: string) => ConversationMessage
): Promise<MediaValue> {
  let text: string,
    original: unknown,
    files: ImportFile[] = []
  const imported =
    hasExternalSchema(ctx.db) &&
    ctx.db
      .prepare('SELECT 1 FROM external_messages WHERE project_id=? AND id=?')
      .get(ctx.projectId, input.messageId)
  if (imported) {
    const m = externalMessage(ctx.db, ctx.projectId, input.messageId)
    if (m.revisionId !== input.messageRevision) throw new ProjectError('STALE_REVISION')
    if (m.record.disposition === 'internal') return unavailable()
    const origin = externalOrigin(ctx.db, ctx.projectId, m.conversationId)
    if (!origin) return unavailable()
    text = await new OriginalTranscriptText(ctx, origin.batchId).read(m.record)
    const selected = readGraph(ctx.db, ctx.projectId, m.graphId).manifest.files
    files = (
      ctx.db
        .prepare('SELECT body FROM import_files WHERE project_id=? AND batch_id=?')
        .all(ctx.projectId, origin.batchId) as { body: string }[]
    )
      .map((r) => JSON.parse(r.body) as ImportFile)
      .filter((f) => selected.some((s) => s.fileId === f.id && s.sha256 === f.sha256))
    const file = files.find(
      (f) => f.id === m.record.locator.fileId && f.sha256 === m.record.locator.sha256
    )
    if (file?.mediaType === 'application/json') {
      const bytes = await readImportBlob(ctx, file, IMPORT_LIMITS.fileBytes)
      const json = new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, '')
      original = valueAt(parseInputJson(json).value, m.record.locator.pointer)
    }
  } else {
    const m = message(input.messageId)
    if (m.revisionId !== input.messageRevision) throw new ProjectError('STALE_REVISION')
    text = m.text
  }
  const refs = references(text, original)
  if (input.index === null)
    return {
      type: 'media-list',
      items: refs
        .slice(0, CHAT_MEDIA_ITEMS)
        .map((r, index) => ({ index, start: r.start, end: r.end, kind: r.kind, label: r.label })),
      more: refs.length > CHAT_MEDIA_ITEMS
    }
  const ref = refs[input.index]
  if (!ref?.url) return unavailable()
  if (/^https:\/\//i.test(ref.url) && ref.url.length <= 2048)
    return { type: 'media-source', kind: ref.kind, url: ref.url, data: null, mediaType: null }
  const embedded = /^data:([^;,]+);base64,([A-Za-z0-9+/]*={0,2})$/.exec(ref.url)
  let data: Buffer, type: string
  if (
    embedded &&
    mediaKind(embedded[1]) === ref.kind &&
    embedded[2].length <= Math.ceil(CHAT_MEDIA_LIMIT / 3) * 4
  ) {
    data = Buffer.from(embedded[2], 'base64')
    if (data.toString('base64') !== embedded[2]) return unavailable()
    type = embedded[1]
  } else {
    // Only an exact, unique name already retained in this same import batch; never a disk path.
    let name: string
    try {
      name = decodeURIComponent(ref.url)
    } catch {
      return unavailable()
    }
    const matched = files.filter(
      (f) => f.originalName === name && mediaKind(f.mediaType) === ref.kind
    )
    if (matched.length !== 1 || /[/\\:]/.test(name)) return unavailable()
    data = await readImportBlob(ctx, matched[0], CHAT_MEDIA_LIMIT)
    type = matched[0].mediaType
  }
  if (!data.length || data.length > CHAT_MEDIA_LIMIT) return unavailable()
  return {
    type: 'media-source',
    kind: ref.kind,
    url: null,
    data: data.toString('base64'),
    mediaType: type
  }
}
function references(text: string, original: unknown): Reference[] {
  const tree = fromMarkdown(text, { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] })
  const definitions = new Map<string, string>(),
    refs: Reference[] = []
  function walk(node: Nodes, visit: (node: Nodes) => void): void {
    visit(node)
    if ('children' in node) for (const child of node.children) walk(child, visit)
  }
  walk(tree, (n) => {
    if (n.type === 'definition' && !definitions.has(n.identifier))
      definitions.set(n.identifier, n.url)
  })
  walk(tree, (n) => {
    if (refs.length > CHAT_MEDIA_ITEMS) return
    if (!['image', 'link', 'imageReference', 'linkReference'].includes(n.type)) return
    if (
      'children' in n &&
      n.children.some((child) => child.type === 'image' || child.type === 'imageReference')
    )
      return
    const url = 'url' in n ? n.url : 'identifier' in n ? definitions.get(n.identifier) : null
    if (typeof url !== 'string') return
    const image = n.type === 'image' || n.type === 'imageReference'
    const kind = image ? 'image' : mediaLink(url)
    if (!kind) return
    refs.push({
      start: n.position?.start.offset ?? null,
      end: n.position?.end.offset ?? null,
      kind,
      label: ('alt' in n ? n.alt : null)?.slice(0, 300) || kind,
      url
    })
  })
  // Raw ChatGPT multimodal parts and explicit image_url parts retain exact message ancestry.
  if (record(original) && record(original.content) && Array.isArray(original.content.parts)) {
    for (const part of original.content.parts) {
      if (refs.length > CHAT_MEDIA_ITEMS) break
      if (!record(part)) continue
      const kind: MediaKind = String(part.content_type ?? part.type ?? '').includes('audio')
        ? 'audio'
        : String(part.content_type ?? part.type ?? '').includes('video')
          ? 'video'
          : 'image'
      const known = ['image_url', 'image', 'audio', 'video', 'input_audio'].includes(
        String(part.content_type ?? part.type ?? '')
      )
      const candidate = record(part.image_url) ? part.image_url.url : part.image_url
      const url =
        typeof candidate === 'string'
          ? candidate
          : known && typeof part.url === 'string'
            ? part.url
            : record(part.input_audio) &&
                typeof part.input_audio.data === 'string' &&
                ['wav', 'mp3'].includes(String(part.input_audio.format))
              ? `data:${part.input_audio.format === 'wav' ? 'audio/wav' : 'audio/mpeg'};base64,${part.input_audio.data}`
              : null
      refs.push({
        start: null,
        end: null,
        kind,
        label:
          typeof part.alt === 'string'
            ? part.alt.slice(0, 300)
            : known || /image|audio|video/.test(String(part.content_type ?? part.type ?? ''))
              ? kind
              : 'Attachment',
        url
      })
    }
  }
  return refs
}
