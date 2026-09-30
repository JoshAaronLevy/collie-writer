export const APP_ORIGIN = 'collie://app'
export const APP_URL = `${APP_ORIGIN}/index.html`
export const PRODUCTION_CSP =
  "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' blob:; font-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'; frame-ancestors 'none'"

export function developmentOrigin(raw: string | undefined, packaged: boolean): string | undefined {
  if (!raw || packaged) return undefined
  const url = new URL(raw)
  if (
    url.protocol !== 'http:' ||
    url.hostname !== '127.0.0.1' ||
    !url.port ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error('Invalid development server origin')
  }
  return url.origin
}
export function contentSecurityPolicy(devOrigin?: string): string {
  if (!devOrigin) return PRODUCTION_CSP
  // Vite React refresh uses an inline preamble; Vite injects styles during HMR.
  return `default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self'; connect-src ${devOrigin} ${devOrigin.replace('http:', 'ws:')}; object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'; frame-ancestors 'none'`
}
export function allowedRequest(raw: string, devOrigin?: string): boolean {
  try {
    const url = new URL(raw)
    if (url.username || url.password) return false
    if (url.protocol === 'blob:') {
      const inner = new URL(url.pathname)
      return devOrigin ? inner.origin === devOrigin : inner.protocol === 'collie:' && inner.host === 'app'
    }
    if (devOrigin)
      return url.origin === devOrigin || url.origin === devOrigin.replace('http:', 'ws:')
    return url.protocol === 'collie:' && url.host === 'app'
  } catch {
    return false
  }
}
export function trustedDocument(raw: string, devOrigin?: string): boolean {
  return devOrigin ? raw === `${devOrigin}/` || raw === `${devOrigin}/index.html` : raw === APP_URL
}
export function externalHttpUrl(raw: unknown): string | null {
  if (
    typeof raw !== 'string' ||
    raw.length > 2048 ||
    /[\s\\]/u.test(raw) ||
    Array.from(raw).some((character) => character.charCodeAt(0) < 32)
  )
    return null
  try {
    const url = new URL(raw)
    if (
      !['https:', 'http:'].includes(url.protocol) ||
      !url.hostname ||
      url.username ||
      url.password
    )
      return null
    return url.href
  } catch {
    return null
  }
}
