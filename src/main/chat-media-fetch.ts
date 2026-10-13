import { lookup } from 'node:dns/promises'
import { BlockList, isIP } from 'node:net'
import { get } from 'node:https'
import { CHAT_MEDIA_LIMIT, mediaKind, type MediaKind } from '../shared/chat-media'

const denied = new BlockList()
for (const [address, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 3]
] as const)
  denied.addSubnet(address, prefix, 'ipv4')
for (const [address, prefix] of [
  ['2001::', 23],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['3fff::', 20]
] as const)
  denied.addSubnet(address, prefix, 'ipv6')
function publicAddress(address: string): boolean {
  const family = isIP(address)
  return family === 4
    ? !denied.check(address, 'ipv4')
    : family === 6 && /^[23]/.test(address) && !denied.check(address, 'ipv6')
}
/** Header plus signature allowlist. HTML, SVG, playlists and hosted players are never media. */
export function validMedia(bytes: Buffer, type: string, kind: MediaKind): boolean {
  if (!bytes.length || bytes.length > CHAT_MEDIA_LIMIT || mediaKind(type) !== kind) return false
  const ascii = (start: number, end: number): string => bytes.toString('ascii', start, end)
  switch (type) {
    case 'image/png':
      return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    case 'image/jpeg':
      return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
    case 'image/gif':
      return ['GIF87a', 'GIF89a'].includes(ascii(0, 6))
    case 'image/webp':
      return ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP'
    case 'audio/wav':
      return ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WAVE'
    case 'audio/mpeg':
      return ascii(0, 3) === 'ID3' || (bytes[0] === 255 && (bytes[1] & 224) === 224)
    case 'audio/mp4':
    case 'video/mp4':
      return ascii(4, 8) === 'ftyp'
    case 'audio/ogg':
    case 'video/ogg':
      return ascii(0, 4) === 'OggS'
    case 'audio/webm':
    case 'video/webm':
      return bytes.subarray(0, 4).equals(Buffer.from([26, 69, 223, 163]))
    default:
      return false
  }
}
/** DNS is checked and pinned for every hop; Node HTTPS has no app cookies, proxy or account session. */
export async function fetchChatMedia(
  raw: string,
  kind: MediaKind,
  signal: AbortSignal
): Promise<{ bytes: Buffer; mediaType: string }> {
  let url = new URL(raw)
  for (let hop = 0; hop <= 3; hop++) {
    signal.throwIfAborted()
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      (url.port && url.port !== '443') ||
      url.href.length > 2048
    )
      throw new Error('DENIED')
    url.hash = ''
    const host = url.hostname.replace(/^\[|\]$/g, '')
    const addresses = isIP(host)
      ? [{ address: host, family: isIP(host) }]
      : await new Promise<{ address: string; family: number }[]>((resolve, reject) => {
          const aborted = (): void => reject(new Error('UNAVAILABLE'))
          signal.addEventListener('abort', aborted, { once: true })
          void lookup(host, { all: true })
            .then(resolve, reject)
            .finally(() => signal.removeEventListener('abort', aborted))
          if (signal.aborted) aborted()
        })
    signal.throwIfAborted()
    if (!addresses.length || addresses.some((a) => !publicAddress(a.address)))
      throw new Error('DENIED')
    const selected = addresses[0]
    const result = await new Promise<{ redirect: string } | { bytes: Buffer; mediaType: string }>(
      (resolve, reject) => {
        const request = get(
          url,
          {
            agent: false,
            signal,
            headers: { Accept: `${kind}/*`, 'Accept-Encoding': 'identity' },
            lookup: (_host, options, callback) => {
              if (options.all) callback(null, [selected])
              else callback(null, selected.address, selected.family)
            }
          },
          (response) => {
            if (
              [301, 302, 303, 307, 308].includes(response.statusCode ?? 0) &&
              response.headers.location
            ) {
              const redirect = response.headers.location
              response.destroy()
              resolve({ redirect })
              return
            }
            const mediaType =
              response.headers['content-type']?.split(';')[0].trim().toLowerCase() ?? ''
            if (
              response.statusCode !== 200 ||
              mediaKind(mediaType) !== kind ||
              (response.headers['content-encoding'] &&
                response.headers['content-encoding'] !== 'identity') ||
              Number(response.headers['content-length'] ?? 0) > CHAT_MEDIA_LIMIT
            ) {
              response.destroy()
              reject(new Error('UNAVAILABLE'))
              return
            }
            const chunks: Buffer[] = []
            let size = 0
            response.on('data', (chunk: Buffer) => {
              size += chunk.length
              if (size > CHAT_MEDIA_LIMIT) {
                response.destroy()
                reject(new Error('LIMIT'))
              } else chunks.push(chunk)
            })
            response.on('error', reject)
            response.on('aborted', () => reject(new Error('UNAVAILABLE')))
            response.on('end', () => {
              const bytes = Buffer.concat(chunks)
              if (!validMedia(bytes, mediaType, kind)) reject(new Error('UNAVAILABLE'))
              else resolve({ bytes, mediaType })
            })
          }
        )
        request.on('error', reject)
      }
    )
    if ('bytes' in result) return result
    url = new URL(result.redirect, url)
  }
  throw new Error('LIMIT')
}
