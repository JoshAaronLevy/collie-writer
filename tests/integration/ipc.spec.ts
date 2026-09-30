import { _electron as electron, expect, test } from '@playwright/test'
import { resolve } from 'node:path'
import { temporaryRoot } from '../fixtures/roots'
const requestId = '11f4c354-2799-4dba-9d00-9c6a2f928d47'
test('Electron IPC validates real sender frames, payloads and command names', async () => {
  const fixture = temporaryRoot()
  const env: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] => entry[1] !== undefined
      )
    ),
    COLLIE_TEST_ROOT: fixture.root,
    COLLIE_TEST_TOKEN: fixture.token
  }
  delete env.ELECTRON_RUN_AS_NODE
  const app = await electron.launch({ args: ['out-tests/integration.cjs'], env }).catch((error) => {
    fixture.cleanup()
    throw error
  })
  try {
    const page = await app.firstWindow()
    const invoke = (channel: string, payload: unknown): Promise<unknown> =>
      page.evaluate(
        async ([name, input]) => {
          const attack = (
            window as unknown as {
              attack: { invoke: (name: string, payload: unknown) => Promise<unknown> }
            }
          ).attack
          return attack.invoke(name as string, input)
        },
        [channel, payload]
      )
    expect(await invoke('app.getInfo', { requestId })).toMatchObject({ ok: true, requestId })
    for (const input of [
      null,
      {},
      { requestId, path: '/private' },
      { requestId: 'x'.repeat(1000000) }
    ]) {
      expect(await invoke('app.getInfo', input)).toMatchObject({
        ok: false,
        error: { code: 'VALIDATION' }
      })
    }
    await expect(invoke('filesystem.read', { path: '/private' })).rejects.toThrow(
      'No handler registered'
    )
    await page.evaluate(() => {
      const iframe = document.createElement('iframe')
      iframe.src = 'collie://app/index.html'
      document.body.append(iframe)
    })
    await expect.poll(() => page.frames().length).toBe(2)
    const child = page.frames()[1]
    await child.waitForFunction(() => 'attack' in window)
    const result = await child.evaluate(async (id) => {
      return (
        window as unknown as {
          attack: { invoke: (name: string, payload: unknown) => Promise<unknown> }
        }
      ).attack.invoke('app.getInfo', { requestId: id })
    }, requestId)
    expect(result).toMatchObject({ ok: false, error: { code: 'DENIED' } })
    // A different top-level window on the same origin is not the registered owner.
    await app.evaluate(async ({ BrowserWindow }, attackPreload) => {
      const other = new BrowserWindow({
        show: false,
        webPreferences: {
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
          preload: attackPreload
        }
      })
      await other.loadURL('collie://app/index.html')
    }, resolve('tests/fixtures/attack-preload.cjs'))
    const other = app.windows().find((candidate) => candidate !== page)!
    await other.waitForFunction(() => 'attack' in window)
    expect(
      await other.evaluate(
        async (id) =>
          (
            window as unknown as {
              attack: { invoke: (name: string, payload: unknown) => Promise<unknown> }
            }
          ).attack.invoke('app.getInfo', { requestId: id }),
        requestId
      )
    ).toMatchObject({ ok: false, error: { code: 'DENIED' } })
    await other.close()
    const permissions = await page.evaluate(
      async () => (await navigator.permissions.query({ name: 'notifications' })).state
    )
    expect(permissions).toBe('denied')
    console.log(
      'Electron integration runtime',
      await app.evaluate(() => ({
        versions: process.versions,
        platform: process.platform,
        arch: process.arch
      }))
    )
  } finally {
    await app.close()
    fixture.cleanup()
  }
})
