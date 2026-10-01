import { useState } from 'react'

function go(id:string):void{
  const target=document.getElementById(id)
  if(!target)return
  target.closest('details')?.setAttribute('open','')
  target.focus();target.scrollIntoView({block:'start'})
}

export default function TutorialPanel({ready,active,disabled,start,reset}:{ready:boolean;active:boolean;disabled:boolean;start:()=>void;reset:()=>void}):React.JSX.Element{
  const [acknowledged,setAcknowledged]=useState(false)
  return <section className="tutorial-panel" aria-labelledby="tutorial-title" id="tutorial">
    <h2 id="tutorial-title" tabIndex={-1}>A first writing path</h2>
    <p>Work through a fictional reading-room story, or follow the same path in a personal project. Everything stays local. The sample is editable alongside your one free personal project.</p>
    <div className="project-actions">
      <button type="button" disabled={disabled} onClick={start}>{ready?'Open tutorial sample':'Create tutorial sample'}</button>
      {ready?<button type="button" disabled={disabled||!acknowledged} onClick={()=>{setAcknowledged(false);reset()}}>Create a fresh sample</button>:null}
    </div>
    {ready?<label><input type="checkbox" checked={acknowledged} onChange={event=>setAcknowledged(event.target.checked)}/> I understand a fresh sample keeps the previous sample as a separate local project, including my edits. I can Save or Back up the current sample first.</label>:null}
    <ol className="tutorial-steps">
      <li><strong>Choose a template and an idea.</strong> For personal work, select a template and Create project. The sample starts with an open question about an imaginary reading room. <button type="button" onClick={()=>go('new-project')}>Go to projects</button></li>
      <li><strong>Save deliberately.</strong> Edit a sentence, Protect locally, then choose Save. The first Save asks for a file location; canceling keeps the local recovery copy without assigning a destination. <button type="button" disabled={!active} onClick={()=>go('project-file')}>Go to Save</button></li>
      <li><strong>Inspect evidence.</strong> In the sample, open the fictional source, inspect its retained plain-text original, extract its text and select a short exact excerpt. It is an invented story, not a claim about a real town. <button type="button" disabled={!active} onClick={()=>go('sources-title')}>Go to sources</button></li>
      <li><strong>Connect and write.</strong> Create a research question or claim, link the excerpt as support or challenge, and revise the draft. An evidence link is your assessment, not a citation. <button type="button" disabled={!active} onClick={()=>go('evidence-title')}>Go to evidence</button></li>
      <li><strong>Cite and export.</strong> The sample draft has a citation to its fictional source. Inspect the citation preview, add or revise a citation in your writing, then export a copy. Export is separate from saving a project file. <button type="button" disabled={!active} onClick={()=>go('citations-heading')}>Go to citations</button> <button type="button" disabled={!active} onClick={()=>go('docx-export-heading')}>Go to exports</button></li>
      <li><strong>Choose free editing.</strong> Opening a personal project does not designate it. Use the Access panel to choose one personal project, and switch after protecting drafts. The sample has its own allowance. <button type="button" onClick={()=>go('access-title')}>Go to access</button></li>
    </ol>
  </section>
}
