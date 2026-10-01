import { constants } from 'node:fs'
import { open, realpath } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import { isAbsolute, relative } from 'node:path'
import type { WebContents } from 'electron'
import { PDF_INSPECTION_LIMIT, type InspectionAsset, type WorkerInspectionAsset } from '../shared/inspection'

type Grant = WorkerInspectionAsset & { expires:number; owner:number }

/** Opaque, expiring access to one already owned managed blob. No renderer path or generic file route. */
export class SourceAssets {
  private grants=new Map<string,Grant>()
  constructor(private readonly root:()=>string|null,private readonly owner:()=>WebContents|undefined,private readonly devOrigin?:string){}
  revoke():void{this.grants.clear()}
  async issue(asset:WorkerInspectionAsset):Promise<InspectionAsset>{
    const user=this.owner(),base=this.root()
    if(!user||user.isDestroyed()||!base||asset.bytes<1||asset.bytes>PDF_INSPECTION_LIMIT||!['application/pdf','text/plain'].includes(asset.mediaType)||!/^[a-f0-9]{64}$/.test(asset.sha256))throw new Error('DENIED')
    const resolvedBase=await realpath(base),resolved=await realpath(asset.path),rel=relative(resolvedBase,resolved)
    if(!/^workspaces\/[a-f0-9-]{36}\/[a-f0-9-]{36}\/blobs\/[a-f0-9]{64}$/.test(rel.replaceAll('\\','/'))||isAbsolute(rel)||!resolved.endsWith(asset.sha256))throw new Error('DENIED')
    this.revoke()
    const token=randomUUID();this.grants.set(token,{...asset,path:resolved,owner:user.id,expires:Date.now()+10*60_000})
    return {url:`collie-source://asset/${token}`,bytes:asset.bytes,mediaType:asset.mediaType,sha256:asset.sha256}
  }
  handle=async(request:Request):Promise<Response>=>{
    const token=/^collie-source:\/\/asset\/([a-f0-9-]{36})$/.exec(request.url)?.[1],grant=token?this.grants.get(token):undefined
    const user=this.owner()
    if(request.method!=='GET'||!grant||!user||user.isDestroyed()||grant.owner!==user.id||grant.expires<Date.now())return new Response(null,{status:404})
    const file=await open(grant.path,constants.O_RDONLY|(constants.O_NOFOLLOW??0)).catch(()=>null)
    if(!file)return new Response(null,{status:404})
    try{
      const before=await file.stat()
      if(!before.isFile()||before.nlink!==1||before.size!==grant.bytes||before.size>PDF_INSPECTION_LIMIT)return new Response(null,{status:404})
      const bytes=await file.readFile(),after=await file.stat()
      if(bytes.length!==grant.bytes||after.size!==before.size||after.mtimeMs!==before.mtimeMs||createHash('sha256').update(bytes).digest('hex')!==grant.sha256)return new Response(null,{status:404})
      return new Response(bytes,{headers:{'Content-Type':grant.mediaType,'Content-Security-Policy':"default-src 'none'",'Access-Control-Allow-Origin':this.devOrigin??'collie://app','X-Content-Type-Options':'nosniff','Cache-Control':'no-store'}})
    }catch{return new Response(null,{status:404})}finally{await file.close()}
  }
}
