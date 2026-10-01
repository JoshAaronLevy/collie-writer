import { app, BrowserWindow, dialog, Menu, shell, type MenuItemConstructorOptions } from 'electron'
import { externalHttpUrl } from './security'
import { bundledResources } from './resources'
import { join } from 'node:path'
import type { ReleaseChannel } from './release'

export async function confirmExternalLink(raw: unknown, testMode: boolean): Promise<void> {
  const url = externalHttpUrl(raw)
  if (!url || testMode) return
  const choice = await dialog.showMessageBox({
    type: 'question',
    title: 'Open website?',
    message: 'Open this address in your browser?',
    detail: url,
    buttons: ['Cancel', 'Open website'],
    defaultId: 0,
    cancelId: 0,
    noLink: true
  })
  if (choice.response === 1) await shell.openExternal(url)
}
export function installMenu(testMode: boolean, channel: ReleaseChannel, fileAction: (kind: 'save' | 'save-as' | 'open') => void, editorAction: (kind: 'undo' | 'redo' | 'find' | 'paste-plain') => void, checkUpdates: () => void, installUpdate: () => void): void {
  const about = (): void => {
    void dialog.showMessageBox({
      type: 'info',
      title: 'About Collie Writer',
      message: 'Collie Writer',
      detail: `${channel === 'production' ? 'Direct' : channel === 'beta' ? 'Beta' : 'Development'} build ${app.getVersion()}\n\nA workspace for research and writing.\nLocal draft recovery and portable project Save/Open are available. Cloud upload is managed by your chosen storage provider.`
    })
  }
  const template: MenuItemConstructorOptions[] = [
    ...(process.platform === 'darwin'
      ? [
          {
            label: 'Collie Writer',
            submenu: [
              { label: 'About Collie Writer', click: about },
              { type: 'separator' },
              { role: 'services' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' }
            ]
          } as MenuItemConstructorOptions
        ]
      : []),
    {
      label: 'File',
      submenu: [
        { label: 'Open project file…', accelerator: 'CmdOrCtrl+O', click: () => fileAction('open') },
        { label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => fileAction('save') },
        { label: 'Save As…', accelerator: 'CmdOrCtrl+Shift+S', click: () => fileAction('save-as') },
        { type: 'separator' },
        { role: 'close' },
        ...(process.platform === 'darwin' ? [] : [{ role: 'quit' } as MenuItemConstructorOptions])
      ]
    },
    { label: 'Edit', submenu: [
      { label: 'Undo', accelerator: 'CmdOrCtrl+Z', click: () => editorAction('undo') },
      { label: 'Redo', accelerator: 'CmdOrCtrl+Shift+Z', click: () => editorAction('redo') },
      { type: 'separator' },
      { role: 'cut' }, { role: 'copy' }, { role: 'paste' },
      { label: 'Paste as Plain Text', accelerator: 'CmdOrCtrl+Shift+V', click: () => editorAction('paste-plain') },
      { role: 'selectAll' },
      { type: 'separator' },
      { label: 'Find in Section', accelerator: 'CmdOrCtrl+F', click: () => editorAction('find') }
    ] },
    {
      label: 'View',
      submenu: [
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { role: 'togglefullscreen' }
      ]
    },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        { label: 'About Collie Writer', click: about },
        { label: 'Check for updates…', click: checkUpdates },
        { label: 'Install downloaded update…', click: installUpdate },
        { type: 'separator' },
        {
          label: 'Third-party licenses',
          click: () => {
            void dialog.showMessageBox({
              type: 'info',
              title: 'Third-party licenses',
              message: 'citeproc-js implements the Citation Style Language',
              detail: '© Frank Bennett\nhttps://citationstyles.org/\n\nThe citation processor is used under CPAL 1.0. Its unmodified source and license, CSL style/locale notices, font licenses and editor/export notices are bundled with this app.',
              buttons: ['Close', 'Show bundled licenses'], defaultId: 0, cancelId: 0, noLink: true
            }).then(result => {
              if (result.response === 1) shell.showItemInFolder(join(bundledResources(), 'licenses/NOTICE.txt'))
            })
          }
        },
        {
          label: 'Privacy and data',
          click: () => {
            void dialog.showMessageBox({
              type: 'info',
              title: 'Privacy and data',
              message: 'Your writing belongs to you.',
              detail:
                'Collie Writer is ad-free. Working projects and recovery stay in the local folder shown in the project screen. Local recovery is not a saved project file or cloud upload. There is no analytics or automatic update connection. Configured purchase connections and update checks occur only after your explicit action and do not send writing.'
            })
          }
        }
      ]
    }
  ]
  if (!app.isPackaged)
    template.push({
      label: 'Development',
      submenu: [
        {
          label: 'Open developer tools',
          click: () => BrowserWindow.getFocusedWindow()?.webContents.openDevTools()
        },
        {
          label: 'Electron security documentation…',
          click: () => {
            void confirmExternalLink(
              'https://www.electronjs.org/docs/latest/tutorial/security',
              testMode
            )
          }
        }
      ]
    })
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
