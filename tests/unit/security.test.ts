import { describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import {
  externalHttpUrl,
  allowedRequest,
  developmentOrigin,
  trustedDocument,
  APP_URL,
  contentSecurityPolicy
} from '../../src/main/security'
import { isInfoRequest, isInfoResult } from '../../src/shared/schemas'
import { validateTestRoot } from '../../src/main/test-root'
import { createAssetHandler } from '../../src/main/protocol'
import { temporaryRoot } from '../fixtures/roots'
const requestId = '11f4c354-2799-4dba-9d00-9c6a2f928d47'

describe('command and response schemas', () => {
  it('allows a bounded request and rejects unexpected or oversized fields', () => {
    expect(isInfoRequest({ requestId })).toBe(true)
    for (const value of [
      null,
      [],
      {},
      { requestId, path: '/private' },
      { requestId: 'x'.repeat(1000000) },
      { requestId, extra: 'x'.repeat(1000000) }
    ])
      expect(isInfoRequest(value)).toBe(false)
  })
  it('rejects unexpected output and error metadata', () => {
    const value = {
      name: 'Collie Writer',
      channel: 'development',
      version: '1.0.0',
      platform: 'darwin'
    }
    expect(isInfoResult({ ok: true, requestId, value }, requestId)).toBe(true)
    expect(isInfoResult({ ok: true, requestId, value: { ...value, env: {} } }, requestId)).toBe(
      false
    )
    expect(isInfoResult({ ok: true, requestId: 'wrong', value }, requestId)).toBe(false)
    expect(
      isInfoResult(
        {
          ok: false,
          requestId,
          error: { code: 'DENIED', message: 'Denied', retryable: false, stack: '/private' }
        },
        requestId
      )
    ).toBe(false)
  })
})
it('rejects unsafe external URLs', () => {
  for (const url of [
    'file:///tmp/a',
    'javascript:alert(1)',
    'data:text/html,x',
    'mailto:a@b.com',
    'https://a:b@example.com',
    'https:\\evil.test',
    '//evil.test',
    'https://x/\n',
    'https://x/' + 'x'.repeat(2050)
  ])
    expect(externalHttpUrl(url)).toBeNull()
  expect(externalHttpUrl('https://example.org/help')).toBe('https://example.org/help')
  expect(externalHttpUrl('http://example.org/help')).toBe('http://example.org/help')
})
it('keeps developer network allowances out of production', () => {
  const dev = 'http://127.0.0.1:5173'
  expect(developmentOrigin(dev, true)).toBeUndefined()
  expect(developmentOrigin(dev, false)).toBe(dev)
  expect(() => developmentOrigin('https://evil.test', false)).toThrow()
  expect(allowedRequest('https://example.org')).toBe(false)
  expect(allowedRequest(dev)).toBe(false)
  expect(allowedRequest(dev + '/src/main.tsx', dev)).toBe(true)
  expect(allowedRequest(dev + '0/a', dev)).toBe(false)
  expect(allowedRequest('file:///etc/passwd')).toBe(false)
  expect(trustedDocument(APP_URL)).toBe(true)
  expect(trustedDocument(APP_URL + '?spoof')).toBe(false)
  expect(contentSecurityPolicy()).not.toContain('unsafe-inline')
})
it('refuses unowned, personal, symlinked and nested test roots', () => {
  const fixture = temporaryRoot()
  try {
    expect(validateTestRoot(fixture.root, fixture.token)).toBeTruthy()
    expect(() => validateTestRoot(homedir(), fixture.token)).toThrow()
    expect(() => validateTestRoot(fixture.root, '0'.repeat(64))).toThrow()
    const nested = mkdtempSync(join(fixture.root, 'collie-writer-test-'))
    expect(() => validateTestRoot(nested, fixture.token)).toThrow()
    symlinkSync(nested, join(fixture.root, 'profile'), 'junction')
    expect(() => validateTestRoot(fixture.root, fixture.token)).toThrow()
    rmSync(join(fixture.root, 'profile'))
  } finally {
    fixture.cleanup()
  }
})
it('serves only inventoried bundle assets, rejecting traversal and symlinks', async () => {
  const fixture = temporaryRoot()
  try {
    const bundle = join(fixture.root, 'bundle')
    mkdirSync(join(bundle, 'assets'), { recursive: true })
    writeFileSync(join(bundle, 'index.html'), '<h1>Synthetic fixture</h1>')
    writeFileSync(join(bundle, 'assets', 'index-a.js'), 'export {}')
    writeFileSync(join(fixture.root, 'private.txt'), 'SYNTHETIC_SECRET')
    const handle = await createAssetHandler(bundle)
    const good = await handle(new Request(APP_URL))
    expect(good.status).toBe(200)
    expect(good.headers.get('Content-Security-Policy')).toContain("connect-src 'none'")
    // Raw request-shaped inputs preserve attempted traversal before WHATWG URL normalization.
    for (const url of [
      'collie://app/../private.txt',
      'collie://app/%2e%2e/private.txt',
      'collie://app/assets/%2e%2e/index.html',
      'collie://app/assets/..\\index.html',
      'collie://other/index.html',
      APP_URL + '?x',
      'collie://app/package.json'
    ]) {
      expect((await handle({ url, method: 'GET' } as Request)).status).toBe(404)
    }
    expect((await handle(new Request(APP_URL, { method: 'POST' }))).status).toBe(404)
    symlinkSync(join(fixture.root, 'private.txt'), join(bundle, 'assets', 'escape.js'))
    await expect(createAssetHandler(bundle)).rejects.toThrow('Unsafe bundled asset')
  } finally {
    fixture.cleanup()
  }
})
