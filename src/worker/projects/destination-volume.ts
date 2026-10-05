import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { dirname, join } from 'node:path'
import { ProjectError } from '../../domain/projects/errors'

const execute = promisify(execFile)
/** Product safety check, not a write probe. Cloud-provider folders on local volumes are allowed. */
export async function requireDestinationVolume(path: string): Promise<void> {
  try {
    if (process.platform === 'darwin') {
      const usage = await execute('/bin/df', ['-P', dirname(path)], {
        env: { ...process.env, LC_ALL: 'C' },
        timeout: 10000,
        maxBuffer: 8192
      })
      const device = usage.stdout.split('\n')[1]?.trim().split(/\s+/)[0]
      if (!device || !/^\/dev\/disk\d+(?:s\d+)*$/.test(device)) throw new Error()
      const output = await execute('/usr/sbin/diskutil', ['info', '-plist', device], {
        timeout: 10000,
        maxBuffer: 128000
      })
      if (!/<key>FilesystemType<\/key>\s*<string>(apfs|hfs)<\/string>/.test(output.stdout))
        throw new Error()
    } else if (process.platform === 'win32') {
      const script =
        "$ErrorActionPreference='Stop'; $p=$env:COLLIE_SAVE_DIRECTORY; if (!$p -or $p.StartsWith('\\\\')) { throw 'Unsupported' }; $d=[IO.DriveInfo]::new([IO.Path]::GetPathRoot($p)); if ($d.DriveType -ne [IO.DriveType]::Fixed -or $d.DriveFormat -notin @('NTFS','ReFS')) { throw 'Unsupported' }"
      await execute(
        join(
          process.env.SystemRoot ?? 'C:\\Windows',
          'System32/WindowsPowerShell/v1.0/powershell.exe'
        ),
        ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script],
        {
          env: { ...process.env, COLLIE_SAVE_DIRECTORY: dirname(path) },
          timeout: 10000,
          maxBuffer: 8192,
          windowsHide: true
        }
      )
    } else throw new Error()
  } catch {
    throw new ProjectError('UNSAFE_DESTINATION')
  }
}
