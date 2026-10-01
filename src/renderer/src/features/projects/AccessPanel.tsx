import type { AccessView } from '../../../../shared/access'
import { canEditProject, sameProject } from '../../../../shared/access'
import type { OpenProject, ProjectList } from '../../../../shared/projects'
import DirectAccessPanel from './DirectAccessPanel'

const stateLabels:Record<AccessView['state'],string>={free:'Untimed free access',subscription:'Subscription access',grace:'Subscription offline grace',lifetime:'Lifetime nonfiction access',expired:'Subscription period and offline grace ended',revoked:'Signed access revocation received',unavailable:'Paid access could not be confirmed'}
export default function AccessPanel({access,project,list,disabled,designate,finish,importGrant}:{access:AccessView|null;project:OpenProject|null;list:ProjectList;disabled:boolean;designate:()=>void;finish:()=>void;importGrant:()=>void}):React.JSX.Element{
  const designated=list.projects.find(p=>sameProject(p,access?.freeProject??null))
  return <section aria-labelledby="access-title">
    <h2 id="access-title" tabIndex={-1}>Access and editable project</h2>
    {!access?<p role="status">Reading local access settings…</p>:<>
      <p role="status">{stateLabels[access.state]}. {access.paid?'All your projects are editable.':'Choose one personal project to edit at a time; switch whenever you want after protecting pending input.'}</p>
      <p>Reading, source inspection, history, individual DOCX/PDF/Markdown/text exports, bibliography outputs, backups and recovery remain available for every project. Free access never expires. No ads, watermarks or automatic conversion.</p>
      <p>Free editable project: {designated?.title??(access.freeProject?'A retained project not in this list':'None selected')}.</p>
      {project?<><p>{canEditProject(access,project)?'This project is editable.':'This project is open for reading and export.'}</p><button type="button" disabled={disabled||sameProject(project,access.freeProject)||sameProject(project,access.sampleProject)} onClick={designate}>Use this project for free editing</button></>:null}
      {access.transition?<div role="alert"><p>Access changed while this project was editable. Pending drafts remain visible. Protect them before finishing the change, or select this project for free editing. If a draft cannot be committed, keep it open for copying and retry.</p><button type="button" disabled={disabled} onClick={finish}>Protect pending drafts and finish access change</button></div>:null}
      {access.paidThrough?<p>Paid through {new Date(access.paidThrough).toLocaleString()}. Signed offline grace ends {new Date(access.graceUntil!).toLocaleString()}.</p>:null}
      {access.state==='grace'?<p>No renewal has been confirmed locally. Offline grace is not a refund or proof of cancellation.</p>:null}
      {access.clockWarning?<p role="alert">The computer clock moved backward. Subscription access uses the latest observed time; reading, export, backup and free designation remain available. Correct the clock or restore a current signed access document.</p>:null}
      {access.storageWarning?<p role="alert">Local access metadata could not be fully read or saved. Existing files were retained; no project was removed. Contact support if designation or signed restore remains unavailable.</p>:null}
      <details><summary>Edition and offline access</summary>
        <p>Paid nonfiction access adds unlimited editable projects, creating/editing named recipes, and multi-format batches. Existing recipes can still be loaded and exported one format at a time in free mode.</p>
        <p>United States base prices: $9.99/month or $199 lifetime, USD. Both cover the same nonfiction capabilities. Lifetime includes all future updates to the purchased edition, across app versions. The purchase controls below show availability; any applicable taxes and total appear before payment.</p>
        <p>A verified lifetime document works offline indefinitely unless a later signed revocation is received. Subscription documents specify paid-through and up to 14 days of offline grace. An offline device cannot learn of a refund until it receives an authentic update.</p>
        {access.issuerConfigured?<button type="button" disabled={disabled} onClick={importGrant}>Import signed access document…</button>:<p>No issuer verification keys are configured in this build. Paid activation and restore await issuer configuration; free writing remains available.</p>}
      </details>
      <DirectAccessPanel />
    </>}
  </section>
}
