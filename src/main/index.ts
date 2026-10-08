import { ProofreadingService } from './proofreading/service'
import { registerProofreadingIpc } from './proofreading/ipc'
import { ConversationService } from './conversations/service'
import { registerConversationIpc } from './conversations/ipc'
import { ProjectError } from '../domain/projects/errors'
import { app, BrowserWindow, dialog, protocol, session } from 'electron'
import { join } from 'node:path'
import { EDITOR_ACTION, STORAGE_STATUS_CHANGED, type AppInfo } from '../shared/commands'
import { registerAppIpc, registerStorageIpc, registerHelpIpc } from './ipc'
import { denyTestNetwork } from './test-network'
import { installMenu } from './menus'
import { configureProfile } from './profile'
import { createAssetHandler } from './protocol'
import { developmentOrigin } from './security'
import { StorageWorker } from './storage-worker'
import { createWindow, protectSession } from './windows'
import { WorkingLocation } from './paths/working-root'
import { registerProjectIpc } from './projects-ipc'
import { registerStorageInventoryIpc } from './storage-inventory-ipc'
import { ProjectFileIpc } from './project-files-ipc'
import { ProjectLifecycle } from './lifecycle'
import { SourceAssets } from './source-assets'
import { AccessService } from './entitlements/service'
import { SupportService } from './support'
import { DirectAccessService } from './entitlements/direct/service'
import { RELEASE } from './release'
import { DirectUpdater } from './updates/direct'
import { AiService } from './ai/service'
import { registerAiIpc } from './ai/ipc'

app.setName('Collie Writer')
app.setAppUserModelId(RELEASE.appId)
app.enableSandbox()
const testMode = configureProfile()
if (testMode) denyTestNetwork()
const primaryInstance = app.requestSingleInstanceLock()
if (!primaryInstance) app.exit(0)
let shellReady = false
const shellOpenQueue: string[] = app.isPackaged
  ? process.argv.slice(1).filter((value) => value.toLowerCase().endsWith('.collie'))
  : []
app.on('open-file', (event, path) => {
  event.preventDefault()
  if (shellReady) files.offerShellPath(path)
  else if (shellOpenQueue.length < 8) shellOpenQueue.push(path)
})
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
const sourceAssets = new SourceAssets(
  () => location.path() ?? null,
  () => window?.webContents,
  devOrigin
)
const storage = new StorageWorker((status) => {
  if (status.state === 'unavailable') files.unavailable()
  if (status.state === 'ready') {
    void access.initialize()
    files.nudgeShellOpen()
  }
  if (window && !window.isDestroyed() && !window.webContents.isDestroyed())
    window.webContents.send(STORAGE_STATUS_CHANGED, status)
})
const access = new AccessService(
  () => window?.webContents,
  storage,
  () => unprotected,
  () => location.path(),
  devOrigin
)
const ai = new AiService(() => location.path(), access)
const conversations = new ConversationService(storage, ai)
const proofreading = new ProofreadingService(storage, ai)
conversations.setOtherPending(() => proofreading.hasPendingWork())
proofreading.setOtherPending(() => conversations.hasPendingWork())
ai.setContentPending(() => conversations.hasPendingWork() || proofreading.hasPendingWork())
ai.setContentLifecycle(
  () => [...conversations.workItems(), ...proofreading.workItems()],
  async () => {
    const conversationSettled = await conversations.settleForClose()
    const proofreadingSettled = await proofreading.settleForClose()
    return conversationSettled && proofreadingSettled
  }
)
access.setExternalWorkGuard(
  () =>
    ai.isSettling() ||
    ai.hasPendingWork() ||
    conversations.hasPendingWork() ||
    proofreading.hasPendingWork()
)
const directAccess = new DirectAccessService(() => window?.webContents, access, devOrigin)
const support = new SupportService(
  () => window?.webContents,
  () => storage.current(),
  devOrigin
)
storage.onErrorCode((code) => support.recordError(code))
storage.setAccessPolicy(
  (command) => {
    if (
      ['open', 'create', 'reset', 'recoverReset'].includes(command.kind) &&
      (ai.isSettling() ||
        ai.hasPendingWork() ||
        conversations.hasPendingWork() ||
        proofreading.hasPendingWork())
    )
      throw new ProjectError('ACCESS_BUSY')
    access.authorize(command)
  },
  (command) => {
    if (
      (['open', 'restore', 'recover', 'duplicate', 'locate', 'inspect'].includes(command.kind) ||
        (command.kind === 'answer' && command.choice !== 'cancel')) &&
      (ai.isSettling() ||
        ai.hasPendingWork() ||
        conversations.hasPendingWork() ||
        proofreading.hasPendingWork())
    )
      throw new ProjectError('ACCESS_BUSY')
    if (
      ['open', 'restore', 'recover', 'duplicate', 'locate', 'inspect'].includes(command.kind) ||
      (command.kind === 'answer' && command.choice !== 'cancel')
    )
      access.authorizeFileChange()
  },
  (command, value) => access.observe(command, value)
)
const files = new ProjectFileIpc(() => window?.webContents, location, storage, devOrigin)
const lifecycle = new ProjectLifecycle(
  () => window?.webContents,
  files,
  () => unprotected,
  devOrigin,
  ai,
  () => conversations.hasPendingWork() || proofreading.hasPendingWork()
)
const prepareUpdateRestart = async (): Promise<boolean> => {
  if (shutdownStarted || shutdownFinished) return false
  shutdownStarted = true
  try {
    if (!(await lifecycle.closeForUpdate())) {
      shutdownStarted = false
      return false
    }
    await storage.stop(() => {
      void dialog.showMessageBox({
        type: 'warning',
        title: 'Finishing local work',
        message: 'Collie Writer is waiting for local storage before restarting.',
        buttons: ['Keep waiting'],
        noLink: true
      })
    })
    closeApproved = true
    shutdownFinished = true
    return true
  } catch {
    shutdownStarted = false
    ai.resume()
    files.action('close-cancelled')
    return false
  }
}
let updater: DirectUpdater
let closeApproved = false
function openWindow(): void {
  closeApproved = false
  ai.resume()
  ai.resumeSession()
  window = createWindow(devOrigin)
  const opened = window
  opened.webContents.on('render-process-gone', () => {
    lifecycle.rendererLost(opened.webContents)
    ai.suspend()
  })
  opened.webContents.once('did-finish-load', () => {
    if (shellOpenQueue.length) files.offerShellPath(shellOpenQueue.shift()!)
    else files.nudgeShellOpen()
  })
  opened.webContents.on('did-finish-load', () => {
    lifecycle.rendererLoaded(opened.webContents)
    ai.resumeSession()
  })
  opened.webContents.on('did-fail-load', (_event, code, _description, _url, isMainFrame) => {
    if (isMainFrame && code !== -3) lifecycle.rendererLoadFailed(opened.webContents)
  })
  opened.on('close', (event) => {
    if (closeApproved || shutdownFinished) return
    event.preventDefault()
    void lifecycle
      .close()
      .then((allowed) => {
        if (allowed && !opened.isDestroyed()) {
          closeApproved = true
          opened.close()
        }
      })
      .catch(() => {
        /* Keep the window and buffer on an unavailable native dialog. */
      })
  })
  window.on('closed', () => {
    ai.suspend()
    window = undefined
    files.revoke()
    sourceAssets.revoke()
    access.releaseWindow()
  })
  opened.on('focus', () => {
    void files.recheck()
  })
}
app
  .whenReady()
  .then(async () => {
    if (!primaryInstance) return
    await location.initialize()
    await access.initialize()
    protectSession(session.defaultSession, devOrigin)
    updater = new DirectUpdater(() => window, prepareUpdateRestart)
    protocol.handle('collie-source', sourceAssets.handle)
    if (!devOrigin)
      protocol.handle('collie', await createAssetHandler(join(__dirname, '../renderer')))
    registerAppIpc(
      () => window?.webContents,
      () => ({
        name: 'Collie Writer',
        version: app.getVersion(),
        channel: RELEASE.channel,
        platform: process.platform as AppInfo['platform']
      }),
      devOrigin
    )
    registerHelpIpc(() => window?.webContents, updater, devOrigin)
    registerStorageIpc(
      () => window?.webContents,
      () => storage.current(),
      devOrigin
    )
    access.register()
    registerProofreadingIpc(() => window?.webContents, proofreading, devOrigin)
    registerConversationIpc(() => window?.webContents, conversations, devOrigin, testMode)
    registerAiIpc(() => window?.webContents, ai, devOrigin)
    directAccess.register()
    support.register()
    registerProjectIpc(
      () => window?.webContents,
      location,
      storage,
      (value) => {
        unprotected = value
      },
      ai,
      devOrigin,
      sourceAssets
    )
    registerStorageInventoryIpc(
      () => window?.webContents,
      storage,
      devOrigin,
      () => ai.inventoryOwners()
    )
    files.register()
    lifecycle.register()
    installMenu(
      testMode,
      RELEASE.channel,
      (kind) => {
        files.action(kind)
      },
      (kind) => {
        if (window && !window.isDestroyed()) window.webContents.send(EDITOR_ACTION, kind)
      },
      () => {
        void updater.check()
      },
      () => {
        void updater.install()
      }
    )
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
app.on('second-instance', (_event, commandLine) => {
  if (!shellReady) return
  if (!window) openWindow()
  const path = commandLine.find((value) => value.toLowerCase().endsWith('.collie'))
  if (path) files.offerShellPath(path)
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
  void lifecycle
    .close()
    .then(async (allowed) => {
      if (!allowed) {
        shutdownStarted = false
        return
      }
      closeApproved = true
      await storage.stop(() => {
        const options = {
          type: 'warning' as const,
          title: 'Finishing local work',
          message: 'Collie Writer is still waiting for storage to close safely.',
          detail:
            'Pending writes have not been terminated. Keep the app open while storage finishes.',
          buttons: ['Keep waiting'],
          noLink: true
        }
        void (window && !window.isDestroyed()
          ? dialog.showMessageBox(window, options)
          : dialog.showMessageBox(options))
      })
      shutdownFinished = true
      app.quit()
    })
    .catch(() => {
      shutdownStarted = false
      closeApproved = false
      ai.resume()
      files.action('close-cancelled')
      void dialog.showMessageBox({
        type: 'warning',
        title: 'Closing paused',
        message:
          'Storage has not confirmed shutdown. Keep the app open and preserve any visible writing.',
        buttons: ['Keep open']
      })
    })
})
