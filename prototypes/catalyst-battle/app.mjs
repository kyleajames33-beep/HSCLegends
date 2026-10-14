import { QUESTIONS, initialState, reduceBattle } from './model.mjs';

const el = (id) => document.getElementById(id);
let state = initialState();
let busy = false;
let poseTimer;
let generation = 0;
let playerPose = 'idle';
let bossPose = 'idle';
const assets = {
  player: { idle: 'assets/fighter/idle.png', attack: 'assets/fighter/attack.png', hurt: 'assets/fighter/hurt.png', special: 'assets/fighter/special.png' },
  boss: { idle: 'assets/boss/idle.png', attack: 'assets/boss/attack.png', hurt: 'assets/boss/hurt.png', defeat: 'assets/boss/defeat.png' },
};
for (const src of [...Object.values(assets.player), ...Object.values(assets.boss)]) { const img = new Image(); img.src = src; }

function render() {
  el('player-hp').textContent = `${state.playerHp} / 100`;
  el('boss-hp').textContent = `${state.bossHp} / 100`;
  el('player-bar').style.width = `${state.playerHp}%`;
  el('boss-bar').style.width = `${state.bossHp}%`;
  el('energy-count').textContent = `${state.energy} / 5`;
  el('energy-orbs').replaceChildren(...Array.from({ length: 5 }, (_, i) => { const orb = document.createElement('span'); orb.className = `orb${i < state.energy ? ' charged' : ''}`; orb.setAttribute('aria-hidden', 'true'); return orb; }));
  el('energy-orbs').setAttribute('aria-label', `${state.energy} of 5 energy`);
  el('player-art').src = assets.player[playerPose];
  el('boss-art').src = assets.boss[bossPose];
  el('shield').hidden = !state.shield;
  const ended = state.status !== 'playing';
  el('hit').disabled = busy || ended || state.energy < 1;
  el('special').disabled = busy || ended || state.energy < 3;
  el('block').disabled = busy || ended || state.energy < 1 || state.shield;
  el('combo').textContent = state.combo >= 3 ? `${state.combo} COMBO · STRIKE +50%` : state.combo > 0 ? `${state.combo} COMBO` : 'CHEMISTRY';
  const q = QUESTIONS[state.question % QUESTIONS.length];
  el('question').textContent = q.prompt;
  el('answers').replaceChildren(...q.options.map((option, i) => {
    const button = document.createElement('button'); button.className = 'answer';
    const label = document.createElement('span'); label.className = 'answer-letter'; label.textContent = 'ABCD'[i];
    const text = document.createElement('span'); text.textContent = option;
    button.append(label, text); button.disabled = busy || ended || state.answer !== null;
    if (state.answer !== null && i === q.correct) button.classList.add('correct');
    if (state.answer === i && i !== q.correct) button.classList.add('wrong');
    button.addEventListener('click', () => act({ type: 'answer', choice: i })); return button;
  }));
  el('feedback').hidden = state.answer === null;
  el('feedback').textContent = state.answer === null ? '' : `${state.answer === q.correct ? 'Correct. ' : 'Correct answer: ' + q.options[q.correct] + '. '}${q.why}`;
  el('feedback').classList.toggle('incorrect', state.answer !== null && state.answer !== q.correct);
  el('next').hidden = state.answer === null || ended;
  el('next').disabled = busy;
  el('event').textContent = state.event;
  el('battle-caption').textContent = state.status === 'won' ? 'Reactor stabilised. The lab is yours.' : state.shield ? 'Shield active · next incoming hit will be absorbed.' : state.energy >= 3 ? 'Reactor burst is ready. Make it count.' : 'Correct answers charge your moves. Wrong answers cost HP.';
  el('outcome').hidden = !ended || busy;
  if (ended) {
    el('outcome-label').textContent = state.status === 'won' ? 'BOSS DEFEATED' : 'REACTOR OVERLOAD';
    el('outcome-title').textContent = state.status === 'won' ? 'Legendary work.' : 'Recharge. Try again.';
    el('outcome-copy').textContent = state.status === 'won' ? 'Spark has taken back The Catalyst’s Lab.' : 'Use Shield to protect your HP and keep reading the explanations.';
  }
}

function act(action) {
  if (action.type !== 'reset' && busy) return;
  const previous = state;
  state = reduceBattle(state, action);
  if (action.type === 'reset') {
    generation += 1; clearTimeout(poseTimer); busy = false; playerPose = bossPose = 'idle';
    el('player-stage').classList.remove('strike', 'recoil'); el('boss-stage').classList.remove('strike', 'recoil'); el('arena').classList.remove('flash'); el('damage').textContent = ''; render(); return;
  }
  if (state === previous) return;
  let animate = false;
  if (action.type === 'hit' || action.type === 'special') {
    playerPose = action.type === 'special' ? 'special' : 'attack'; bossPose = state.bossHp === 0 ? 'defeat' : 'hurt';
    el('player-stage').classList.add('strike'); el('boss-stage').classList.add('recoil'); el('arena').classList.add('flash'); el('damage').textContent = `−${previous.bossHp - state.bossHp}`; animate = true;
  } else if (action.type === 'answer' && previous.playerHp !== state.playerHp) {
    bossPose = 'attack'; playerPose = 'hurt'; el('boss-stage').classList.add('strike'); el('player-stage').classList.add('recoil'); animate = true;
  }
  if (animate) {
    busy = true; const owner = generation;
    poseTimer = setTimeout(() => {
      if (owner !== generation) return;
      busy = false; playerPose = 'idle'; bossPose = state.bossHp === 0 ? 'defeat' : 'idle';
      el('player-stage').classList.remove('strike', 'recoil'); el('boss-stage').classList.remove('strike', 'recoil'); el('arena').classList.remove('flash'); el('damage').textContent = ''; render();
    }, state.bossHp === 0 ? 1300 : 650);
  }
  render();
}
for (const type of ['hit', 'special', 'block', 'next']) el(type).addEventListener('click', () => act({ type }));
for (const id of ['reset', 'again']) el(id).addEventListener('click', () => act({ type: 'reset' }));
render();
