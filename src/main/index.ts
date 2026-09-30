import { app, BrowserWindow, protocol, session } from 'electron'
import { join } from 'node:path'
import { APP_ID, STORAGE_STATUS_CHANGED, type AppInfo } from '../shared/commands'
import { registerAppIpc, registerStorageIpc } from './ipc'
import { denyTestNetwork } from './test-network'
import { installMenu } from './menus'
import { configureProfile } from './profile'
import { createAssetHandler } from './protocol'
import { developmentOrigin } from './security'
import { StorageWorker } from './storage-worker'
import { createWindow, protectSession } from './windows'

app.setName('Collie Writer')
app.setAppUserModelId(APP_ID)
app.enableSandbox()
const testMode = configureProfile()
if (testMode) denyTestNetwork()
const devOrigin = developmentOrigin(process.env.ELECTRON_RENDERER_URL, app.isPackaged)
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'collie',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true }
  },
  {
    scheme: 'collie-print',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true }
  }
])
let window: BrowserWindow | undefined
const storage = new StorageWorker((status) => {
  if (window && !window.isDestroyed() && !window.webContents.isDestroyed())
    window.webContents.send(STORAGE_STATUS_CHANGED, status)
})
function openWindow(): void {
  window = createWindow(devOrigin)
  window.on('closed', () => {
    window = undefined
  })
}
app
  .whenReady()
  .then(async () => {
    protectSession(session.defaultSession, devOrigin)
    if (!devOrigin)
      protocol.handle('collie', await createAssetHandler(join(__dirname, '../renderer')))
    registerAppIpc(
      () => window?.webContents,
      () => ({
        name: 'Collie Writer',
        version: app.getVersion(),
        channel: 'development',
        platform: process.platform as AppInfo['platform']
      }),
      devOrigin
    )
    registerStorageIpc(() => window?.webContents, () => storage.current(), devOrigin)
    installMenu(testMode)
    openWindow()
    storage.start()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) openWindow()
    })
  })
  .catch(() => {
    console.error('SHELL_START_FAILED')
    app.exit(1)
  })
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
let shutdownStarted = false
let shutdownFinished = false
app.on('before-quit', (event) => {
  if (shutdownFinished) return
  event.preventDefault()
  if (shutdownStarted) return
  shutdownStarted = true
  void storage.stop().catch(() => {}).finally(() => {
    shutdownFinished = true
    app.quit()
  })
})
