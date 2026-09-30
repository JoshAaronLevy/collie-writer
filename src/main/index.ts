import { app, BrowserWindow, protocol, session, dialog } from 'electron'
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
import { WorkingLocation } from './paths/working-root'
import { registerProjectIpc } from './projects-ipc'

app.setName('Collie Writer')
app.setAppUserModelId(APP_ID)
app.enableSandbox()
const testMode = configureProfile()
if (testMode) denyTestNetwork()
const primaryInstance = app.requestSingleInstanceLock()
if (!primaryInstance) app.exit(0)
const location = new WorkingLocation(testMode)
let unprotected = false
let askingToClose = false
async function confirmDiscard(): Promise<boolean> {
  if (askingToClose) return false
  askingToClose = true
  try {
    const answer = await dialog.showMessageBox({ type: 'warning', title: 'Unprotected writing', message: 'Some writing has not been committed locally.', detail: 'Keep the window open to commit or copy your text. Closing discards only the unprotected buffer; previously committed writing remains on this computer.', buttons: ['Keep window open', 'Discard unprotected changes and close'], defaultId: 0, cancelId: 0, noLink: true })
    return answer.response === 1
  } finally { askingToClose = false }
}
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
let shellReady = false
const storage = new StorageWorker((status) => {
  if (window && !window.isDestroyed() && !window.webContents.isDestroyed())
    window.webContents.send(STORAGE_STATUS_CHANGED, status)
})
function openWindow(): void {
  window = createWindow(devOrigin)
  const opened = window
  opened.on('close', event => {
    if (!unprotected) return
    event.preventDefault()
    void confirmDiscard().then(discard => { if (discard) { unprotected = false; opened.close() } })
  })
  window.on('closed', () => {
    window = undefined
  })
}
app
  .whenReady()
  .then(async () => {
    if (!primaryInstance) return
    await location.initialize()
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
    registerProjectIpc(() => window?.webContents, location, storage, value => { unprotected = value }, devOrigin)
    installMenu(testMode)
    shellReady = true
    openWindow()
    if (location.path()) storage.start(location.path()!)
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) openWindow()
    })
  })
  .catch(() => {
    console.error('SHELL_START_FAILED')
    app.exit(1)
  })
app.on('second-instance', () => {
  if (!shellReady) return
  if (!window) openWindow()
  if (window?.isMinimized()) window.restore()
  window?.focus()
})
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
let shutdownStarted = false
let shutdownFinished = false
app.on('before-quit', (event) => {
  if (shutdownFinished) return
  event.preventDefault()
  if (unprotected) {
    void confirmDiscard().then(discard => { if (discard) { unprotected = false; app.quit() } })
    return
  }
  if (shutdownStarted) return
  shutdownStarted = true
  void storage.stop().catch(() => {}).finally(() => {
    shutdownFinished = true
    app.quit()
  })
})
