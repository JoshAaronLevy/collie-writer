import { fetchChatMedia, validMedia } from './chat-media-fetch'
import { type MediaValue } from '../shared/chat-media'
import { constants } from 'node:fs'
import { open, realpath } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import { isAbsolute, relative } from 'node:path'
import type { WebContents } from 'electron'
import {
  PDF_INSPECTION_LIMIT,
  type InspectionAsset,
  type WorkerInspectionAsset
} from '../shared/inspection'

type Grant = WorkerInspectionAsset & { expires: number; owner: number }

/** Opaque inspection and chat-media grants. No renderer path or generic file/network route. */
export class SourceAssets {
  private grants = new Map<string, Grant>()
  private media = new Map<string, { bytes: Buffer; mediaType: string; owner: number }>()
  private pending = new Set<AbortController>()
  private generation = 0
  private mediaBytes = 0
  epoch(): number {
    return this.generation
  }
  release(url: string): void {
    const token = /^collie-source:\/\/asset\/([a-f0-9-]{36})$/.exec(url)?.[1]
    const grant = token ? this.media.get(token) : undefined
    if (grant && token) {
      this.mediaBytes -= grant.bytes.length
      this.media.delete(token)
    }
  }
  async issueMedia(
    source: Extract<MediaValue, { type: 'media-source' }>,
    epoch: number
  ): Promise<MediaValue> {
    if (epoch !== this.generation || this.pending.size >= 3) throw new Error('UNAVAILABLE')
    const controller = new AbortController()
    this.pending.add(controller)
    const timer = setTimeout(() => controller.abort(), 20_000)
    try {
      const loaded = source.url
        ? await fetchChatMedia(source.url, source.kind, controller.signal)
        : { bytes: Buffer.from(source.data ?? '', 'base64'), mediaType: source.mediaType ?? '' }
      const user = this.owner()
      if (
        epoch !== this.generation ||
        controller.signal.aborted ||
        !user ||
        user.isDestroyed() ||
        !validMedia(loaded.bytes, loaded.mediaType, source.kind) ||
        this.media.size >= 128 ||
        this.mediaBytes + loaded.bytes.length > 128 * 1024 * 1024
      )
        throw new Error('UNAVAILABLE')
      const token = randomUUID()
      this.media.set(token, { ...loaded, owner: user.id })
      this.mediaBytes += loaded.bytes.length
      return { type: 'media-asset', url: `collie-source://asset/${token}`, kind: source.kind }
    } finally {
      clearTimeout(timer)
      this.pending.delete(controller)
    }
  }
  constructor(
    private readonly root: () => string | null,
    private readonly owner: () => WebContents | undefined,
    private readonly devOrigin?: string
  ) {}
  revoke(): void {
    this.generation++
    for (const request of this.pending) request.abort()
    this.media.clear()
    this.mediaBytes = 0
    this.grants.clear()
  }
  async issue(asset: WorkerInspectionAsset): Promise<InspectionAsset> {
    const user = this.owner(),
      base = this.root()
    if (
      !user ||
      user.isDestroyed() ||
      !base ||
      asset.bytes < 1 ||
      asset.bytes > PDF_INSPECTION_LIMIT ||
      !['application/pdf', 'text/plain'].includes(asset.mediaType) ||
      !/^[a-f0-9]{64}$/.test(asset.sha256)
    )
      throw new Error('DENIED')
    const resolvedBase = await realpath(base),
      resolved = await realpath(asset.path),
      rel = relative(resolvedBase, resolved)
    if (
      !/^workspaces\/[a-f0-9-]{36}\/[a-f0-9-]{36}\/blobs\/[a-f0-9]{64}$/.test(
        rel.replaceAll('\\', '/')
      ) ||
      isAbsolute(rel) ||
      !resolved.endsWith(asset.sha256)
    )
      throw new Error('DENIED')
    this.grants.clear()
    const token = randomUUID()
    this.grants.set(token, {
      ...asset,
      path: resolved,
      owner: user.id,
      expires: Date.now() + 10 * 60_000
    })
    return {
      url: `collie-source://asset/${token}`,
      bytes: asset.bytes,
      mediaType: asset.mediaType,
      sha256: asset.sha256
    }
  }
  handle = async (request: Request): Promise<Response> => {
    const token = /^collie-source:\/\/asset\/([a-f0-9-]{36})$/.exec(request.url)?.[1],
      grant = token ? this.grants.get(token) : undefined
    const user = this.owner()
    const media = token ? this.media.get(token) : undefined
    if (
      media &&
      user &&
      !user.isDestroyed() &&
      media.owner === user.id &&
      ['GET', 'HEAD'].includes(request.method)
    ) {
      const total = media.bytes.length
      const headers = new Headers({
        'Content-Type': media.mediaType,
        'Accept-Ranges': 'bytes',
        'Access-Control-Allow-Origin': this.devOrigin ?? 'collie://app',
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'no-store',
        'Content-Security-Policy': "default-src 'none'"
      })
      let start = 0,
        end = total - 1,
        status = 200
      const range = request.headers.get('range')
      if (range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(range)
        if (!match || (!match[1] && !match[2]))
          return new Response(null, {
            status: 416,
            headers: { 'Content-Range': `bytes */${total}` }
          })
        start = match[1] ? Number(match[1]) : Math.max(0, total - Number(match[2]))
        end = match[1] && match[2] ? Math.min(total - 1, Number(match[2])) : total - 1
        if (
          !Number.isSafeInteger(start) ||
          !Number.isSafeInteger(end) ||
          start > end ||
          start >= total
        )
          return new Response(null, {
            status: 416,
            headers: { 'Content-Range': `bytes */${total}` }
          })
        status = 206
        headers.set('Content-Range', `bytes ${start}-${end}/${total}`)
      }
      headers.set('Content-Length', String(end - start + 1))
      return new Response(
        request.method === 'HEAD' ? null : new Uint8Array(media.bytes.subarray(start, end + 1)),
        {
          status,
          headers
        }
      )
    }
    if (
      request.method !== 'GET' ||
      !grant ||
      !user ||
      user.isDestroyed() ||
      grant.owner !== user.id ||
      grant.expires < Date.now()
    )
      return new Response(null, { status: 404 })
    const file = await open(grant.path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0)).catch(
      () => null
    )
    if (!file) return new Response(null, { status: 404 })
    try {
      const before = await file.stat()
      if (
        !before.isFile() ||
        before.nlink !== 1 ||
        before.size !== grant.bytes ||
        before.size > PDF_INSPECTION_LIMIT
      )
        return new Response(null, { status: 404 })
      const bytes = await file.readFile(),
        after = await file.stat()
      if (
        bytes.length !== grant.bytes ||
        after.size !== before.size ||
        after.mtimeMs !== before.mtimeMs ||
        createHash('sha256').update(bytes).digest('hex') !== grant.sha256
      )
        return new Response(null, { status: 404 })
      return new Response(bytes, {
        headers: {
          'Content-Type': grant.mediaType,
          'Content-Security-Policy': "default-src 'none'",
          'Access-Control-Allow-Origin': this.devOrigin ?? 'collie://app',
          'X-Content-Type-Options': 'nosniff',
          'Cache-Control': 'no-store'
        }
      })
    } catch {
      return new Response(null, { status: 404 })
    } finally {
      await file.close()
    }
  }
}
