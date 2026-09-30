// Deliberately hostile test bridge; never included in application output or artifacts.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('attack', {
  invoke: (channel, payload) => ipcRenderer.invoke(channel, payload)
})
