import { _electron as electron, expect, test } from '@playwright/test'
import { temporaryRoot } from '../fixtures/roots'
import { join } from 'node:path'
test('bundled shell, production boundaries, menus and lifecycle', async () => {
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
  delete env.ELECTRON_RENDERER_URL
  const executablePath = process.env.COLLIE_DESKTOP_EXECUTABLE
  if (executablePath) env.ELECTRON_RENDERER_URL = 'https://invalid.example'
  const app = await electron
    .launch({
      ...(executablePath ? { executablePath, args: [] } : { args: ['.'] }),
      env
    })
    .catch((error) => {
      fixture.cleanup()
      throw error
    })
  try {
    const page = await app.firstWindow()
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await expect(page.getByRole('heading', { name: 'Room for your next idea.' })).toBeVisible()
    await expect(page.getByRole('status')).toContainText('Collie Writer 1.0.0')
    expect(page.url()).toBe('collie://app/index.html')
    expect(
      await page.evaluate(() => ({
        keys: Object.keys(window.collie),
        process: typeof window['process'],
        require: typeof window['require'],
        electron: 'electron' in window,
        api: 'api' in window
      }))
    ).toEqual({
      keys: ['getInfo'],
      process: 'undefined',
      require: 'undefined',
      electron: false,
      api: false
    })
    const prefs = await app.evaluate(({ BrowserWindow }) =>
      (
        BrowserWindow.getAllWindows()[0].webContents as unknown as {
          getLastWebPreferences: () => Record<string, unknown>
        }
      ).getLastWebPreferences()
    )
    expect(prefs).toMatchObject({
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      webviewTag: false
    })
    expect(await app.evaluate(({ app }) => app.getPath('userData'))).toBe(
      join(fixture.root, 'profile')
    )
    const menus = await app.evaluate(({ Menu }) =>
      Menu.getApplicationMenu()?.items.map((item) => item.label)
    )
    expect(menus).toEqual(expect.arrayContaining(['File', 'Edit', 'View', 'Help']))
    await page.keyboard.press('Tab')
    await expect(page.getByRole('link', { name: 'Skip to workspace' })).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('main')).toBeFocused()
    // Native editing role operates on real selectable text.
    await page.evaluate(() => {
      const selection = window.getSelection()!
      const range = document.createRange()
      range.selectNodeContents(document.querySelector('h1')!)
      selection.removeAllRanges()
      selection.addRange(range)
    })
    expect(await page.evaluate(() => window.getSelection()?.toString())).toBe(
      'Room for your next idea.'
    )
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+a' : 'Control+a')
    expect(await page.evaluate(() => window.getSelection()?.toString())).toContain(
      'Welcome to Collie Writer'
    )
    // CSP blocks inline code and remote fetch; session independently rejects outbound requests.
    const security = await page.evaluate(async () => {
      const script = document.createElement('script')
      script.textContent = 'window.inlineExecuted = true'
      document.body.append(script)
      let networkDenied = false
      try {
        await fetch('https://example.com/synthetic-collie-test')
      } catch {
        networkDenied = true
      }
      return { inlineExecuted: 'inlineExecuted' in window, networkDenied }
    })
    expect(security).toEqual({ inlineExecuted: false, networkDenied: true })
    expect(
      await app.evaluate(async ({ net }) => {
        try {
          await net.fetch('https://example.com/synthetic-collie-test')
          return false
        } catch {
          return true
        }
      })
    ).toBe(true)
    expect(
      await app.evaluate(async () => {
        try {
          await fetch('https://example.com/synthetic-collie-test')
          return false
        } catch {
          return true
        }
      })
    ).toBe(true)
    await page.evaluate(() => {
      window.open('https://example.com')
      window.location.href = 'https://example.com'
    })
    expect(page.url()).toBe('collie://app/index.html')
    expect(app.windows()).toHaveLength(1)
    await page.evaluate(() => {
      window.getSelection()?.removeAllRanges()
      ;(document.activeElement as HTMLElement)?.blur()
    })
    await page.screenshot({ path: 'output/playwright/stage-01-shell.png' })
    expect(errors).toEqual([])
    if (process.platform === 'darwin') {
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close())
      await expect.poll(() => app.windows().length).toBe(0)
      await app.evaluate(({ app }) => app.emit('activate'))
      await expect(
        (await app.firstWindow()).getByRole('heading', { name: 'Room for your next idea.' })
      ).toBeVisible()
    } else {
      const exit = app.waitForEvent('close')
      await page.close()
      await exit
    }
  } finally {
    if (app.process().exitCode === null) await app.close()
    fixture.cleanup()
  }
})
