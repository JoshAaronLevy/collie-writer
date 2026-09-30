import { app, dialog } from 'electron'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { homedir } from 'node:os'
import { dirname, join, parse, resolve, isAbsolute } from 'node:path'
import { lstat, realpath, mkdir, readFile, open, rename } from 'node:fs/promises'
import { APP_ID } from '../../shared/commands'
import type { LocationStatus } from '../../shared/projects'

const execute = promisify(execFile)
const message = 'Working copies stay on this computer. This is not a project-file Save destination.'
// Fixed native query; the selected path is passed as a separate environment value, never shell code.
const windowsQuery = `$ErrorActionPreference='Stop';
$p=$env:COLLIE_WORKING_CANDIDATE;
if (!$p) { $p=[Environment]::GetFolderPath([Environment+SpecialFolder]::LocalApplicationData) };
if (!$p -or $p.StartsWith('\\\\')) { throw 'Unsafe root' };
$d=[IO.DriveInfo]::new([IO.Path]::GetPathRoot($p));
if ($d.DriveType -ne [IO.DriveType]::Fixed -or $d.DriveFormat -notin @('NTFS','ReFS')) { throw 'Not a fixed local volume' };
$i=Get-Item -LiteralPath $p -Force;
while ($i) { if (($i.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or ($i.Attributes -band [IO.FileAttributes]::Offline) -ne 0) { throw 'Redirected folder' }; $i=$i.Parent };
[Console]::OutputEncoding=[Text.Encoding]::UTF8; [Console]::Write($p)`

async function nativeLocalDirectory(candidate?: string): Promise<string> {
  let path: string
  if (process.platform === 'win32') {
    const executable = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe')
    const output = await execute(executable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', windowsQuery], { env: { ...process.env, COLLIE_WORKING_CANDIDATE: candidate ?? '' }, timeout: 10000, maxBuffer: 8192, windowsHide: true })
    path = output.stdout.trim()
  } else if (process.platform === 'darwin') {
    path = candidate ?? join(homedir(), 'Library/Application Support')
    // diskutil requires a device/mount point, not an arbitrary subdirectory (including firmlinks).
    const usage = await execute('/bin/df', ['-P', path], { env: { ...process.env, LC_ALL: 'C' }, timeout: 10000, maxBuffer: 8192 })
    const device = usage.stdout.split('\n')[1]?.trim().split(/\s+/)[0]
    if (!device || !/^\/dev\/disk\d+(?:s\d+)*$/.test(device)) throw new Error('LOCAL_VOLUME_REQUIRED')
    // diskutil describes the backing volume. Remote filesystems and external media are refused.
    const output = await execute('/usr/sbin/diskutil', ['info', '-plist', device], { timeout: 10000, maxBuffer: 128000 })
    if (!/<key>Internal<\/key>\s*<true\s*\/>/.test(output.stdout) || !/<key>FilesystemType<\/key>\s*<string>(apfs|hfs)<\/string>/.test(output.stdout)) throw new Error('LOCAL_VOLUME_REQUIRED')
  } else throw new Error('UNSUPPORTED_PLATFORM')
  if (!isAbsolute(path) || path.length > 4000) throw new Error('INVALID_ROOT')
  path = resolve(path)
  const cloudNames = /(^|[\\/])(CloudStorage|Mobile Documents|OneDrive[^\\/]*|Dropbox|Google Drive|GoogleDrive|Box|iCloud Drive)([\\/]|$)/i
  if (cloudNames.test(path)) throw new Error('CLOUD_ROOT')
  for (const root of [process.env.OneDrive, process.env.OneDriveCommercial, process.env.OneDriveConsumer]) {
    if (root && (path.toLowerCase() === resolve(root).toLowerCase() || path.toLowerCase().startsWith(resolve(root).toLowerCase() + '\\'))) throw new Error('CLOUD_ROOT')
  }
  for (let current = path; ; current = dirname(current)) {
    const info = await lstat(current)
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('REDIRECTED_ROOT')
    if (process.platform === 'darwin') {
      const attrs = await execute('/usr/bin/xattr', [current], { timeout: 5000, maxBuffer: 16000 })
      if (/fileprovider|ubiquity|icloud/i.test(attrs.stdout)) throw new Error('CLOUD_ROOT')
    }
    if (current === parse(current).root) break
  }
  if ((await realpath(path)).toLowerCase() !== path.toLowerCase()) throw new Error('REDIRECTED_ROOT')
  return path
}

export class WorkingLocation {
  private root: string | undefined
  private choosing: Promise<LocationStatus> | undefined
  private status: LocationStatus = { state: 'required', path: null, message: 'A device-local working folder is required.' }
  constructor(private readonly disabled: boolean) {}
  current(): LocationStatus { return this.status }
  path(): string | undefined { return this.root }
  private preference(): string { return join(app.getPath('userData'), 'working-location.json') }
  private async establish(parent?: string): Promise<void> {
    const verified = await nativeLocalDirectory(parent)
    const root = join(verified, APP_ID, 'working')
    // Recheck each new/existing component before creating its child; do not follow a symlink.
    for (const directory of [join(verified, APP_ID), root]) {
      await mkdir(directory, { recursive: false, mode: 0o700 }).catch(error => { if (error.code !== 'EEXIST') throw error })
      const info = await lstat(directory)
      if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('REDIRECTED_ROOT')
    }
    await nativeLocalDirectory(root)
    this.root = root
    this.status = { state: 'ready', path: root, message }
  }
  async initialize(): Promise<void> {
    if (this.disabled) return // Historical test profiles must never select real working storage.
    try {
      let parent: string | undefined
      try {
        const stored: unknown = JSON.parse(await readFile(this.preference(), 'utf8'))
        if (!stored || typeof stored !== 'object' || !('parent' in stored) || typeof stored.parent !== 'string') throw new Error('INVALID_LOCATION_SETTING')
        parent = stored.parent
      } catch (error) {
        if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'ENOENT') throw error
      }
      await this.establish(parent)
    } catch {
      this.status = { state: 'required', path: null, message: 'The working folder could not be established as local. Choose an internal, unsynced folder. Existing files remain untouched.' }
    }
  }
  async choose(): Promise<LocationStatus> {
    if (this.choosing) return this.choosing
    this.choosing = this.chooseOnce()
    try { return await this.choosing } finally { this.choosing = undefined }
  }
  private async chooseOnce(): Promise<LocationStatus> {
    if (this.root || this.disabled) return this.status
    const choice = await dialog.showOpenDialog({ title: 'Choose a local working-data folder', message: 'Choose a folder on the internal disk outside cloud sync. This does not choose where project files will be saved.', properties: ['openDirectory'] })
    if (choice.canceled || choice.filePaths.length !== 1) return this.status
    try {
      await this.establish(choice.filePaths[0])
      const temporary = this.preference() + '.new'
      const file = await open(temporary, 'w', 0o600)
      try { await file.writeFile(JSON.stringify({ parent: choice.filePaths[0] })); await file.sync() } finally { await file.close() }
      await rename(temporary, this.preference())
    } catch {
      this.root = undefined
      this.status = { state: 'required', path: null, message: 'That folder could not be used safely. Choose another internal, unsynced folder. Existing work has not been moved.' }
    }
    return this.status
  }
}
