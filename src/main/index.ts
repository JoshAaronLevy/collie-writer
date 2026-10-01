import { app, BrowserWindow, dialog, protocol, session } from 'electron'
import { join } from 'node:path'
import { APP_ID, EDITOR_ACTION, STORAGE_STATUS_CHANGED, type AppInfo } from '../shared/commands'
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
import { ProjectFileIpc } from './project-files-ipc'
import { ProjectLifecycle } from './lifecycle'
import { SourceAssets } from './source-assets'
import { AccessService } from './entitlements/service'
import { SupportService } from './support'

app.setName('Collie Writer')
app.setAppUserModelId(APP_ID)
app.enableSandbox()
const testMode = configureProfile()
if (testMode) denyTestNetwork()
const primaryInstance = app.requestSingleInstanceLock()
if (!primaryInstance) app.exit(0)
const location = new WorkingLocation(testMode)
let unprotected = false
const devOrigin = developmentOrigin(process.env.ELECTRON_RENDERER_URL, app.isPackaged)
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'collie',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true }
  },
  {
    scheme: 'collie-print',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true }
  },
  {
    scheme: 'collie-source',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true }
  }
])
let window: BrowserWindow | undefined
const sourceAssets=new SourceAssets(()=>location.path(),()=>window?.webContents,devOrigin)
let shellReady = false
const storage = new StorageWorker((status) => {
  if (status.state === 'unavailable') files.unavailable()
  if (status.state === 'ready') void access.initialize()
  if (window && !window.isDestroyed() && !window.webContents.isDestroyed())
    window.webContents.send(STORAGE_STATUS_CHANGED, status)
})
const access = new AccessService(() => window?.webContents,storage,() => unprotected,() => location.path(),devOrigin)
const support = new SupportService(() => window?.webContents,()=>storage.current(),devOrigin)
storage.onErrorCode(code=>support.recordError(code))
storage.setAccessPolicy(command=>access.authorize(command),command=>{
  if(['open','restore','recover','duplicate','locate','inspect'].includes(command.kind)||command.kind==='answer'&&command.choice!=='cancel')access.authorizeFileChange()
},(command,value)=>access.observe(command,value))
const files = new ProjectFileIpc(() => window?.webContents, location, storage, devOrigin)
const lifecycle = new ProjectLifecycle(() => window?.webContents, files, () => unprotected, devOrigin)
let closeApproved = false
function openWindow(): void {
  closeApproved = false
  window = createWindow(devOrigin)
  const opened = window
  opened.on('close', event => {
    if (closeApproved || shutdownFinished) return
    event.preventDefault()
    void lifecycle.close().then(allowed => { if (allowed && !opened.isDestroyed()) { closeApproved = true; opened.close() } }).catch(() => { /* Keep the window and buffer on an unavailable native dialog. */ })
  })
  window.on('closed', () => {
    window = undefined
    files.revoke()
    sourceAssets.revoke()
    access.releaseWindow()
  })
  opened.on('focus', () => { void files.recheck() })
}
app
  .whenReady()
  .then(async () => {
    if (!primaryInstance) return
    await location.initialize()
    await access.initialize()
    protectSession(session.defaultSession, devOrigin)
    protocol.handle('collie-source',sourceAssets.handle)
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
    access.register()
    support.register()
    registerProjectIpc(() => window?.webContents, location, storage, value => { unprotected = value }, devOrigin, sourceAssets)
    files.register()
    lifecycle.register()
    installMenu(testMode, kind => { files.action(kind) }, kind => { if (window && !window.isDestroyed()) window.webContents.send(EDITOR_ACTION, kind) })
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
  if (shutdownStarted) return
  shutdownStarted = true
  void lifecycle.close().then(async allowed => {
    if (!allowed) { shutdownStarted = false; return }
    closeApproved = true
    await storage.stop(() => {
      const options = { type: 'warning' as const, title: 'Finishing local work', message: 'Collie Writer is still waiting for storage to close safely.', detail: 'Pending writes have not been terminated. Keep the app open while storage finishes.', buttons: ['Keep waiting'], noLink: true }
      void (window && !window.isDestroyed() ? dialog.showMessageBox(window, options) : dialog.showMessageBox(options))
    })
    shutdownFinished = true; app.quit()
  }).catch(() => { shutdownStarted = false; closeApproved = false; files.action('close-cancelled'); void dialog.showMessageBox({ type: 'warning', title: 'Closing paused', message: 'Storage has not confirmed shutdown. Keep the app open and preserve any visible writing.', buttons: ['Keep open'] }) })
})
