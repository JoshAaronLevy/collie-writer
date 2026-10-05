import { BrowserWindow, session } from 'electron'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { PrintDocument } from '../../worker/exports/html'
import { bundledResources } from '../resources'

// Fixed app code, never interpolated with manuscript strings. No preload or renderer IPC.
const paginate = `(async () => {
  const source = document.getElementById('source');
  const pages = document.getElementById('pages');
  const fonts = [
    ['12pt "Source Serif 4"', 'Aa'], ['bold 12pt "Source Serif 4"', 'Aa'],
    ['italic 12pt "Source Serif 4"', 'Aa'], ['bold italic 12pt "Source Serif 4"', 'Aa'],
    ['12pt "Noto Sans CJK SC"', '中文日本語한글'],
    ['12pt "Noto Naskh Arabic"', 'العربية'], ['12pt "Noto Sans Hebrew"', 'עברית']
  ];
  await Promise.all(fonts.map(async ([font, text]) => {
    if (!(await document.fonts.load(font, text)).length) throw new Error('PRINT_FONT_UNAVAILABLE');
  }));
  await document.fonts.ready;
  await Promise.all(Array.from(source.querySelectorAll('img'), img => img.decode()));
  const previewer = new Paged.Previewer();
  const flow = await previewer.preview(source.innerHTML, ['/print.css'], pages);
  source.remove();
  await document.fonts.ready;
  await Promise.all(Array.from(pages.querySelectorAll('img'), img => img.decode()));
  if (!flow.total || flow.total > 2000) throw new Error('PRINT_PAGE_LIMIT');
  return flow.total;
})()`

/** Main-only internal adapter. Caller must obtain PrintDocument from the trusted worker compiler. */
export async function printPdf(
  document: PrintDocument,
  signal?: AbortSignal
): Promise<{ bytes: Buffer; pages: number; capturedHead: string }> {
  if (signal?.aborted) throw new Error('CANCELLED')
  if (
    !['Letter', 'A4'].includes(document.paper) ||
    document.body.length > 400_000_000 ||
    document.css.length > 100_000
  )
    throw new Error('INVALID_PRINT_DOCUMENT')
  const root = bundledResources()
  const origin = `collie-print://${randomUUID()}`
  const printSession = session.fromPartition(`collie-print-${randomUUID()}`, { cache: false })
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Collie Writer export</title><link rel="stylesheet" href="${origin}/print.css"><script src="${origin}/paged.js"></script></head><body><main id="source">${document.body}</main><div id="pages"></div></body></html>`
  const assets = new Map<string, { mime: string; bytes?: string; path?: string }>([
    [`${origin}/index.html`, { mime: 'text/html; charset=utf-8', bytes: html }],
    [`${origin}/print.css`, { mime: 'text/css; charset=utf-8', bytes: document.css }],
    [
      `${origin}/paged.js`,
      { mime: 'text/javascript; charset=utf-8', path: join(root, 'vendor/paged.js') }
    ]
  ])
  for (const filename of [
    'SourceSerif4-Regular.ttf',
    'SourceSerif4-Bold.ttf',
    'SourceSerif4-It.ttf',
    'SourceSerif4-BoldIt.ttf',
    'NotoSansCJKsc-Regular.otf',
    'NotoNaskhArabic-Regular.ttf',
    'NotoSansHebrew-Regular.ttf'
  ]) {
    assets.set(`${origin}/fonts/${filename}`, {
      mime: filename.endsWith('.otf') ? 'font/otf' : 'font/ttf',
      path: join(root, 'fonts', filename)
    })
  }
  printSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false))
  printSession.setPermissionCheckHandler(() => false)
  printSession.on('will-download', (event) => event.preventDefault())
  printSession.webRequest.onBeforeRequest((request, callback) =>
    callback({
      cancel:
        !assets.has(request.url) &&
        !/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(request.url)
    })
  )
  printSession.protocol.handle('collie-print', async (request) => {
    const asset = assets.get(request.url)
    if (request.method !== 'GET' || !asset) return new Response(null, { status: 404 })
    try {
      return new Response(asset.bytes ?? (await readFile(asset.path!)), {
        headers: {
          'Content-Type': asset.mime,
          'X-Content-Type-Options': 'nosniff',
          'Cache-Control': 'no-store',
          // Paged.js creates inline styles while paginating. This exception is confined to this session.
          'Content-Security-Policy':
            "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src data:; connect-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
        }
      })
    } catch {
      return new Response(null, { status: 404 })
    }
  })
  const window = new BrowserWindow({
    show: false,
    webPreferences: {
      session: printSession,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: false,
      devTools: false,
      backgroundThrottling: false
    }
  })
  const abort = (): void => {
    if (!window.isDestroyed()) window.destroy()
  }
  signal?.addEventListener('abort', abort, { once: true })
  if (signal?.aborted) abort()
  const timeout = setTimeout(abort, 120_000)
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event) => event.preventDefault())
  window.webContents.on('will-frame-navigate', (event) => event.preventDefault())
  window.webContents.on('will-attach-webview', (event) => event.preventDefault())
  try {
    await window.loadURL(`${origin}/index.html`)
    const pages: unknown = await window.webContents.executeJavaScript(paginate)
    if (typeof pages !== 'number' || !Number.isInteger(pages) || pages < 1 || pages > 2000)
      throw new Error('PAGINATION_FAILED')
    const bytes = await window.webContents.printToPDF({
      printBackground: true,
      preferCSSPageSize: true,
      pageSize: document.paper,
      margins: { top: 0, bottom: 0, left: 0, right: 0 }
    })
    if (bytes.length > 512 * 1024 * 1024) throw new Error('PDF_LIMIT')
    if (signal?.aborted) throw new Error('CANCELLED')
    return { bytes, pages, capturedHead: document.capturedHead }
  } catch {
    throw new Error(signal?.aborted ? 'CANCELLED' : 'PDF_EXPORT_FAILED')
  } finally {
    clearTimeout(timeout)
    signal?.removeEventListener('abort', abort)
    abort()
    printSession.protocol.unhandle('collie-print')
    printSession.webRequest.onBeforeRequest(null)
    assets.clear()
  }
}
