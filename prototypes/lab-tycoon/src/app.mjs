import { QUESTIONS, UPGRADES, SCOPE } from './content.mjs';
import { CHECKPOINT_KEY, UNDO_KEY, MAX_EARNED, createState, rewards, economy, canRetry, canBuy, transition, readCheckpoint, saveCheckpoint, encodeCheckpoint, restoreProgress } from './model.mjs';
const app = document.getElementById('app');
const esc = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let storage;
try {storage=window.localStorage;} catch {storage=null;}
const loaded=readCheckpoint(storage);
let state=loaded.state || createState();
let undoState=readCheckpoint(storage,UNDO_KEY).state;
let notice=loaded.error || (loaded.state ? 'Your local checkpoint is restored.' : 'No account needed. Your checkpoint stays in this browser.');
let blockSaving=!!loaded.error;
let largeText=false;
let lastRaw=null;
try {lastRaw=storage.getItem(CHECKPOINT_KEY);} catch { /* Memory-only mode is already disclosed. */ }
const button=(label,type,extra='')=>`<button type="button" data-action="${type}" data-revision="${state.revision}" ${extra}>${label}</button>`;
const glyph=(kind)=>`<svg viewBox="0 0 120 100" aria-hidden="true" focusable="false"><path d="M15 84h92" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>${kind==='notebook'?'<rect x="34" y="19" width="52" height="62" rx="7" fill="#f4e2cb" stroke="currentColor" stroke-width="4"/><path d="M44 19v62M54 37h21M54 48h21M54 59h15" stroke="currentColor" stroke-width="3"/>':kind==='bath'?'<rect x="22" y="47" width="76" height="34" rx="7" fill="#cde0d1" stroke="currentColor" stroke-width="4"/><path d="M36 47V25h48v22M32 60h56M54 69h12" fill="none" stroke="currentColor" stroke-width="4"/>':kind==='sensor'?'<rect x="43" y="17" width="39" height="64" rx="10" fill="#f4e2cb" stroke="currentColor" stroke-width="4"/><rect x="51" y="30" width="23" height="19" rx="3" fill="#6d5b8a"/><path d="M51 64h23" stroke="currentColor" stroke-width="4"/>':'<rect x="20" y="24" width="80" height="49" rx="8" fill="#ddd3e8" stroke="currentColor" stroke-width="4"/><path d="M58 74v9M39 84h39M31 53l13-14 13 21 14-19 16 10" fill="none" stroke="currentColor" stroke-width="4"/>'}</svg>`;
function persist() {
  if(blockSaving) return;
  try {
    if(storage.getItem(CHECKPOINT_KEY)!==lastRaw) {blockSaving=true;notice='Another tab changed the local checkpoint. This tab is now memory-only. Reload to use the newer saved run, or reset explicitly.';return;}
  } catch {blockSaving=true;notice='Browser storage is unavailable. This run stays in memory only.';return;}
  const error=saveCheckpoint(storage,state);
  if(error) {notice=error;blockSaving=true;} else {lastRaw=encodeCheckpoint(state);notice='Checkpoint saved in this browser only.';}
}
function dispatch(action) {
  const next=transition(state,action);
  if(next===state) return;
  state=next;persist();render(true);
}
function render(focus=false) {
  const q=QUESTIONS[state.index], record=state.records[state.index], money=economy(state);
  const reviewed=state.records.filter(r=>r.reviewed).length;
  const stage=['learn','answer','feedback','shop'].indexOf(state.phase);
  app.innerHTML=`
    <div class="offline-banner">OFFLINE PROTOTYPE / SAMPLE CONTENT <span>Not a live classroom game</span></div>
    <header class="topbar"><div class="brand"><span class="brand-mark" aria-hidden="true">L<span>G</span></span><div>HSC LEGENDS<small>Lab Tycoon · concept study</small></div></div><div class="top-actions"><button id="text-size" type="button" aria-pressed="${largeText}">Aa <span>Larger text</span></button><button id="open-reset" type="button">Reset run</button></div></header>
    <main id="main"><section class="intro"><div><p class="eyebrow">CHEMISTRY / EQUILIBRIUM LAB</p><h1>Small discoveries.<br><span>A growing lab.</span></h1><p class="intro-copy">Think it through. Explain your choice.<br>Turn what you learn into a better-equipped bench.</p><p class="scope">${esc(SCOPE)}</p></div><div class="overview card"><span class="eyebrow">YOUR RESEARCH GRANT</span><strong class="balance">${money.available}<small>credits available</small></strong><p><b>${money.earned}</b> earned · <b>${money.spent}</b> invested</p><div class="progress-label"><label for="run-progress">Challenges reviewed</label><b>${reviewed} / ${QUESTIONS.length}</b></div><progress id="run-progress" max="${QUESTIONS.length}" value="${reviewed}">${reviewed} of ${QUESTIONS.length}</progress><span class="small">No timer. No speed bonus. One local run.</span></div></section>
    <div class="workspace"><section class="challenge card" aria-labelledby="challenge-title"><nav class="steps" aria-label="Challenge steps">${['Learn','Answer + reason','Explain','Upgrade'].map((s,i)=>`<span ${i===stage?'aria-current="step" class="current"':''}>${i+1}<span>${s}</span></span>`).join('')}</nav>${state.phase==='complete'?completeView():challengeView(q,record)}</section>
    <aside class="bench card" aria-labelledby="bench-title"><div class="section-heading"><div><p class="eyebrow">YOUR BENCH</p><h2 id="bench-title">Build with purpose</h2></div><span class="counter">${state.owned.length} / 4</span></div><p class="small">Choose equipment after reviewing a challenge. Upgrades add study cards and change your bench. They never multiply scores.</p><div class="equipment-grid">${UPGRADES.map(u=>`<div class="equipment ${state.owned.includes(u.id)?'owned':''}">${glyph(u.id)}<strong>${esc(u.name)}</strong><small>${state.owned.includes(u.id)?'Installed':`${u.cost} credits`}</small></div>`).join('')}</div>${state.owned.length?`<div class="study-cards">${UPGRADES.filter(u=>state.owned.includes(u.id)).map(u=>`<details><summary>${esc(u.name)} note</summary><p>${esc(u.note)}</p></details>`).join('')}</div>`:'<p class="bench-note">First goal: 6 credits for your field notebook.</p>'}<div class="no-network"><span aria-hidden="true">◉</span> Solo, offline, local only</div></aside></div>
    <section class="rules card"><details><summary>How credits work <span>Maximum ${MAX_EARNED} per run</span></summary><ul><li>First attempt: 4 for a correct answer + 4 for a correct reason.</li><li>One optional retry: 2 for each previously incorrect part you now correct. Already-earned parts never pay again.</li><li>After feedback: 2 for choosing “Finish review”, once per challenge. This rewards completion of the review step; it cannot measure whether you read it.</li><li>Maximum 10 per challenge. No timer, passive income, random rewards, streak multipliers or real-money value.</li><li>Equipment is optional and cosmetic/study support. All learning notes, feedback and text-size controls are free.</li></ul><p>Local practice credits are not marks, mastery ratings, HSC predictions or account XP.</p></details></section>
    <p class="storage-status" role="status">${esc(notice)}</p>${undoState?'<button class="undo" type="button" id="undo-reset">Undo last reset</button>':''}
    <footer><b>Sample content · selected Year 12 Chemistry Module 5 concepts.</b><p>12 original practice challenges. Not official NESA questions or full syllabus coverage. Conceptual chemistry only; no real experiment instructions. No names, student records, accounts, database, analytics or network calls.</p><p>Content and mechanics notes are included in README.md. Visual/browser acceptance is still unrun.</p></footer></main>
    <dialog id="reset-dialog" aria-labelledby="reset-title"><h2 id="reset-title">Start a new local run?</h2><p>This resets this prototype’s answers, credits and equipment in this browser. It does not affect HSC Legends accounts.</p><p>The previous run is kept for “Undo last reset”, in this tab and in browser storage when available. A second reset replaces that backup.</p><div class="button-row"><button type="button" id="cancel-reset">Keep this run</button><button type="button" id="confirm-reset" class="primary">Reset local run</button></div></dialog>`;
  wire();
  if(focus) document.getElementById('challenge-title')?.focus();
}
function heading(q) {return `<p class="eyebrow">CHALLENGE ${String(state.index+1).padStart(2,'0')} / 12 · ${esc(q.topic)}</p><h2 id="challenge-title" tabindex="-1">${esc(q.title)}</h2>`;}
function challengeView(q,r) {
  let html=heading(q);
  if(state.phase==='learn') return html+`<div class="learn-note"><span class="label">BEFORE YOU INVESTIGATE</span><p>${esc(q.learn)}</p></div><div class="equation">${esc(q.equation)}</div><p class="small">Read at your pace. The note stays available when you answer.</p>${button('Open the challenge <span aria-hidden="true">→</span>','START','class="primary"')}`;
  if(state.phase==='answer') return html+`<details class="hint"><summary>Learning note · always free</summary><p>${esc(q.learn)}</p></details><div class="equation">${esc(q.equation)}</div><h3>${esc(q.stem)}</h3>${r.attempts.length?'<p class="retry-banner">Retry · only newly corrected parts earn 2 credits each. Feedback is already available below the learning note.</p><details class="hint"><summary>Revisit the explanation</summary><p>'+esc(q.explanation)+'</p></details>':''}<form id="answer-form" data-revision="${state.revision}"><fieldset><legend>1. Choose your answer</legend>${q.answers.map((a,i)=>option('choice',a,i)).join('')}</fieldset><fieldset class="reason-field"><legend>2. Choose the best reason</legend>${q.reasons.map((a,i)=>option('reason',a,i)).join('')}</fieldset><p class="small" id="selection-help">Choose one answer and one reason before checking.</p><button class="primary" id="submit-answer" type="submit" disabled aria-describedby="selection-help">Check answer + reason</button></form>`;
  if(state.phase==='feedback') {
    const a=r.attempts.at(-1), earned=rewards(r,q), ac=a.choice===q.answer, rc=a.reason===q.reason;
    return html+`<div class="feedback-title"><span class="result-pill">${ac&&rc?'Both parts correct':ac||rc?'One part to rethink':'A chance to rethink'}</span><b>${earned.total} credits so far</b></div><div class="result-row"><span>${ac?'Correct answer':'Answer to revisit'}</span><p>Your choice: ${esc(q.answers[a.choice])}</p><strong>Key: ${esc(q.answers[q.answer])}</strong></div><div class="result-row"><span>${rc?'Correct reasoning':'Reason to revisit'}</span><p>Your reason: ${esc(q.reasons[a.reason])}</p><strong>Key: ${esc(q.reasons[q.reason])}</strong></div><div class="explanation"><span class="label">THE SCIENCE BEHIND IT</span><p>${esc(q.explanation)}</p></div><p class="receipt">Award so far: answer ${earned.answer} + reasoning ${earned.reasoning}. Finish review adds 2 once.</p><div class="button-row">${canRetry(state)?button('Try once more','RETRY'):''}${button('Finish review · +2 credits','REVIEW','class="primary"')}</div>`;
  }
  const earned=rewards(r,q);
  return html+`<div class="review-receipt"><span class="label">REVIEW COMPLETE</span><h3>+${earned.total} research credits</h3><p>Answer ${earned.answer} + reasoning ${earned.reasoning} + review ${earned.review}</p></div><h3>What will you add to your lab?</h3><p class="small">Spend now or save for a later challenge. Each item can be bought once.</p><div class="shop">${UPGRADES.map(u=>`<div class="shop-item"><div><b>${esc(u.name)}</b><p>${esc(u.description)}</p></div>${button(state.owned.includes(u.id)?'Installed':`Buy · ${u.cost}`, 'BUY',`data-id="${u.id}" ${canBuy(state,u.id)?'':'disabled'}`)}${!state.owned.includes(u.id)&&!canBuy(state,u.id)?`<small>Need ${u.cost-economy(state).available} more credits</small>`:''}</div>`).join('')}</div>${button(state.index===QUESTIONS.length-1?'Finish this run':'Next challenge <span aria-hidden="true">→</span>','NEXT','class="primary"')}`;
}
function option(name,label,i) {return `<label class="option"><input type="radio" name="${name}" value="${i}" required><span class="option-marker" aria-hidden="true">${String.fromCharCode(65+i)}</span><span>${esc(label)}</span></label>`;}
function completeView() {
  const money=economy(state);
  return `<p class="eyebrow">ALL 12 CHALLENGES REVIEWED</p><h2 id="challenge-title" tabindex="-1">Your lab, built on thinking.</h2><p class="complete-lede">You’ve worked through equilibrium, disturbances and constants. Keep the explanations handy and return to anything you want to practise.</p><div class="review-receipt"><h3>${money.earned} credits earned · ${state.owned.length} upgrades</h3><p>${money.available} unspent + ${money.spent} invested = ${money.earned} earned</p></div><p class="small">This is a local practice record, not an assessment or measure of mastery.</p><h3>Your review notebook</h3><div class="notebook">${QUESTIONS.map((q,i)=>{const r=state.records[i],rw=rewards(r,q);return `<details><summary>${i+1}. ${esc(q.title)} <span>${rw.total}/10</span></summary><p>${esc(q.stem)}</p><p><b>Answer:</b> ${esc(q.answers[q.answer])}</p><p><b>Reason:</b> ${esc(q.reasons[q.reason])}</p><p>${esc(q.explanation)}</p><p class="small">${r.attempts.length} attempt${r.attempts.length===1?'':'s'} · answer ${rw.answer} + reasoning ${rw.reasoning} + review ${rw.review}</p></details>`;}).join('')}</div>`;
}
function wire() {
  const revision=state.revision;
  const currentControl=(id,element)=>state.revision===revision && !!element && document.getElementById(id)===element;
  app.querySelectorAll('[data-action]').forEach(el=>el.addEventListener('click',()=>{
    if(state.revision!==revision || !app.contains(el)) return;
    dispatch({type:el.dataset.action,expectedRevision:revision,id:el.dataset.id});
  }));
  const form=document.getElementById('answer-form');
  const submit=document.getElementById('submit-answer');
  // A render owns its own selections. Detached forms can never write into a
  // later question's inputs, even when their event callbacks are retained.
  const selections={choice:null,reason:null};
  const currentForm=()=>state.phase==='answer' && currentControl('answer-form',form) && currentControl('submit-answer',submit);
  form?.addEventListener('change',event=>{
    if(!currentForm()) return;
    if(event.target.name==='choice'||event.target.name==='reason') selections[event.target.name]=Number(event.target.value);
    submit.disabled=selections.choice===null||selections.reason===null;
  });
  form?.addEventListener('submit',event=>{
    event.preventDefault();
    if(!currentForm() || selections.choice===null || selections.reason===null) return;
    dispatch({type:'SUBMIT',expectedRevision:revision,...selections});
  });
  const textSize=document.getElementById('text-size');
  textSize.addEventListener('click',()=>{
    if(!currentControl('text-size',textSize)) return;
    largeText=!largeText;document.documentElement.classList.toggle('large-text',largeText);textSize.setAttribute('aria-pressed',String(largeText));
  });
  const dialog=document.getElementById('reset-dialog');
  const openReset=document.getElementById('open-reset');
  const cancelReset=document.getElementById('cancel-reset');
  const confirmReset=document.getElementById('confirm-reset');
  openReset.addEventListener('click',()=>{
    if(!currentControl('open-reset',openReset)) return;
    dialog.showModal();cancelReset.focus();
  });
  cancelReset.addEventListener('click',()=>{
    if(currentControl('cancel-reset',cancelReset)) dialog.close();
  });
  confirmReset.addEventListener('click',()=>{
    if(!currentControl('confirm-reset',confirmReset) || !dialog.open) return;
    const next=transition(state,{type:'RESET',expectedRevision:revision});
    if(next===state) {notice='The local revision limit has been reached. This run was not reset.';render(true);return;}
    undoState=state;const backupError=saveCheckpoint(storage,undoState,UNDO_KEY);
    state=next;
    blockSaving=false;try {lastRaw=storage.getItem(CHECKPOINT_KEY);} catch {blockSaving=true;}
    persist();notice=blockSaving ? 'Run reset in memory only. The new run could not be saved. Undo is available in this tab.' : backupError ? 'Run reset and saved. Undo is available in this tab only because the backup could not be saved.' : 'Run reset. Undo last reset is available below.';render(true);
  });
  const undoControl=document.getElementById('undo-reset');
  const backup=undoState;
  undoControl?.addEventListener('click',()=>{
    if(!currentControl('undo-reset',undoControl) || !backup || undoState!==backup) return;
    const restored=restoreProgress(state,backup);
    if(restored===state) {notice='The saved backup could not be restored safely. This run is unchanged.';render(true);return;}
    state=restored;undoState=null;persist();
    // Retain a valid backup rather than deleting any storage. This control hides
    // for this tab; a reload may offer the same recovery again, without awards.
    notice=blockSaving ? 'Previous run restored in memory only; it could not be saved. No extra credits were awarded.' : 'Previous run restored. No extra credits were awarded.';render(true);
  });
}
window.addEventListener('storage',event=>{
  if(event.key===CHECKPOINT_KEY&&event.newValue!==lastRaw) {blockSaving=true;notice='Another tab changed the checkpoint. This tab is now memory-only. Reload to load the saved run.';const el=app.querySelector('.storage-status');if(el)el.textContent=notice;}
});
render();
