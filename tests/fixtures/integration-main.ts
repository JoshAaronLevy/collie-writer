import { app, BrowserWindow, protocol, session } from 'electron'
import { join } from 'node:path'
import { denyTestNetwork } from '../../src/main/test-network'
import { configureProfile } from '../../src/main/profile'
import { registerAppIpc } from '../../src/main/ipc'
import { protectSession } from '../../src/main/windows'
app.enableSandbox()
if (!configureProfile()) throw new Error('Integration requires an owned test root')
denyTestNetwork()
protocol.registerSchemesAsPrivileged([
  { scheme: 'collie', privileges: { standard: true, secure: true, supportFetchAPI: true } }
])
app.whenReady().then(async () => {
  protectSession(session.defaultSession)
  // This test document permits a same-origin child frame to exercise sender rejection.
  protocol.handle(
    'collie',
    () =>
      new Response('<h1>Synthetic IPC fixture</h1>', { headers: { 'Content-Type': 'text/html' } })
  )
  session.defaultSession.webRequest.onHeadersReceived((_details, callback) => callback({}))
  const window = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: join(app.getAppPath(), '../tests/fixtures/attack-preload.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInSubFrames: true
    }
  })
  registerAppIpc(
    () => window.webContents,
    () => ({ name: 'Collie Writer', version: '1.0.0', channel: 'development', platform: 'darwin' })
  )
  await window.loadURL('collie://app/index.html')
})
app.on('window-all-closed', () => app.quit())
