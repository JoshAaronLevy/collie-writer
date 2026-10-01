import { app, BrowserWindow, dialog } from 'electron'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { load } from 'js-yaml'
import { autoUpdater } from 'electron-updater'
import { RELEASE } from '../release'

type UpdateConfiguration = { provider: 'generic'; url: string; publisherName?: string | string[] }
const feed = RELEASE.updateOrigin ? `${RELEASE.updateOrigin}/direct/${RELEASE.channel}/` : null

function updateConfiguration(): UpdateConfiguration | null {
  if (!app.isPackaged || !feed || !['darwin', 'win32'].includes(process.platform)) return null
  try {
    const raw = readFileSync(join(process.resourcesPath, 'app-update.yml'))
    if (raw.length > 8192) return null
    const data: unknown = load(raw.toString('utf8'))
    if (!data || typeof data !== 'object' || !('provider' in data) || !('url' in data) || data.provider !== 'generic' || data.url !== feed) return null
    if (process.platform === 'win32') {
      if (!RELEASE.publisherName || !('publisherName' in data)) return null
      const names = Array.isArray(data.publisherName) ? data.publisherName : [data.publisherName]
      if (names.length !== 1 || names[0] !== RELEASE.publisherName) return null
    }
    return data as UpdateConfiguration
  } catch { return null }
}

export class DirectUpdater {
  private readonly configured = updateConfiguration() !== null
  private busy = false
  private downloadedVersion: string | null = null
  private installing = false
  constructor(private readonly owner: () => BrowserWindow | undefined, private readonly prepareRestart: () => Promise<boolean>) {
    if (!this.configured || !feed) return
    autoUpdater.logger = null
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = false
    autoUpdater.allowPrerelease = RELEASE.channel === 'beta'
    autoUpdater.allowDowngrade = false
    autoUpdater.disableWebInstaller = true
    autoUpdater.disableDifferentialDownload = true
    autoUpdater.on('error', () => { if (this.installing) app.quit() })
    // electron-updater v6 uses its own session. Keep that session confined to
    // the signed package's channel feed, including redirected requests.
    autoUpdater.netSession.webRequest.onBeforeRequest((details, callback) => {
      let allowed = false
      try {
        const url = new URL(details.url)
        allowed = url.protocol === 'https:' && url.origin === RELEASE.updateOrigin &&
          url.pathname.startsWith(`/direct/${RELEASE.channel}/`) &&
          [...url.searchParams.keys()].every(key => key === 'noCache')
      } catch { /* Deny malformed and redirected URLs. */ }
      callback({ cancel: !allowed })
    })
    autoUpdater.netSession.webRequest.onBeforeSendHeaders((details, callback) => {
      const headers = { ...details.requestHeaders }
      for (const name of Object.keys(headers)) if (name.toLowerCase() === 'x-user-staging-id') delete headers[name]
      callback({ requestHeaders: headers })
    })
    autoUpdater.setFeedURL({ provider: 'generic', url: feed })
  }
  private async inform(message: string, detail?: string): Promise<void> {
    const options = { type: 'info' as const, title: 'Collie Writer updates', message, detail, buttons: ['OK'], noLink: true }
    const window = this.owner()
    if (window && !window.isDestroyed()) await dialog.showMessageBox(window, options)
    else await dialog.showMessageBox(options)
  }
  private async choose(message: string, detail: string, affirmative: string): Promise<boolean> {
    const options = { type: 'question' as const, title: 'Collie Writer updates', message, detail, buttons: ['Later', affirmative], defaultId: 0, cancelId: 0, noLink: true }
    const window = this.owner()
    const result = window && !window.isDestroyed() ? await dialog.showMessageBox(window, options) : await dialog.showMessageBox(options)
    return result.response === 1
  }
  async check(): Promise<void> {
    if (this.busy) return
    if (!this.configured) { await this.inform('Updates are not configured in this build.', 'Development packages and releases without a verified signed feed do not make update requests.'); return }
    this.busy = true
    try {
      const result = await autoUpdater.checkForUpdates()
      if (!result?.isUpdateAvailable) { await this.inform('Collie Writer is up to date.', `Installed version: ${app.getVersion()}.`); return }
      if (result.updateInfo.stagingPercentage !== undefined || !Array.isArray(result.updateInfo.files) || !result.updateInfo.files.length ||
        result.updateInfo.files.some(file => typeof file.url !== 'string' || !file.url || typeof file.sha512 !== 'string' ||
          Buffer.from(file.sha512, 'base64').length !== 64 || typeof file.size !== 'number' || !Number.isSafeInteger(file.size) || file.size <= 0))
        throw new Error('UNTRUSTED_UPDATE_METADATA')
      const version = result.updateInfo.version
      if (!await this.choose(`Version ${version} is available.`, 'Download this signed update now? No writing or project files will be sent.', 'Download')) return
      await autoUpdater.downloadUpdate()
      this.downloadedVersion = version
      if (await this.choose(`Version ${version} is ready.`, 'Restart only after current writing and file jobs are protected. You can install later from Help.', 'Install and restart')) await this.install()
    } catch {
      await this.inform('The update could not be verified or downloaded.', 'The current app and local writing remain available. Check the network or contact support, then retry.')
    } finally { this.busy = false }
  }
  async install(): Promise<void> {
    if (!this.configured || !this.downloadedVersion) { await this.inform('No downloaded update is ready.', 'Use Help → Check for updates first.'); return }
    if (!await this.prepareRestart()) { await this.inform('Restart was paused.', 'Keep the app open, finish or save pending work, then choose Install downloaded update again.'); return }
    this.installing = true
    try { autoUpdater.quitAndInstall(false, true) }
    catch {
      await this.inform('The installer could not start.', 'Your writing was protected before the restart. Reopen the current app and contact support before retrying.')
      app.quit()
    }
  }
  hasDownloaded(): boolean { return !!this.downloadedVersion }
}
