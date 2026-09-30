import { app, BrowserWindow, dialog, Menu, shell, type MenuItemConstructorOptions } from 'electron'
import { externalHttpUrl } from './security'
import { bundledResources } from './resources'
import { join } from 'node:path'

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
export function installMenu(testMode: boolean): void {
  const about = (): void => {
    void dialog.showMessageBox({
      type: 'info',
      title: 'About Collie Writer',
      message: 'Collie Writer',
      detail: `Development build ${app.getVersion()}\n\nA workspace for research and writing.\nThis development shell does not yet create or save projects.`
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
        { role: 'close' },
        ...(process.platform === 'darwin' ? [] : [{ role: 'quit' } as MenuItemConstructorOptions])
      ]
    },
    { role: 'editMenu' },
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
                'Collie Writer is ad-free. This shell has no project storage, analytics, purchase service or automatic update connection.'
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
