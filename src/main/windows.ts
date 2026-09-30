import { BrowserWindow, type Session } from 'electron'
import { join } from 'node:path'
import { APP_URL, allowedRequest, contentSecurityPolicy } from './security'

export function protectSession(session: Session, devOrigin?: string): void {
  session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
  session.setPermissionCheckHandler(() => false)
  session.setDevicePermissionHandler(() => false)
  session.on('will-download', (event) => event.preventDefault())
  session.webRequest.onBeforeRequest((details, callback) =>
    callback({ cancel: !allowedRequest(details.url, devOrigin) })
  )
  session.webRequest.onHeadersReceived((details, callback) =>
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [contentSecurityPolicy(devOrigin)]
      }
    })
  )
}
export function protectWindow(window: BrowserWindow): void {
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event) => event.preventDefault())
  window.webContents.on('will-frame-navigate', (event) => event.preventDefault())
  window.webContents.on('will-redirect', (event) => event.preventDefault())
  window.webContents.on('will-attach-webview', (event) => event.preventDefault())
}
export function createWindow(devOrigin?: string): BrowserWindow {
  const window = new BrowserWindow({
    title: 'Collie Writer',
    width: 1000,
    height: 720,
    minWidth: 420,
    minHeight: 400,
    show: false,
    backgroundColor: '#f6f4ee',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      spellcheck: false,
      navigateOnDragDrop: false
    }
  })
  protectWindow(window)
  window.once('ready-to-show', () => window.show())
  void window.loadURL(devOrigin ? `${devOrigin}/` : APP_URL).catch(() => {
    // No exception serialization: loader errors can contain paths.
    console.error('SHELL_LOAD_FAILED')
  })
  return window
}
