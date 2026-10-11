import type { AiReason } from './ai'
import type { AnalysisRun } from './import-analysis'

/** Safe product copy only: never expose raw provider output or credential-bearing errors. */
export function importFailureReason(reason: AiReason | null): string {
  switch (reason) {
    case 'output-limit':
      return 'An analysis response exceeded a supported output limit. Import responses are limited to 32,000 characters; incomplete output was not used.'
    case 'quota-exhausted':
      return 'ChatGPT reported a usage or request limit. This saved reason does not identify the allowance or reset time. Your findings are kept.'
    case 'offline':
      return 'ChatGPT could not be reached. Check your internet connection before continuing.'
    case 'signed-out':
    case 'session-expired':
    case 'auth-failed':
    case 'consent-required':
      return 'Your ChatGPT connection needs to be restored. Use Manage ChatGPT to reconnect.'
    case 'model-unavailable':
      return 'ChatGPT could not use the selected model. Choose an available model before continuing.'
    case 'invalid-request':
      return 'ChatGPT rejected an analysis request. Check the selected model and account status before starting a new import.'
    case 'cancelled':
      return 'Analysis was stopped. Completed results are retained.'
    case 'outcome-unknown':
      return 'The last analysis request has an unconfirmed outcome. Use Check status, then Finish recovery if offered; the request will not be resent automatically.'
    case 'storage-unavailable':
    case 'secure-storage-unavailable':
      return 'The analysis response could not be protected locally. Keep this window open and use the recovery action below.'
    case 'context-changed':
      return 'Collie could not confirm that the analysis request still matches its approval. Check status before continuing.'
    case 'busy':
      return 'Other AI or local recovery work is still pending. Finish that work before continuing.'
    case 'read-only-project':
      return 'This project is read-only. Make it editable before continuing the import.'
    case 'provider-failed':
      return 'ChatGPT could not complete an analysis request. Check account status before continuing.'
    default:
      return reason
        ? `ChatGPT could not start analysis (${reason}). Use Manage ChatGPT to check availability.`
        : 'Analysis did not complete. Check status before continuing.'
  }
}

export function importAnalysisProblem(
  attempt: Pick<AnalysisRun, 'state' | 'validation' | 'reason'>
): string {
  if (attempt.state === 'not-sent' && attempt.reason === 'context-changed')
    return 'Collie could not authorize this request, so it was not sent to ChatGPT. Check status to settle recovery. Earlier selections can then use the new importer with their retained files.'
  if (attempt.validation === 'invalid')
    return 'ChatGPT replied, but its response did not match the required import format or original-file references. That response was not used. You do not need to review individual messages.'
  return importFailureReason(attempt.reason)
}
