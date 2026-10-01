import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, open } from 'node:fs/promises'
import type { DestinationFingerprint } from '../../shared/exports'
import { ProjectError } from './errors'

export async function exportFingerprint(path:string):Promise<DestinationFingerprint|null>{
  try{
    const s=await lstat(path)
    if(!s.isFile() || s.isSymbolicLink() || s.nlink!==1)throw new ProjectError('UNSAFE_DESTINATION')
    if(s.size>512*1024*1024)throw new ProjectError('LIMIT_EXCEEDED')
    const handle=await open(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0))
    try{
      const opened=await handle.stat()
      if(opened.dev!==s.dev||opened.ino!==s.ino||opened.size!==s.size||opened.mtimeMs!==s.mtimeMs)throw new ProjectError('EXTERNAL_CHANGE')
      const hash=createHash('sha256')
      for await(const chunk of handle.createReadStream({autoClose:false}))hash.update(chunk)
      const after=await handle.stat()
      if(after.dev!==opened.dev||after.ino!==opened.ino||after.size!==opened.size||after.mtimeMs!==opened.mtimeMs)throw new ProjectError('EXTERNAL_CHANGE')
      return {dev:s.dev,ino:s.ino,size:s.size,mtimeMs:s.mtimeMs,sha256:hash.digest('hex')}
    }finally{await handle.close()}
  }catch(error){if(error&&typeof error==='object'&&'code'in error&&error.code==='ENOENT')return null;throw error}
}
