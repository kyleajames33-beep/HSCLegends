'use client';

// Reactor Clash practice: you + bots on a top-down map. Questions are energy.
// Rendering is plain Canvas 2D; rules live in lib/clash/sim.ts.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  addPlayer, answerResult, beginAnswer, cancelAnswer, createClash, step, terminalLocked, terminalNear,
  BOSS_HP, MATCH_SECONDS, MAX_ENERGY,
  type ClashEvent, type ClashState, type Input, type Team,
} from '@/lib/clash/sim';
import { draw, followCam, loadSprites, CLASH_SUBJECTS, TEAM_COLOR, type Cam, type ClashSubject, type Fx } from './render';
import { BOSSES } from '../live/boss';
import { botInputs, type BotBrain } from '@/lib/clash/bots';
import { PRACTICE_BANK } from '@/lib/clash/questions';
import { useSound } from '@/lib/live-sound';
import s from './clash.module.css';

type Q = { stem: string; options: string[]; answer: number; explanation?: string };
const BANK: Q[] = PRACTICE_BANK.map(q => ({ stem: q.stem, options: q.options, answer: q.correct_index, explanation: q.teacher_draft?.explanation }));
const ME = 'me';

type Hud = { t: number; score: Record<Team, number>; energy: number; streak: number; alive: boolean; respawnIn: number; near: 'ready' | 'locked' | null; lockIn: number; bossHp: number | null };
type Feed = { id: number; text: string; tone: Team | 'info' };

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
  const [subject, setSubject] = useState<ClashSubject>('chemistry');
  const bossName = BOSSES[subject].name;
  const questionRef = useRef(question);
  useEffect(() => { questionRef.current = question; }, [question]);

  // Preload sprites (bosses / emblems are decorative; shapes are used until art loads).
  useEffect(() => {
    images.current = loadSprites(subject);
  }, [subject]);

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
    const cam: Cam = { x: 0, y: 0, scale: 1 };

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
          fx.current.push({ x: v.x, y: v.y, r: 8, life: 1, color: TEAM_COLOR[by?.team ?? 'blue'], kind: 'spark' });
          if (e.by === ME) { pushFeed(`You tagged ${v.name}`, 'blue'); sound.cue('correct'); }
          else if (e.victim === ME) { pushFeed(`${by?.name ?? 'Someone'} tagged you`, 'orange'); sound.cue('wrong'); setQuestion(null); }
        } else if (e.type === 'capture') { const rc = g.reactors.find(x => x.id === e.reactor); if (rc) fx.current.push({ x: rc.x, y: rc.y, r: 30, life: 1, color: TEAM_COLOR[e.team], kind: 'pulse' }); pushFeed(`${e.team === 'blue' ? 'Your team' : 'Orange'} captured the ${e.reactor} reactor`, e.team); sound.cue(e.team === 'blue' ? 'start' : 'reveal'); }
        else if (e.type === 'boss-spawn') { pushFeed(`${bossName} has arrived! Most damage wins +60`, 'info'); sound.cue('fanfare'); }
        else if (e.type === 'boss-down') pushFeed(e.team ? `${e.team === 'blue' ? 'Your team' : 'Orange'} wins the boss bonus` : 'Boss bonus tied', e.team ?? 'info');
        else if (e.type === 'pickup' && e.player === ME) sound.cue('join');
        else if (e.type === 'boss-pulse') fx.current.push({ x: g.boss?.x ?? 0, y: g.boss?.y ?? 0, r: 20, life: 1, color: '#ff6a2b' });
        else if (e.type === 'end') {
          setResult({ winner: e.winner, score: { ...g.score }, me: { ...g.players[ME].stats } });
          setPhase('end');
          sound.cue(e.winner === 'blue' ? 'fanfare' : 'reveal');
        }
      }

      followCam(cam, canvas, me);
      draw(ctx, canvas, g, cam, fx.current, images.current, dt, now, ME);

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
  }, [phase, pushFeed, sound, bossName]);

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
            <li>With a minute left, {bossName} arrives. The team that deals the most damage gets +60.</li>
            <li>Wrong answer? That terminal locks for 6 seconds. While you answer, you can&apos;t move.</li>
          </ul>
          <label className={s.field}>Boss for the final minute
            <select className={s.input} value={subject} onChange={e => setSubject(e.target.value as ClashSubject)}>
              {CLASH_SUBJECTS.map(k => <option key={k} value={k}>{BOSSES[k].name} ({BOSSES[k].subject})</option>)}
            </select>
          </label>
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
            <div className={s.bossBar}><span>{bossName}</span><span className={s.track}><span style={{ width: `${(hud.bossHp / BOSS_HP) * 100}%` }} /></span></div>
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

