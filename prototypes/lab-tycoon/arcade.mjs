import { QUESTIONS } from './src/content.mjs';

const app = document.querySelector('#app');
const esc = v => String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icons = {
  beaker:'<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M18 5h12M20 5v14L9 39a3 3 0 003 4h24a3 3 0 003-4L28 19V5M14 33h20M19 28h1m8-4h1" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  robot:'<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><rect x="8" y="14" width="32" height="27" rx="7" stroke="currentColor" stroke-width="3"/><path d="M24 14V7m-6 19h.1M30 26h.1M18 34h12M5 24h3m32 0h3" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>',
  reactor:'<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><circle cx="24" cy="24" r="4" fill="currentColor"/><ellipse cx="24" cy="24" rx="20" ry="8" stroke="currentColor" stroke-width="2.5"/><ellipse cx="24" cy="24" rx="20" ry="8" transform="rotate(60 24 24)" stroke="currentColor" stroke-width="2.5"/><ellipse cx="24" cy="24" rx="20" ry="8" transform="rotate(-60 24 24)" stroke="currentColor" stroke-width="2.5"/></svg>',
};
const upgrades = [
  { id:'beaker', icon:icons.beaker, name:'Income Lab', cost:30 },
  { id:'robot', icon:icons.robot, name:'Attack Bot', cost:45 },
  { id:'reactor', icon:icons.reactor, name:'Time Reactor', cost:60 },
];
let state;
let soundOn = false;
let audioContext;
function sound(kind) {
  if (!soundOn) return;
  try {
    const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Audio) return;
    audioContext ||= new Audio();
    if (audioContext.state === 'suspended') void audioContext.resume().catch(() => {});
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const now = audioContext.currentTime;
    const frequencies = { correct: 660, wrong: 180, buy: 520, blast: 260, win: 880 };
    oscillator.type = kind === 'blast' ? 'sawtooth' : 'sine';
    oscillator.frequency.setValueAtTime(frequencies[kind] || 520, now);
    if (kind === 'blast') oscillator.frequency.exponentialRampToValueAtTime(90, now + .2);
    gain.gain.setValueAtTime(.0001, now);
    gain.gain.exponentialRampToValueAtTime(.08, now + .01);
    gain.gain.exponentialRampToValueAtTime(.0001, now + .22);
    oscillator.connect(gain); gain.connect(audioContext.destination);
    oscillator.start(now); oscillator.stop(now + .23);
  } catch { /* Audio is optional; gameplay continues if the device blocks it. */ }
}
let revision = 0;
const BEST_KEY = 'hsclegends.lab-rush.best.v1';
function readBest() {
  try {
    const value = Number(globalThis.localStorage?.getItem(BEST_KEY) || 0);
    return Number.isSafeInteger(value) && value >= 0 ? value : 0;
  } catch { return 0; }
}
function finishRun() {
  if (state.phase === 'done') return;
  state.phase = 'done'; state.startedAt = null;
  state.newBest = state.earned > state.personalBest;
  if (state.newBest) {
    state.personalBest = state.earned;
    try { globalThis.localStorage?.setItem(BEST_KEY, String(state.personalBest)); } catch { /* A run still works without storage. */ }
  }
  sound(state.bossHp === 0 ? 'win' : 'wrong');
}
function reset(loadout='blast') { const seconds=loadout==='time'?105:90; state = { phase:'intro', loadout, time:seconds, cash:0, earned:0, correct:0, streak:0, best:0, index:0, owned:[], result:null, startedAt:null, remaining:seconds*1000, bossHp:100, energy:0, overclock:false, personalBest:readBest(), newBest:false, missed:[] }; render(); }
function syncClock() {
  if (state.phase !== 'playing' || state.startedAt === null) return;
  state.remaining = Math.max(0, state.remaining - (Date.now() - state.startedAt));
  state.startedAt = Date.now();
  state.time = Math.ceil(state.remaining / 1000);
}
function multiplier() { return 10 + (state.owned.includes('beaker')?8:0); }
function attackPower() { return 10 + (state.owned.includes('robot')?5:0); }
function exposed() { return state.bossHp>0 && state.bossHp<=50; }
function blastDamage() { return (state.loadout==='blast'?30:20) + (exposed()?10:0); }
function upgradeDescription(u, owned) {
  if (u.id==='beaker') return owned?'ACTIVE · +$8 per correct':`+$${multiplier()} → +$${multiplier()+8} per correct`;
  if (u.id==='robot') return owned?'ACTIVE · +5 damage per correct':`${attackPower()} → ${attackPower()+5} damage per correct`;
  return owned?'ACTIVE · 15 seconds added':`${clockLabel()} → ${formatTime(state.time+15)} · adds 15 seconds now`;
}
function formatTime(seconds) { return `${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`; }
function startClock() { state.startedAt = Date.now(); }
function pauseClock() { syncClock(); state.startedAt = null; }
function clockLabel() { return formatTime(state.time); }
function render() {
  const focusedAction = document.activeElement?.dataset?.action;
  const focusedId = document.activeElement?.dataset?.id;
  const owner = ++revision;
  const q=QUESTIONS[state.index % QUESTIONS.length];
  app.innerHTML = `<div class="shell"><header class="top"><div class="brand"><span class="mark">✦</span><span>HSC <b>LEGENDS</b><small>ARCADE PREVIEW</small></span></div><nav class="top-links"><a class="text-button" href="/">← Games</a><button class="text-button" data-action="sound" aria-pressed="${soundOn}">${soundOn?'Sound on':'Sound off'}</button><button class="text-button" data-action="reset">↻ New run</button></nav></header>
  <main><div class="title-row"><div><div class="eyebrow">⚡ SOLO MODE <span> / </span> CHEMISTRY</div><h1>LAB <em>RUSH</em></h1><p class="subtitle">Answer. Upgrade. Build your lab.</p></div><div class="level">LEVEL <strong>${1+state.owned.length}</strong></div></div>
  <div class="stats"><div><span>TIME LEFT</span><strong id="clock" class="${state.time<=15?'urgent':''}">${clockLabel()}</strong></div><div><span>LAB CASH</span><strong class="gold">$${state.cash}</strong></div><div><span>STREAK</span><strong>${state.streak}<small> ${state.streak>=3?'ON FIRE!':''}</small></strong></div><div><span>✓ CORRECT</span><strong>${state.correct}</strong></div></div>
  <div class="mobile-boss" aria-hidden="true"><span>⚔ REACTOR GOLEM <b>${state.bossHp} / 100 HP</b></span><div class="boss-track"><div style="width:${state.bossHp}%"></div></div></div><div class="layout"><section class="arena"><div class="scene"><div class="scene-label">YOUR LAB <span>LVL ${1+state.owned.length}</span></div><div class="scene-grid"></div><div class="boss ${state.phase==='feedback' && state.result?.correct?'hit':''}"><img src="./boss-rush.webp" alt=""/><span>⚔ REACTOR GOLEM</span></div><div class="lab-items"><div class="lab-machine ${state.owned.includes('beaker')?'on':''}"><span>${icons.beaker}</span><i>${state.owned.includes('beaker')?'ACTIVE':'LOCKED'}</i></div><div class="lab-machine ${state.owned.includes('robot')?'on':''}"><span>${icons.robot}</span><i>${state.owned.includes('robot')?'ACTIVE':'LOCKED'}</i></div><div class="lab-machine ${state.owned.includes('reactor')?'on':''}"><span>${icons.reactor}</span><i>${state.owned.includes('reactor')?'ACTIVE':'LOCKED'}</i></div></div><div class="scene-floor"></div></div><div class="boss-bar"><span>REACTOR GOLEM <b>${state.bossHp} / 100 HP</b></span><div class="boss-track"><div style="width:${state.bossHp}%"></div></div>${exposed()?'<div class="boss-phase">⚡ CORE EXPOSED · blasts +10 damage</div>':''}<div class="energy-label">⚡ BLAST CHARGE <b>${state.energy} / 3</b></div><div class="energy-dots">${[0,1,2].map(i=>`<i class="${i<state.energy?'charged':''}"></i>`).join('')}</div></div><div class="lab-footer"><span>⚡ EARN PER ANSWER</span><b>+$${multiplier()}</b><span class="lab-progress">${state.owned.length}/3 UPGRADES</span></div></section>
  <section class="play-panel" aria-live="polite">${panel(q)}</section></div>
  <p class="prototype-note">Offline concept · sample Year 12 Chemistry questions · personal best stays on this device when storage is available</p></main></div>`;
  app.querySelectorAll('[data-action]').forEach(button => button.addEventListener('click',()=>{ if (owner === revision) act(button.dataset.action,button.dataset.id); }));
  if (focusedAction) app.querySelector?.(focusedAction === 'sound' ? '[data-action=\"sound\"]' : focusedAction === 'loadout' && ['blast','time'].includes(focusedId) ? `[data-action="loadout"][data-id="${focusedId}"]` : '.play-panel h2')?.focus();
}
function panel(q) {
  if(state.phase==='intro') return `<div class="panel-kicker">READY, SCIENTIST?</div><h2 tabindex="-1">Build a bigger lab.</h2><p class="lead">Answer to damage the boss and earn cash. Charge a blast, buy upgrades and risk cash with Overclock.</p><div class="how"><span>① ANSWER</span><span>② EARN</span><span>③ UPGRADE</span></div><fieldset class="loadouts"><legend>CHOOSE YOUR LOADOUT</legend><button class="loadout ${state.loadout==='blast'?'selected':''}" data-action="loadout" data-id="blast" aria-pressed="${state.loadout==='blast'}"><b>⚔ Blast Kit</b><span>90 seconds · blast deals 30 damage</span></button><button class="loadout ${state.loadout==='time'?'selected':''}" data-action="loadout" data-id="time" aria-pressed="${state.loadout==='time'}"><b>◷ Time Kit</b><span>105 seconds · blast deals 20 damage</span></button></fieldset><button class="primary" data-action="start">START RUN <span>→</span></button><p class="muted">The clock pauses for feedback and upgrades.${state.personalBest?` Your best: $${state.personalBest}.`:''}</p>`;
  if(state.phase==='playing') return `<div class="question-top"><span>QUESTION ${(state.index % QUESTIONS.length)+1} <b>/ ${QUESTIONS.length}</b></span><span class="reward">+$${multiplier()*(state.overclock?2:1)} FOR CORRECT</span></div><div class="topic">${esc(q.topic)}</div><h2 tabindex="-1" class="question">${esc(q.stem)}</h2><div class="equation">${esc(q.equation)}</div><div class="answers">${q.answers.map((a,i)=>`<button class="answer" data-action="answer" data-id="${i}"><span>${String.fromCharCode(65+i)}</span>${esc(a)}</button>`).join('')}</div>${exposed()?'<p class="phase-notice">⚡ CORE EXPOSED: blasts deal +10 damage. Spend charge on a blast or extra time.</p>':''}<button class="overclock ${state.overclock?'active':''}" data-action="overclock" ${state.overclock||state.cash<20?'disabled':''}>${state.overclock?'⚡ OVERCLOCK ARMED · NEXT ANSWER':'⚡ OVERCLOCK · RISK $20'}</button><p class="power-hint">Correct: get your $20 back, double cash and +10 damage. Miss: lose the $20.</p><div class="power-actions"><button class="blast" data-action="blast" ${state.energy<3?'disabled':''}>⚡ ${state.energy>=3?`FIRE BLAST · ${blastDamage()} DAMAGE`:`BLAST CHARGE ${state.energy}/3`}</button><button class="extend" data-action="extend" ${state.energy<3?'disabled':''}>+10s TIME</button></div><button class="shop-link" data-action="shop">⚡ OPEN UPGRADE SHOP <span>→</span></button><button class="end-run" data-action="finish">End run</button>`;
  if(state.phase==='feedback') { const r=state.result; return `<div class="result-icon ${r.correct?'success':'miss'}">${r.correct?'✓':'✕'}</div><div class="panel-kicker">${r.correct?'NICE WORK':'KEEP GOING'}</div><h2 tabindex="-1">${r.correct?`+$${r.award} earned!`:'Not quite!'}</h2><p class="feedback-answer">${r.correct?`⚔ ${r.damage} damage to the Reactor Golem!${r.overclock?' Overclock paid off! $20 stake returned.':''}${r.exposedNow?' The core is exposed: blasts deal +10 damage!':''}`:`Answer: ${esc(q.answers[q.answer])}${r.overclock?' · Overclock lost':''}`}</p><details><summary>Why is that the answer?</summary><p>${esc(q.explanation)}</p></details><div class="actions"><button class="primary" data-action="next">${state.bossHp===0?'CLAIM VICTORY ★':'NEXT QUESTION →'}</button><button class="secondary" data-action="shop">⚡ SHOP UPGRADES</button></div><p class="muted">⏸ Timer paused</p>`; }
  if(state.phase==='shop') return `<div class="panel-kicker">⏸ TIMER PAUSED</div><h2 tabindex="-1">Upgrade your lab</h2><p class="lead">Your cash: <b class="gold">$${state.cash}</b></p><div class="shop">${upgrades.map(u=>{const owned=state.owned.includes(u.id);return `<div class="upgrade"><span class="upgrade-icon">${u.icon}</span><div><b>${u.name}</b><small>${upgradeDescription(u,owned)}</small></div><button data-action="buy" data-id="${u.id}" ${owned||state.cash<u.cost?'disabled':''}>${owned?'OWNED':`$${u.cost}`}</button></div>`}).join('')}</div><button class="primary" data-action="resume">BACK TO GAME →</button>`;
  return `<div class="result-icon success">★</div><div class="panel-kicker">RUN COMPLETE</div><h2 tabindex="-1">${state.bossHp===0?'Golem defeated!':'Run complete!'}</h2><div class="final-stats"><div><strong>$${state.earned}</strong><span>TOTAL EARNED</span></div><div><strong>${state.correct}</strong><span>CORRECT</span></div><div><strong>${state.best}</strong><span>BEST STREAK</span></div></div><p class="lead">${state.newBest?'★ New personal best!':`Personal best: $${state.personalBest}.`}</p><div class="run-summary"><p><b>KIT</b> ${state.loadout==='blast'?'Blast Kit':'Time Kit'} · <b>BOSS DAMAGE</b> ${100-state.bossHp}/100</p><p><b>UPGRADES</b> ${state.owned.length?state.owned.map(id=>upgrades.find(u=>u.id===id).name).join(' · '):'None purchased'}</p><p><b>HIGHLIGHT</b> ${state.bossHp===0?'Reactor Golem defeated!':state.correct?`${state.correct} correct ${state.correct===1?'answer':'answers'} landed.`:'Run completed without a correct answer.'}</p></div>${state.missed.length?`<details class="review"><summary>Review ${state.missed.length} missed ${state.missed.length===1?'question':'questions'}</summary>${state.missed.map(item=>`<div class="review-item"><b>${esc(item.stem)}</b><p>Answer: ${esc(item.answer)}</p><p>${esc(item.explanation)}</p></div>`).join('')}</details>`:''}<div class="actions"><button class="primary" data-action="replay">PLAY AGAIN WITH ${state.loadout==='blast'?'BLAST':'TIME'} KIT ↻</button><button class="secondary" data-action="reset">CHANGE KIT</button></div>`;
}
function act(action,id) {
  if(action==='sound') {soundOn=!soundOn;if(soundOn)sound('buy');render();return;}
  if(action==='reset') {reset();return;}
  if(action==='replay' && state.phase==='done') {const kit=state.loadout;reset(kit);state.phase='playing';startClock();render();return;}
  if(action==='loadout' && state.phase==='intro' && (id==='blast'||id==='time')) {state.loadout=id;state.time=id==='time'?105:90;state.remaining=state.time*1000;}
  else if(action==='start' && state.phase==='intro') {state.phase='playing';startClock();}
  else if(action==='answer' && state.phase==='playing') {pauseClock(); if(state.remaining<=0){finishRun();render();return;} const q=QUESTIONS[state.index % QUESTIONS.length]; const correct=Number(id)===q.answer;sound(correct?'correct':'wrong'); const overclock=state.overclock;state.overclock=false;const award=correct?multiplier()*(overclock?2:1):0; state.cash+=award+(correct&&overclock?20:0);state.earned+=award;state.correct+=Number(correct);if(correct)state.energy=Math.min(3,state.energy+1);const damage=correct?attackPower()+(overclock?10:0):0;const previouslyExposed=exposed();state.bossHp=Math.max(0,state.bossHp-damage);const exposedNow=!previouslyExposed&&exposed();state.streak=correct?state.streak+1:0;state.best=Math.max(state.best,state.streak);if(!correct)state.missed.push({stem:q.stem,answer:q.answers[q.answer],explanation:q.explanation});state.result={correct,award,damage,overclock,exposedNow};state.phase='feedback';}
  else if(action==='overclock' && state.phase==='playing' && !state.overclock && state.cash>=20) {syncClock();if(state.remaining<=0){finishRun();}else{state.cash-=20;state.overclock=true;sound('buy');}}
  else if(action==='blast' && state.phase==='playing' && state.energy>=3) {syncClock();if(state.remaining<=0){finishRun();}else{sound('blast');state.energy=0;state.bossHp=Math.max(0,state.bossHp-blastDamage());if(state.bossHp===0){finishRun();}}}
  else if(action==='extend' && state.phase==='playing' && state.energy>=3) {syncClock();if(state.remaining<=0){finishRun();}else{sound('buy');state.energy=0;state.remaining+=10000;state.time=Math.ceil(state.remaining/1000);}}
  else if(action==='finish' && state.phase==='playing') {pauseClock();finishRun();}
  else if(action==='next' && state.phase==='feedback') {if(state.bossHp===0){finishRun();}else{state.index++;state.phase='playing';startClock();}}
  else if(action==='shop' && ['playing','feedback'].includes(state.phase)) {if(state.phase==='playing')pauseClock();if(state.remaining<=0){finishRun();}else{state.returnPhase=state.phase;state.phase='shop';}}
  else if(action==='resume' && state.phase==='shop') {state.phase=state.returnPhase;if(state.phase==='playing')startClock();}
  else if(action==='buy' && state.phase==='shop') {const u=upgrades.find(x=>x.id===id);if(u && !state.owned.includes(id) && state.cash>=u.cost){state.cash-=u.cost;state.owned.push(id);if(id==='reactor'){state.remaining+=15000;state.time=Math.ceil(state.remaining/1000);}sound('buy');}}
  render();
}
setInterval(()=>{if(state.phase!=='playing')return;syncClock();const clock=document.querySelector('#clock');if(clock){clock.textContent=clockLabel();clock.classList.toggle('urgent',state.time<=15);}if(state.remaining<=0){finishRun();render();}},200);
reset();
