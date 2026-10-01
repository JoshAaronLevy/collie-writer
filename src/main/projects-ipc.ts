import { isOutlineInput, isHistoryInput } from '../shared/outline'
import { isNoteChangeInput } from '../shared/notes'
import { isRenameInput, isArchiveInput, isResetInput } from '../shared/project-lifecycle'
import { BrowserWindow, clipboard, dialog, ipcMain, type WebContents } from 'electron'
import { randomUUID } from 'node:crypto'
import { basename } from 'node:path'
import { isTrustedSender } from './ipc'
import { isInfoRequest } from '../shared/schemas'
import { isId } from '../domain/editor/schema'
import { DIRTY_CHANGED, PROJECT_CHANNELS, exact, record, isCreateInput, isOpenInput, isSectionInput, isSectionMetaInput, isCommitInput, isImageImportInput, isImageReadInput, projectFailure, type OpenInput, type ProjectCommand } from '../shared/projects'
import { isSourceChangeInput, isSourcePreviewInput, isSourceImportInput, isSourceAttachmentInput, isSourceExportInput, isSourceAttachmentExportInput, SOURCE_PROGRESS, type BibliographyFormat } from '../shared/sources'
import { isInspectionScope, isInspectionPageInput, isInspectionAssetInput, isInspectionChangeInput, type WorkerInspectionAsset } from '../shared/inspection'
import { isEvidenceChangeInput } from '../shared/evidence'
import { isProjectValue } from '../shared/projects'
import type { SourceAssets } from './source-assets'
import type { WorkingLocation } from './paths/working-root'
import type { StorageWorker } from './storage-worker'

export function registerProjectIpc(owner: () => WebContents | undefined, location: WorkingLocation, storage: StorageWorker, dirty: (value: boolean) => void, devOrigin?: string, sourceAssets?:SourceAssets): void {
  let hasUnprotectedChanges = false
  let resetting = false
  const imageGrants = new Map<string, { path: string; name: string; scope: OpenInput; owner: number; frame: number; process: number; expires: number; operationId: string | null }>()
  const sourceGrants = new Map<string, { path: string; name: string; scope: OpenInput; owner: number; frame: number; process: number; expires: number; kind: 'import' | 'attachment' }>()
  storage.onSourceProgress(progress=>{const target=owner();if(target&&!target.isDestroyed())target.send(SOURCE_PROGRESS,progress)})
  const access = (event: Electron.IpcMainInvokeEvent, payload: unknown): boolean => isTrustedSender(event, owner(), devOrigin) && record(payload) && isId(payload.requestId)
  ipcMain.on(DIRTY_CHANGED, (event, payload: unknown) => {
    if (isTrustedSender(event, owner(), devOrigin) && typeof payload === 'boolean') { hasUnprotectedChanges = payload; dirty(payload) }
  })
  for (const [kind, channel] of Object.entries(PROJECT_CHANNELS)) {
    ipcMain.handle(channel, async (event, payload: unknown) => {
      if (!access(event, payload)) return projectFailure('', 'DENIED')
      const value = payload as Record<string, unknown>
      const requestId = value.requestId as string
      if (kind === 'location' || kind === 'chooseLocation') {
        if (!isInfoRequest(value)) return projectFailure(requestId, 'VALIDATION')
        if (kind === 'chooseLocation') {
          await location.choose()
          if (location.path()) storage.start(location.path()!)
        }
        return { ok: true, requestId, value: location.current() }
      }
      if (kind === 'plainClipboard') {
        if (!isInfoRequest(value)) return projectFailure(requestId, 'VALIDATION')
        const text = clipboard.readText()
        if (text.length > 1_000_000) return projectFailure(requestId, 'LIMIT_EXCEEDED')
        return { ok: true, requestId, value: text }
      }
      if (!location.path()) return projectFailure(requestId, 'STORAGE_LOCATION_REQUIRED')
      if (kind === 'pickImage') {
        if (!exact(value, ['requestId','input']) || !isOpenInput(value.input) || !event.senderFrame) return projectFailure(requestId, 'VALIDATION')
        const window = BrowserWindow.fromWebContents(event.sender)
        if (!window) return projectFailure(requestId, 'DENIED')
        const answer = await dialog.showOpenDialog(window, { title: 'Import image into this project', filters: [{ name: 'Images', extensions: ['png','jpg','jpeg'] }], properties: ['openFile','dontAddToRecent'] })
        if (answer.canceled || answer.filePaths.length !== 1) return { ok: true, requestId, value: null }
        if (window.isDestroyed() || !isTrustedSender(event, owner(), devOrigin) || !event.senderFrame) return projectFailure(requestId, 'DENIED')
        const path = answer.filePaths[0], name = basename(path)
        if (path.length > 4096 || name.length > 255 || !/\.(png|jpe?g)$/i.test(name) || /[\\/:\u0000-\u001f]/.test(name)) return projectFailure(requestId, 'VALIDATION')
        for (const [id, grant] of imageGrants) if (grant.expires < Date.now()) imageGrants.delete(id)
        if (imageGrants.size >= 32) return projectFailure(requestId, 'UNAVAILABLE')
        const token = randomUUID()
        imageGrants.set(token, { path, name, scope: value.input, owner: event.sender.id, frame: event.senderFrame.routingId, process: event.senderFrame.processId, expires: Date.now() + 10 * 60_000, operationId: null })
        return { ok: true, requestId, value: { token, name } }
      }
      if (kind === 'sourcePickImport' || kind === 'sourcePickAttachment' || kind === 'sourcePickVersion') {
        if (!exact(value,['requestId','input']) || !isOpenInput(value.input) || !event.senderFrame) return projectFailure(requestId,'VALIDATION')
        const window=BrowserWindow.fromWebContents(event.sender); if (!window) return projectFailure(requestId,'DENIED')
        const attachment=kind!=='sourcePickImport',version=kind==='sourcePickVersion'
        const answer=await dialog.showOpenDialog(window,{title:version?'Reimport a PDF or text version':attachment?'Attach a managed copy':'Import bibliography',filters:version?[{name:'Source versions',extensions:['pdf','txt']}]:attachment?[{name:'Local originals',extensions:['pdf','png','jpg','jpeg','txt']}]:[{name:'Bibliography',extensions:['json','bib','bibtex','ris']}],properties:['openFile','dontAddToRecent']})
        if (answer.canceled || answer.filePaths.length!==1) return {ok:true,requestId,value:null}
        if (window.isDestroyed() || !isTrustedSender(event,owner(),devOrigin) || !event.senderFrame) return projectFailure(requestId,'DENIED')
        const path=answer.filePaths[0],name=basename(path)
        if (path.length>4096 || name.length>255 || /[\\/:\u0000-\u001f]/.test(name) || !(version?/\.(pdf|txt)$/i:attachment?/\.(pdf|png|jpe?g|txt)$/i:/\.(json|bib|bibtex|ris)$/i).test(name)) return projectFailure(requestId,'VALIDATION')
        for (const [id,g] of sourceGrants) if (g.expires<Date.now()) sourceGrants.delete(id)
        if (sourceGrants.size>=32) return projectFailure(requestId,'UNAVAILABLE')
        const token=randomUUID();sourceGrants.set(token,{path,name,scope:value.input,owner:event.sender.id,frame:event.senderFrame.routingId,process:event.senderFrame.processId,expires:Date.now()+(attachment?10:60)*60_000,kind:attachment?'attachment':'import'})
        return {ok:true,requestId,value:{token,name}}
      }
      if (kind==='sourceExport' || kind==='sourceExportAttachment') {
        if (!exact(value,['requestId','input'])) return projectFailure(requestId,'VALIDATION')
        const input=value.input
        if (kind==='sourceExport'?!isSourceExportInput(input):!isSourceAttachmentExportInput(input)) return projectFailure(requestId,'VALIDATION')
        const window=BrowserWindow.fromWebContents(event.sender);if(!window)return projectFailure(requestId,'DENIED')
        const format=isSourceExportInput(input)?input.format:'attachment',suggested=isSourceAttachmentExportInput(input)?input.suggestedName:null
        const extension=format==='csl-json'?'json':format==='bibtex'?'bib':format==='ris'?'ris':suggested?.split('.').pop()||'bin'
        const answer=await dialog.showSaveDialog(window,{title:kind==='sourceExport'?'Export bibliography':'Save managed attachment copy',defaultPath:kind==='sourceExport'?`sources.${extension}`:suggested||`attachment.${extension}`,filters:[{name:kind==='sourceExport'?'Bibliography':'Original file',extensions:[extension]}],properties:['dontAddToRecent']})
        if (answer.canceled || !answer.filePath) return projectFailure(requestId,'CANCELLED')
        if (window.isDestroyed() || !isTrustedSender(event,owner(),devOrigin)) return projectFailure(requestId,'DENIED')
        const path=answer.filePath
        if (path.length>4096 || !path.toLowerCase().endsWith(`.${extension.toLowerCase()}`)) return projectFailure(requestId,'VALIDATION')
        if (kind==='sourceExport' && isSourceExportInput(input)) return storage.request(requestId,{kind,input:{...input,destinationPath:path}})
        if (kind==='sourceExportAttachment' && isSourceAttachmentExportInput(input)) return storage.request(requestId,{kind,input:{...input,destinationPath:path}})
        return projectFailure(requestId,'VALIDATION')
      }
      let command: ProjectCommand
      if ((kind === 'list' || kind === 'data' || kind === 'cleanup') && isInfoRequest(value)) command = { kind }
      else if (exact(value, ['requestId', 'input']) && kind === 'outline' && isOutlineInput(value.input)) command = { kind, input: value.input }
      else if (exact(value, ['requestId', 'input']) && kind === 'history' && isHistoryInput(value.input)) command = { kind, input: value.input }
      else if (exact(value, ['requestId', 'input']) && kind === 'notes' && isOpenInput(value.input)) command = { kind, input: value.input }
      else if (exact(value,['requestId','input']) && kind==='sources' && isOpenInput(value.input)) command={kind,input:value.input}
      else if (exact(value,['requestId','input']) && kind==='inspection' && isInspectionScope(value.input)) command={kind,input:value.input}
      else if (exact(value,['requestId','input']) && kind==='inspectionPage' && isInspectionPageInput(value.input)) command={kind,input:value.input}
      else if (exact(value,['requestId','input']) && kind==='inspectionAsset' && isInspectionAssetInput(value.input)) command={kind,input:value.input}
      else if (exact(value,['requestId','input']) && kind==='inspectionChange' && isInspectionChangeInput(value.input)) command={kind,input:value.input}
      else if (exact(value,['requestId','input']) && kind==='evidence' && isOpenInput(value.input)) command={kind,input:value.input}
      else if (exact(value,['requestId','input']) && kind==='evidenceChange' && isEvidenceChangeInput(value.input)) command={kind,input:value.input}
      else if (exact(value,['requestId','input']) && kind==='sourceChange' && isSourceChangeInput(value.input)) command={kind,input:value.input}
      else if (exact(value,['requestId','input']) && kind==='sourcePreview' && isSourcePreviewInput(value.input)) {
        const input=value.input,g=sourceGrants.get(input.token)
        if (!g || g.kind!=='import' || !event.senderFrame || g.owner!==event.sender.id || g.frame!==event.senderFrame.routingId || g.process!==event.senderFrame.processId || g.expires<Date.now() || g.scope.projectId!==input.projectId || g.scope.workspaceId!==input.workspaceId) return projectFailure(requestId,'DENIED')
        const format:BibliographyFormat=/\.json$/i.test(g.name)?'csl-json':/\.ris$/i.test(g.name)?'ris':'bibtex'
        command={kind,input:{...input,sourcePath:g.path,format}}
      }
      else if (exact(value,['requestId','input']) && kind==='sourceImport' && isSourceImportInput(value.input)) {
        const input=value.input,g=sourceGrants.get(input.token)
        if (!g || g.kind!=='import' || !event.senderFrame || g.owner!==event.sender.id || g.frame!==event.senderFrame.routingId || g.process!==event.senderFrame.processId || g.expires<Date.now() || g.scope.projectId!==input.projectId || g.scope.workspaceId!==input.workspaceId) return projectFailure(requestId,'DENIED')
        const format:BibliographyFormat=/\.json$/i.test(g.name)?'csl-json':/\.ris$/i.test(g.name)?'ris':'bibtex'
        command={kind,input:{...input,sourcePath:g.path,format}}
      }
      else if (exact(value,['requestId','input']) && kind==='sourceAttach' && isSourceAttachmentInput(value.input)) {
        const input=value.input,g=sourceGrants.get(input.token)
        if (!g || g.kind!=='attachment' || !event.senderFrame || g.owner!==event.sender.id || g.frame!==event.senderFrame.routingId || g.process!==event.senderFrame.processId || g.expires<Date.now() || g.scope.projectId!==input.projectId || g.scope.workspaceId!==input.workspaceId) return projectFailure(requestId,'DENIED')
        command={kind,input:{...input,sourcePath:g.path,originalName:g.name}}
      }
      else if (exact(value, ['requestId', 'input']) && kind === 'noteChange' && isNoteChangeInput(value.input)) command = { kind, input: value.input }
      else if (exact(value, ['requestId', 'input']) && kind === 'create' && isCreateInput(value.input)) command = { kind, input: value.input }
      else if (exact(value, ['requestId', 'input']) && kind === 'open' && isOpenInput(value.input)) command = { kind, input: value.input }
      else if (exact(value, ['requestId', 'input']) && kind === 'section' && isSectionInput(value.input)) command = { kind, input: value.input }
      else if (exact(value, ['requestId', 'input']) && kind === 'meta' && isSectionMetaInput(value.input)) command = { kind, input: value.input }
      else if (exact(value, ['requestId', 'input']) && kind === 'commit' && isCommitInput(value.input)) command = { kind, input: value.input }
      else if (exact(value, ['requestId','input']) && kind === 'readImage' && isImageReadInput(value.input)) command = { kind, input: value.input }
      else if (exact(value, ['requestId','input']) && kind === 'importImage' && isImageImportInput(value.input)) {
        const input = value.input, grant = imageGrants.get(input.token)
        if (!grant || !event.senderFrame || grant.owner !== event.sender.id || grant.frame !== event.senderFrame.routingId || grant.process !== event.senderFrame.processId || grant.expires < Date.now() || grant.scope.projectId !== input.projectId || grant.scope.workspaceId !== input.workspaceId || grant.operationId !== null && grant.operationId !== input.operationId) return projectFailure(requestId, 'DENIED')
        grant.operationId = input.operationId
        command = { kind, input: { projectId: input.projectId, workspaceId: input.workspaceId, operationId: input.operationId, sourcePath: grant.path, originalName: grant.name } }
      }
      else if (exact(value, ['requestId','input']) && kind === 'rename' && isRenameInput(value.input)) command = { kind, input: value.input }
      else if (exact(value, ['requestId','input']) && kind === 'archive' && isArchiveInput(value.input)) command = { kind, input: value.input }
      else if (exact(value, ['requestId','input']) && kind === 'recoverReset' && isId(value.input)) command = { kind, input: value.input }
      else if (exact(value, ['requestId','input']) && kind === 'reset' && isResetInput(value.input)) {
        const window = BrowserWindow.fromWebContents(event.sender)
        if (!window || hasUnprotectedChanges || resetting) return projectFailure(requestId, 'DENIED')
        resetting = true
        try {
          const answer = await dialog.showMessageBox(window, { type: 'warning', title: 'Reset local work?', message: 'Remove the reviewed projects from the active list?', detail: 'Use Save or Backup for anything you need outside this computer before continuing. All reviewed local work will be retained in Reset recovery, with no automatic expiry. Chosen project and backup files will not be removed. Deleting app data or using an uninstaller that removes it can still destroy local recovery.', buttons: ['Cancel','Reset and retain recovery'], defaultId: 0, cancelId: 0, noLink: true })
          if (answer.response !== 1) return projectFailure(requestId, 'CANCELLED')
          if (hasUnprotectedChanges || !isTrustedSender(event, owner(), devOrigin)) return projectFailure(requestId, 'DENIED')
          return await storage.request(requestId, { kind, input: value.input })
        } finally { resetting = false }
      }
      else return projectFailure(requestId, 'VALIDATION')
      const result = await storage.request(requestId, command)
      if(kind==='inspectionAsset'){
        if(!result.ok||!isProjectValue('inspectionAsset',result.value)||!sourceAssets)return result.ok?projectFailure(requestId,'UNAVAILABLE'):result
        try{return {ok:true,requestId,value:await sourceAssets.issue(result.value as WorkerInspectionAsset)}}catch{return projectFailure(requestId,'DENIED')}
      }
      if((kind==='open'||kind==='create')&&result.ok)sourceAssets?.revoke()
      if (kind === 'importImage' && result.ok && isImageImportInput(value.input)) imageGrants.delete(value.input.token)
      if ((kind==='sourceImport' || kind==='sourceAttach') && result.ok && record(value.input) && typeof value.input.token==='string') sourceGrants.delete(value.input.token)
      return result
    })
  }
}
