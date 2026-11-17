'use client';

// Reactor Clash practice: you + bots on a top-down map. Questions are energy.
// Rendering is plain Canvas 2D; rules live in lib/clash/sim.ts.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  addPlayer, answerResult, beginAnswer, cancelAnswer, createClash, step, terminalLocked, terminalNear,
  BASES, BOSS_HP, MATCH_SECONDS, MAX_ENERGY, PLAYER_R, REACTOR_R, TILE, WALLS, WORLD_H, WORLD_W,
  type ClashEvent, type ClashState, type Input, type Team,
} from '@/lib/clash/sim';
import { botInputs, type BotBrain } from '@/lib/clash/bots';
import { SAMPLE_SET } from '@/lib/live-game';
import { QUESTIONS as EQUILIBRIUM } from '@/prototypes/lab-tycoon/src/content.mjs';
import { useSound } from '@/lib/live-sound';
import s from './clash.module.css';

type Q = { stem: string; options: string[]; answer: number; explanation?: string };
const BANK: Q[] = [
  ...SAMPLE_SET.map(q => ({ stem: q.stem, options: q.options, answer: q.correct_index })),
  ...EQUILIBRIUM.map((q: { stem: string; answers: string[]; answer: number; explanation?: string }) => ({ stem: q.stem, options: q.answers, answer: q.answer, explanation: q.explanation })),
];
const ME = 'me';
const TEAM_COLOR: Record<Team, string> = { blue: '#2f7bea', orange: '#ff6a2b' };
const VIEW_TILES_W = 22; // how much of the map is visible across the screen

type Hud = { t: number; score: Record<Team, number>; energy: number; streak: number; alive: boolean; respawnIn: number; near: 'ready' | 'locked' | null; lockIn: number; bossHp: number | null };
type Feed = { id: number; text: string; tone: Team | 'info' };
type Fx = { x: number; y: number; r: number; life: number; color: string };

function shuffle<T>(a: T[]): T[] { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; }
const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.max(0, Math.floor(sec % 60))).padStart(2, '0')}`;

export default function ClashGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const game = useRef<ClashState | null>(null);
  const brain = useRef<BotBrain>({});
  const keys = useRef(new Set<string>());
  const mouse = useRef({ x: 0, y: 0, down: false, has: false });
  const fx = useRef<Fx[]>([]);
  const bag = useRef<Q[]>([]);
  const images = useRef<Record<string, HTMLImageElement>>({});
  const [phase, setPhase] = useState<'intro' | 'play' | 'end'>('intro');
  const [hud, setHud] = useState<Hud | null>(null);
  const [question, setQuestion] = useState<{ q: Q; picked: number | null } | null>(null);
  const [feed, setFeed] = useState<Feed[]>([]);
  const [result, setResult] = useState<{ winner: Team | null; score: Record<Team, number>; me: ClashState['players'][string]['stats'] } | null>(null);
  const sound = useSound('clash', true);
  const questionRef = useRef(question);
  useEffect(() => { questionRef.current = question; }, [question]);

  // Preload sprites (bosses / emblems are decorative; shapes are used until art loads).
  useEffect(() => {
    for (const [k, src] of Object.entries({ boss: '/art/bosses/chemistry-boss-idle.webp', bossHurt: '/art/bosses/chemistry-boss-hurt.webp', minion: '/art/icons/subject-chemistry.webp', orb: '/art/icons/spark.webp' })) {
      const img = new Image(); img.src = src; images.current[k] = img;
    }
  }, []);

  const pushFeed = useCallback((text: string, tone: Feed['tone']) => {
    const id = Date.now() + Math.random();
    setFeed(f => [{ id, text, tone }, ...f].slice(0, 5));
    setTimeout(() => setFeed(f => f.filter(x => x.id !== id)), 4000);
  }, []);

  const start = useCallback(() => {
    const g = createClash(Math.floor(Math.random() * 1e9));
    addPlayer(g, ME, 'You', 'blue');
    ['Nova', 'Ash', 'Kai'].forEach((n, i) => addPlayer(g, `b${i}`, n, 'blue', true));
    ['Rex', 'Vee', 'Jun', 'Ola'].forEach((n, i) => addPlayer(g, `o${i}`, n, 'orange', true));
    game.current = g; brain.current = {}; fx.current = []; bag.current = shuffle(BANK);
    // Development-only hook so browser tests can read the match state.
    if (process.env.NODE_ENV !== 'production') (window as unknown as { __clash?: ClashState }).__clash = g;
    setQuestion(null); setFeed([]); setResult(null); setPhase('play');
    sound.cue('start');
  }, [sound]);

  const openQuestion = useCallback(() => {
    const g = game.current, me = g?.players[ME];
    if (!g || !me || questionRef.current) return;
    const term = terminalNear(g, me);
    if (!term || !beginAnswer(g, ME, term.id)) return;
    if (!bag.current.length) bag.current = shuffle(BANK);
    setQuestion({ q: bag.current.pop()!, picked: null });
    sound.cue('lock');
  }, [sound]);

  const answer = useCallback((i: number) => {
    const g = game.current, cur = questionRef.current;
    if (!g || !cur || cur.picked !== null) return;
    const correct = i === cur.q.answer;
    setQuestion({ ...cur, picked: i });
    sound.cue(correct ? 'correct' : 'wrong');
    setTimeout(() => {
      const events: ClashEvent[] = [];
      answerResult(g, ME, correct, events);
      const gained = events.find(e => e.type === 'answer');
      if (gained && gained.type === 'answer' && gained.correct) {
        const me = g.players[ME];
        fx.current.push({ x: me.x, y: me.y, r: 10, life: 1, color: '#f2b530' });
      }
      setQuestion(null);
    }, correct ? 650 : 1500);
  }, [sound]);

  // Keyboard + mouse
  useEffect(() => {
    if (phase !== 'play') return;
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (questionRef.current) {
        const n = Number(e.key);
        if (n >= 1 && n <= 6) { e.preventDefault(); answer(n - 1); }
        if (k === 'escape' && questionRef.current.picked === null && game.current) { cancelAnswer(game.current, ME); setQuestion(null); }
        return;
      }
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'shift'].includes(k)) e.preventDefault();
      if (k === 'e') openQuestion();
      keys.current.add(k);
    };
    const up = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase());
    const blur = () => keys.current.clear();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur); };
  }, [phase, answer, openQuestion]);

  // Main loop
  useEffect(() => {
    if (phase !== 'play') return;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    let raf = 0, last = performance.now(), hudAt = 0;
    const cam = { x: 0, y: 0, scale: 1 };

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = canvas.clientWidth * dpr; canvas.height = canvas.clientHeight * dpr;
    };
    resize();
    window.addEventListener('resize', resize);
    const toWorld = (ev: MouseEvent) => {
      const rect = canvas.getBoundingClientRect(), dpr = canvas.width / rect.width;
      return { x: ((ev.clientX - rect.left) * dpr - canvas.width / 2) / cam.scale + cam.x, y: ((ev.clientY - rect.top) * dpr - canvas.height / 2) / cam.scale + cam.y };
    };
    const move = (ev: MouseEvent) => { const w = toWorld(ev); mouse.current.x = w.x; mouse.current.y = w.y; mouse.current.has = true; };
    const md = (ev: MouseEvent) => { if (ev.button === 0) { move(ev); mouse.current.down = true; } };
    const mu = () => { mouse.current.down = false; };
    canvas.addEventListener('mousemove', move);
    canvas.addEventListener('mousedown', md);
    window.addEventListener('mouseup', mu);

    const frame = (now: number) => {
      const g = game.current!;
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const me = g.players[ME];
      const k = keys.current;
      const mx = (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0);
      const my = (k.has('s') || k.has('arrowdown') ? 1 : 0) - (k.has('w') || k.has('arrowup') ? 1 : 0);
      const aim = mouse.current.has ? Math.atan2(mouse.current.y - me.y, mouse.current.x - me.x) : (mx || my ? Math.atan2(my, mx) : me.aim);
      const mine: Input = { mx, my, aim, fire: (mouse.current.down || k.has(' ')) && !questionRef.current, sprint: k.has('shift') };
      const events: ClashEvent[] = [];
      const inputs = { ...botInputs(g, brain.current, events), [ME]: mine };
      events.push(...step(g, dt, inputs));

      for (const e of events) {
        if (e.type === 'tag') {
          const v = g.players[e.victim], by = g.players[e.by];
          fx.current.push({ x: v.x, y: v.y, r: 8, life: 1, color: TEAM_COLOR[by?.team ?? 'blue'] });
          if (e.by === ME) { pushFeed(`You tagged ${v.name}`, 'blue'); sound.cue('correct'); }
          else if (e.victim === ME) { pushFeed(`${by?.name ?? 'Someone'} tagged you`, 'orange'); sound.cue('wrong'); setQuestion(null); }
        } else if (e.type === 'capture') { pushFeed(`${e.team === 'blue' ? 'Your team' : 'Orange'} captured the ${e.reactor} reactor`, e.team); sound.cue(e.team === 'blue' ? 'start' : 'reveal'); }
        else if (e.type === 'boss-spawn') { pushFeed('Reactor Prime has arrived! Most damage wins +60', 'info'); sound.cue('fanfare'); }
        else if (e.type === 'boss-down') pushFeed(e.team ? `${e.team === 'blue' ? 'Your team' : 'Orange'} wins the boss bonus` : 'Boss bonus tied', e.team ?? 'info');
        else if (e.type === 'pickup' && e.player === ME) sound.cue('join');
        else if (e.type === 'boss-pulse') fx.current.push({ x: g.boss?.x ?? 0, y: g.boss?.y ?? 0, r: 20, life: 1, color: '#ff6a2b' });
        else if (e.type === 'end') {
          setResult({ winner: e.winner, score: { ...g.score }, me: { ...g.players[ME].stats } });
          setPhase('end');
          sound.cue(e.winner === 'blue' ? 'fanfare' : 'reveal');
        }
      }

      // Camera follows you, clamped to the map.
      cam.scale = canvas.width / (VIEW_TILES_W * TILE);
      const halfW = canvas.width / 2 / cam.scale, halfH = canvas.height / 2 / cam.scale;
      cam.x = Math.max(halfW, Math.min(WORLD_W - halfW, me.x));
      cam.y = Math.max(halfH, Math.min(WORLD_H - halfH, me.y));
      if (halfW * 2 > WORLD_W) cam.x = WORLD_W / 2;
      if (halfH * 2 > WORLD_H) cam.y = WORLD_H / 2;
      draw(ctx, canvas, g, cam, fx.current, images.current, dt, now);

      if (now - hudAt > 100) {
        hudAt = now;
        const term = me.alive ? terminalNear(g, me) : null;
        setHud({
          t: g.t, score: { ...g.score }, energy: me.energy, streak: me.streak, alive: me.alive,
          respawnIn: Math.max(0, me.respawnAt - g.t),
          near: term && !me.answering ? (terminalLocked(g, me, term.id) ? 'locked' : 'ready') : null,
          lockIn: term ? Math.max(0, (me.locks[term.id] ?? 0) - g.t) : 0,
          bossHp: g.boss ? g.boss.hp : null,
        });
      }
      if (!g.ended) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('mousemove', move);
      canvas.removeEventListener('mousedown', md);
      window.removeEventListener('mouseup', mu);
    };
  }, [phase, pushFeed, sound]);

  if (phase === 'intro') {
    return (
      <div className={s.stage}>
        <div className={s.panel}>
          <p className={s.kicker}>Practice · You + 3 bots vs 4 bots</p>
          <h1 className={s.title}>Reactor Clash</h1>
          <p className={s.lead}>Capture and hold reactors. Tag the other team. Everything costs <b>energy</b>, and the only way to get energy is answering questions at terminals.</p>
          <div className={s.controls}>
            <div><kbd>W A S D</kbd> move</div>
            <div><kbd>Mouse</kbd> aim · <kbd>Click</kbd> / <kbd>Space</kbd> fire (8 energy)</div>
            <div><kbd>Shift</kbd> sprint (uses energy)</div>
            <div><kbd>E</kbd> at a terminal: answer for +25 energy (streaks give more)</div>
            <div><kbd>1</kbd>–<kbd>4</kbd> pick an answer</div>
          </div>
          <ul className={s.rules}>
            <li>Stand on a reactor to capture it. Each one you hold scores 1 point a second.</li>
            <li>Tagging an enemy scores 2 and sends them back to base.</li>
            <li>Minions drain reactors. Shoot them for energy orbs.</li>
            <li>With a minute left, Reactor Prime arrives. The team that deals the most damage gets +60.</li>
            <li>Wrong answer? That terminal locks for 6 seconds. While you answer, you can&apos;t move.</li>
          </ul>
          <button className={s.btn} onClick={start}>Start match</button>
        </div>
      </div>
    );
  }

  return (
    <div className={s.stage}>
      <canvas ref={canvasRef} className={s.canvas} />
      {hud && (
        <>
          <div className={s.top}>
            <span className={`${s.team} ${s.blue}`}>Your team {Math.floor(hud.score.blue)}</span>
            <span className={s.clock}>{mmss(MATCH_SECONDS - hud.t)}</span>
            <span className={`${s.team} ${s.orange}`}>{Math.floor(hud.score.orange)} Orange</span>
          </div>
          {hud.bossHp !== null && (
            <div className={s.bossBar}><span>Reactor Prime</span><span className={s.track}><span style={{ width: `${(hud.bossHp / BOSS_HP) * 100}%` }} /></span></div>
          )}
          <div className={s.bottom}>
            <div className={s.energy}>
              <span className={s.energyLabel}>Energy</span>
              <span className={s.track}><span className={hud.energy < 16 ? s.low : ''} style={{ width: `${(hud.energy / MAX_ENERGY) * 100}%` }} /></span>
              <b>{Math.floor(hud.energy)}</b>
              {hud.streak >= 2 && <span className={s.streak}>Streak {hud.streak}</span>}
            </div>
            {!hud.alive && <p className={s.prompt}>Tagged! Back in {hud.respawnIn.toFixed(1)}s</p>}
            {hud.alive && hud.near === 'ready' && !question && <p className={`${s.prompt} ${s.promptGo}`}>Press <kbd>E</kbd> to answer for energy</p>}
            {hud.alive && hud.near === 'locked' && <p className={s.prompt}>Terminal locked for you · {hud.lockIn.toFixed(1)}s</p>}
            {hud.alive && hud.energy < 8 && !hud.near && <p className={s.prompt}>Out of energy. Find a terminal</p>}
          </div>
          <ul className={s.feed}>{feed.map(f => <li key={f.id} className={f.tone === 'info' ? s.feedInfo : f.tone === 'blue' ? s.feedBlue : s.feedOrange}>{f.text}</li>)}</ul>
          <button className={s.sound} onClick={sound.toggle}>{sound.on ? 'Sound on' : 'Sound off'}</button>
        </>
      )}

      {question && (
        <div className={s.qWrap}>
          <div className={s.qCard} role="dialog" aria-label="Answer for energy">
            <p className={s.qKicker}>Answer for energy · you&apos;re frozen until you answer (Esc to leave)</p>
            <p className={s.qStem}>{question.q.stem}</p>
            <div className={s.tiles}>
              {question.q.options.map((o, i) => {
                const state = question.picked === null ? '' : i === question.q.answer ? s.right : i === question.picked ? s.wrong : s.faded;
                return <button key={i} className={`${s.tile} ${state}`} disabled={question.picked !== null} onClick={() => answer(i)}><kbd>{i + 1}</kbd>{o}</button>;
              })}
            </div>
            {question.picked !== null && question.picked !== question.q.answer && question.q.explanation && <p className={s.explain}>{question.q.explanation}</p>}
          </div>
        </div>
      )}

      {phase === 'end' && result && (
        <div className={s.qWrap}>
          <div className={s.panel}>
            <p className={s.kicker}>Match over</p>
            <h1 className={s.title}>{result.winner === 'blue' ? 'Victory' : result.winner === 'orange' ? 'Defeat' : 'Draw'}</h1>
            <p className={s.lead}>Your team {Math.floor(result.score.blue)} · Orange {Math.floor(result.score.orange)}</p>
            <div className={s.statGrid}>
              <div><b>{result.me.correct}/{result.me.answered}</b>questions right</div>
              <div><b>{result.me.tags}</b>tags</div>
              <div><b>{result.me.captures}</b>captures</div>
              <div><b>{result.me.bossDamage}</b>boss hits</div>
            </div>
            <button className={s.btn} onClick={start}>Play again</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Rendering ----------------------------------------------------------------
function draw(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, g: ClashState, cam: { x: number; y: number; scale: number },
  effects: Fx[], img: Record<string, HTMLImageElement>, dt: number, now: number) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#07080f';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(cam.scale, 0, 0, cam.scale, canvas.width / 2 - cam.x * cam.scale, canvas.height / 2 - cam.y * cam.scale);

  // Floor + grid
  ctx.fillStyle = '#12142b';
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);
  ctx.strokeStyle = 'rgba(154,156,192,.07)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x <= WORLD_W; x += TILE) { ctx.moveTo(x, 0); ctx.lineTo(x, WORLD_H); }
  for (let y = 0; y <= WORLD_H; y += TILE) { ctx.moveTo(0, y); ctx.lineTo(WORLD_W, y); }
  ctx.stroke();

  // Bases
  for (const team of ['blue', 'orange'] as Team[]) {
    const b = BASES[team];
    ctx.fillStyle = team === 'blue' ? 'rgba(47,123,234,.16)' : 'rgba(255,106,43,.16)';
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = TEAM_COLOR[team];
    ctx.setLineDash([8, 8]); ctx.strokeRect(b.x, b.y, b.w, b.h); ctx.setLineDash([]);
  }

  // Walls
  for (const w of WALLS) {
    ctx.fillStyle = '#22264a';
    ctx.fillRect(w.x, w.y, w.w, w.h);
    ctx.fillStyle = '#2e3366';
    ctx.fillRect(w.x, w.y, w.w, Math.min(8, w.h));
    ctx.strokeStyle = '#07080f'; ctx.lineWidth = 2; ctx.strokeRect(w.x, w.y, w.w, w.h);
  }

  // Reactors
  for (const r of g.reactors) {
    const owner = r.owner ? TEAM_COLOR[r.owner] : '#9a9cc0';
    ctx.fillStyle = r.owner ? (r.owner === 'blue' ? 'rgba(47,123,234,.18)' : 'rgba(255,106,43,.18)') : 'rgba(154,156,192,.08)';
    ctx.beginPath(); ctx.arc(r.x, r.y, REACTOR_R, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(154,156,192,.35)'; ctx.lineWidth = 2; ctx.stroke();
    if (r.control !== 0) {
      ctx.strokeStyle = r.control < 0 ? TEAM_COLOR.blue : TEAM_COLOR.orange;
      ctx.lineWidth = 6;
      ctx.beginPath(); ctx.arc(r.x, r.y, REACTOR_R - 4, -Math.PI / 2, -Math.PI / 2 + Math.abs(r.control) * Math.PI * 2); ctx.stroke();
    }
    const pulse = 0.6 + 0.4 * Math.sin(now / 300);
    ctx.fillStyle = owner;
    ctx.globalAlpha = r.owner ? pulse : 0.7;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) { const a = Math.PI / 3 * i; ctx.lineTo(r.x + Math.cos(a) * 20, r.y + Math.sin(a) * 20); }
    ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#07080f'; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = '#f2f2fa'; ctx.font = '700 12px system-ui'; ctx.textAlign = 'center';
    ctx.fillText(r.id.toUpperCase(), r.x, r.y + REACTOR_R + 16);
  }

  // Terminals
  const me = g.players[ME];
  for (const term of g.terminals) {
    const locked = me && terminalLocked(g, me, term.id);
    const near = me && !locked && Math.hypot(me.x - term.x, me.y - term.y) < 56;
    ctx.fillStyle = locked ? '#3a3d5c' : '#6e5bff';
    ctx.shadowColor = locked ? 'transparent' : '#6e5bff';
    ctx.shadowBlur = near ? 26 : 12;
    ctx.beginPath(); ctx.roundRect(term.x - 17, term.y - 17, 34, 34, 7); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#07080f'; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = '900 18px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(locked ? '×' : '?', term.x, term.y + 1);
    ctx.textBaseline = 'alphabetic';
  }

  // Orbs
  for (const o of g.orbs) {
    const bob = Math.sin(now / 200 + o.id) * 3;
    if (img.orb?.complete) ctx.drawImage(img.orb, o.x - 12, o.y - 12 + bob, 24, 24);
    else { ctx.fillStyle = '#f2b530'; ctx.beginPath(); ctx.arc(o.x, o.y + bob, 8, 0, Math.PI * 2); ctx.fill(); }
  }

  // Minions
  for (const m of g.minions) {
    if (img.minion?.complete) ctx.drawImage(img.minion, m.x - 18, m.y - 18, 36, 36);
    else { ctx.fillStyle = '#ff6a2b'; ctx.beginPath(); ctx.arc(m.x, m.y, 14, 0, Math.PI * 2); ctx.fill(); }
    if (m.hp < 2) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(m.x, m.y, 20, 0, Math.PI * 2); ctx.stroke(); }
  }

  // Boss
  if (g.boss) {
    const b = g.boss, hurt = b.hp < BOSS_HP / 2;
    const pic = hurt ? img.bossHurt : img.boss;
    ctx.save();
    ctx.shadowColor = '#ff6a2b'; ctx.shadowBlur = 30;
    if (pic?.complete) ctx.drawImage(pic, b.x - 70, b.y - 80, 140, 140);
    else { ctx.fillStyle = '#ff6a2b'; ctx.beginPath(); ctx.arc(b.x, b.y, 44, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
    const left = Math.max(0, (b.pulseAt - g.t) / 3.5);
    ctx.strokeStyle = `rgba(255,106,43,${0.15 + (1 - left) * 0.5})`; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(b.x, b.y, 110, 0, Math.PI * 2); ctx.stroke();
  }

  // Shots
  for (const sh of g.shots) {
    ctx.strokeStyle = TEAM_COLOR[sh.team]; ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.shadowColor = TEAM_COLOR[sh.team]; ctx.shadowBlur = 12;
    ctx.beginPath(); ctx.moveTo(sh.x, sh.y); ctx.lineTo(sh.x - sh.vx * 0.03, sh.y - sh.vy * 0.03); ctx.stroke();
    ctx.shadowBlur = 0;
  }

  // Players
  for (const p of Object.values(g.players)) {
    if (!p.alive) continue;
    const c = TEAM_COLOR[p.team];
    // aim barrel
    ctx.strokeStyle = '#07080f'; ctx.lineWidth = 9; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + Math.cos(p.aim) * 26, p.y + Math.sin(p.aim) * 26); ctx.stroke();
    ctx.strokeStyle = '#f2f2fa'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + Math.cos(p.aim) * 25, p.y + Math.sin(p.aim) * 25); ctx.stroke();
    // body
    ctx.fillStyle = c;
    ctx.beginPath(); ctx.arc(p.x, p.y, PLAYER_R, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = p.id === ME ? '#ffffff' : '#07080f'; ctx.lineWidth = p.id === ME ? 4 : 3; ctx.stroke();
    // energy ring
    ctx.strokeStyle = '#f2b530'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(p.x, p.y, PLAYER_R + 5, -Math.PI / 2, -Math.PI / 2 + (p.energy / MAX_ENERGY) * Math.PI * 2); ctx.stroke();
    // label
    ctx.fillStyle = p.id === ME ? '#ffffff' : '#c9cbe6'; ctx.font = `${p.id === ME ? 800 : 600} 12px system-ui`; ctx.textAlign = 'center';
    ctx.fillText(p.answering ? `${p.name} · answering` : p.name, p.x, p.y - PLAYER_R - 10);
    if (p.answering) {
      ctx.strokeStyle = '#6e5bff'; ctx.lineWidth = 2; ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.arc(p.x, p.y, PLAYER_R + 11, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    }
  }

  // Effects
  for (const e of effects) {
    e.life -= dt * 1.6; e.r += dt * 120;
    ctx.globalAlpha = Math.max(0, e.life);
    ctx.strokeStyle = e.color; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  for (let i = effects.length - 1; i >= 0; i--) if (effects[i].life <= 0) effects.splice(i, 1);
}
