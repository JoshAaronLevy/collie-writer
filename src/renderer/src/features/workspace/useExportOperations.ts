import { useEffect, useState } from 'react'
import type { ExportJob } from '../../../../shared/exports'
import type { OpenInput } from '../../../../shared/projects'

export type ExportOperation = { scope: OpenInput; job: ExportJob; issue: string | null }

/** The session owns polling and results even after the export screen or project is left. */
export function useExportOperations() {
  const [exports, setExports] = useState<ExportOperation[]>([])
  function trackExport(scope: OpenInput, job: ExportJob): void {
    setExports(previous => [...previous.filter(item => item.job.id !== job.id), {scope, job, issue:null}])
  }
  const running = exports.filter(item => ['rendering', 'publishing'].includes(item.job.state))
  const runningKey = running.map(item => item.job.id).join('|')
  useEffect(() => {
    if (!running.length) return
    let stopped = false
    let timer: ReturnType<typeof setTimeout>
    async function poll(): Promise<void> {
      await Promise.all(running.map(async operation => {
        try {
          const result = await window.collie.docxStatus({...operation.scope, jobId:operation.job.id})
          if (stopped) return
          setExports(previous => previous.map(item => item.job.id === operation.job.id
            ? result.ok ? {...item,job:result.value,issue:null} : {...item,issue:result.error.message} : item))
        } catch {
          if (!stopped) setExports(previous => previous.map(item => item.job.id === operation.job.id
            ? {...item,issue:'Export progress is temporarily unavailable. The operation has not been cancelled.'} : item))
        }
      }))
      if (!stopped) timer = setTimeout(() => { void poll() }, 800)
    }
    timer = setTimeout(() => { void poll() }, 800)
    return () => { stopped = true; clearTimeout(timer) }
  }, [runningKey])
  return { exports, trackExport }
}
