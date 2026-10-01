import { app, ipcMain, type WebContents } from 'electron'
import { isInfoRequest } from '../shared/schemas'
import { SUPPORT_CHANNELS, isZoomLevel, type SupportPreview } from '../shared/support'
import { exact, isProjectCode, projectFailure, record, type ProjectCode } from '../shared/projects'
import type { StorageStatus } from '../shared/storage'
import { isTrustedSender } from './ipc'
import { isId } from '../domain/editor/schema'

export class SupportService {
  private readonly codes: ProjectCode[] = []
  constructor(private readonly owner:()=>WebContents|undefined,private readonly storage:()=>StorageStatus,private readonly devOrigin?:string){}
  recordError(code:string):void {
    if(!isProjectCode(code))return
    if(!this.codes.includes(code)){this.codes.push(code);if(this.codes.length>20)this.codes.shift()}
  }
  private preview():SupportPreview{
    const storage=this.storage(),arch=process.arch
    return {
      appVersion:app.getVersion(),electronVersion:process.versions.electron??'0.0.0',nodeVersion:process.versions.node,
      sqliteVersion:storage.state==='ready'?storage.runtime.sqliteVersion:null,
      platform:process.platform as SupportPreview['platform'],architecture:arch==='arm64'||arch==='x64'?arch:'other',
      storage:storage.state,uptimeSeconds:Math.max(0,Math.floor(process.uptime())),errorCodes:[...this.codes]
    }
  }
  register():void{
    ipcMain.handle(SUPPORT_CHANNELS.preview,(event,payload:unknown)=>{
      if(!isTrustedSender(event,this.owner(),this.devOrigin)||!isInfoRequest(payload))return projectFailure('','DENIED')
      return {ok:true,requestId:payload.requestId,value:this.preview()}
    })
    ipcMain.handle(SUPPORT_CHANNELS.zoom,(event,payload:unknown)=>{
      if(!isTrustedSender(event,this.owner(),this.devOrigin)||!record(payload)||!exact(payload,['requestId','input'])||!isId(payload.requestId)||!isZoomLevel(payload.input))return projectFailure('','DENIED')
      event.sender.setZoomFactor(payload.input/100)
      return {ok:true,requestId:payload.requestId,value:payload.input}
    })
  }
}
