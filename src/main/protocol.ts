import { readFile, readdir, realpath, lstat } from 'node:fs/promises'
import { join, relative, isAbsolute } from 'node:path'
import { APP_ORIGIN, PRODUCTION_CSP } from './security'

const types: Record<string, string> = {
  html: 'text/html; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  mjs: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  png: 'image/png',
  bcmap: 'application/octet-stream',
  icc: 'application/octet-stream',
  pfb: 'application/octet-stream',
  ttf: 'font/ttf',
  wasm: 'application/wasm'
}

export async function createAssetHandler(
  root: string
): Promise<(request: Request) => Promise<Response>> {
  const base = await realpath(root)
  if ((await lstat(join(base, 'assets'))).isSymbolicLink())
    throw new Error('Unsafe bundled assets directory')
  const assets = new Map<string, { path: string; mime: string }>()
  const paths = [
    'index.html',
    ...(await readdir(join(base, 'assets'))).map((name) => `assets/${name}`)
  ]
  for (const folder of ['cmaps','iccs','standard_fonts','wasm'] as const)
    for (const name of await readdir(join(base,'pdfjs',folder))) paths.push(`pdfjs/${folder}/${name}`)
  for (const name of paths) {
    // Include only emitted local assets, including the logo and bundled Source Serif TTFs.
    if (name !== 'index.html' && !/^assets\/[A-Za-z0-9_.-]+\.(js|mjs|css|ttf|png)$/.test(name) && !/^pdfjs\/cmaps\/[A-Za-z0-9_-]+\.bcmap$/.test(name) && !/^pdfjs\/iccs\/[A-Za-z0-9_-]+\.icc$/.test(name) && !/^pdfjs\/standard_fonts\/[A-Za-z0-9_-]+\.(pfb|ttf)$/.test(name) && !/^pdfjs\/wasm\/[A-Za-z0-9_-]+\.wasm$/.test(name)) continue
    const path = join(base, name)
    const info = await lstat(path)
    const resolved = await realpath(path)
    const rel = relative(base, resolved)
    if (info.isSymbolicLink() || !info.isFile() || rel.startsWith('..') || isAbsolute(rel))
      throw new Error('Unsafe bundled asset')
    assets.set(`${APP_ORIGIN}/${name}`, { path: resolved, mime: types[name.split('.').at(-1)!] })
  }
  return async (request) => {
    // Exact URL lookup avoids decoding, path normalization, fallback routing and filesystem grants.
    const asset = assets.get(request.url)
    if (request.method !== 'GET' || !asset) return new Response(null, { status: 404 })
    try {
      const bytes = await readFile(asset.path)
      return new Response(bytes, {
        headers: {
          'Content-Type': asset.mime,
          'Content-Security-Policy': PRODUCTION_CSP,
          'X-Content-Type-Options': 'nosniff',
          'Cache-Control': 'no-store'
        }
      })
    } catch {
      return new Response(null, { status: 404 })
    }
  }
}
