'use client';

// Reactor Clash student screen. Your own movement is predicted locally and
// reported to the host; everything else is drawn from host snapshots.
// Questions come from the database, which records every answer.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { StagingConfig } from '@/lib/classroom-v2/staging-config';
import { LiveError, liveClient, readTab, rpc, useSession, writeTab } from '@/lib/live-game';
import { moveCircle, terminalLocked, terminalNear, BOSS_HP, MAX_ENERGY, PLAYER_R, SPEED, SPRINT_SPEED, type ClashState, type Team } from '@/lib/clash/sim';
import { decodeSnapshot, lerpState, type Roster, type Snapshot } from '@/lib/clash/protocol';
import { openClashChannel, type ClashNet } from '@/lib/clash/net';
import { useSound } from '@/lib/live-sound';
import { draw, followCam, loadSprites, isClashSubject, TEAM_COLOR, type Cam, type ClashSubject, type Fx } from './render';
import { BOSSES } from '../live/boss';
import s from './clash.module.css';

const SEAT_KEY = 'hsc-clash-seat';
type Seat = { roomId: string; playerId: string; token: string; team: Team; alias: string };
type Me = { state: 'lobby' | 'active' | 'complete'; alias: string; team: Team; token: string; seconds: number; answered: number; correct: number; results: { score: Record<Team, number>; winner: Team | null } | null };
type Question = { issueId: string; stem: string; options: string[]; picked: number | null; correctIndex: number | null; explanation: string | null; opened: number };
type Feed = { id: number; text: string; tone: Team | 'info' };
const mmss = (sec: number) => `${Math.floor(Math.max(0, sec) / 60)}:${String(Math.max(0, Math.floor(sec % 60))).padStart(2, '0')}`;

export default function ClashPlay({ config }: { config: StagingConfig }) {
  const client = useMemo(() => liveClient(config, 'player'), [config]);
  const session = useSession(client);
  const sound = useSound('clash-player', true);
  const [seat, setSeat] = useState<Seat | null>(null);
  const [code, setCode] = useState('');
  const [alias, setAlias] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [me, setMe] = useState<Me | null>(null);
  const [roster, setRoster] = useState<Roster>([]);
  const [question, setQuestion] = useState<Question | null>(null);
  const [hud, setHud] = useState<{ t: number; score: Record<Team, number>; energy: number; streak: number; alive: boolean; respawnIn: number; near: 'ready' | 'locked' | null; lockIn: number; boss: number | null } | null>(null);
  const [feed, setFeed] = useState<Feed[]>([]);
  const [live, setLive] = useState(false);
  const [ended, setEnded] = useState(false);
  const [subject, setSubject] = useState<ClashSubject>('chemistry');
  const bossName = BOSSES[subject].name;

  const snaps = useRef<{ g: ClashState; at: number }[]>([]);
  const names = useRef(new Map<string, string>());
  const local = useRef<{ x: number; y: number; aim: number; init: boolean; wasAlive: boolean }>({ x: 0, y: 0, aim: 0, init: false, wasAlive: true });
  const keys = useRef(new Set<string>());
  const mouse = useRef({ x: 0, y: 0, down: false, has: false });
  const net = useRef<ClashNet | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fx = useRef<Fx[]>([]);
  const images = useRef<Record<string, HTMLImageElement>>({});
  const questionRef = useRef(question);
  useEffect(() => { questionRef.current = question; }, [question]);
  const seatRef = useRef(seat);
  useEffect(() => { seatRef.current = seat; }, [seat]);

  useEffect(() => { images.current = loadSprites(subject); }, [subject]);
  // Development-only hook so browser tests can place this player.
  useEffect(() => { if (process.env.NODE_ENV !== 'production') (window as unknown as { __clashLocal?: unknown }).__clashLocal = local.current; }, []);
  // Read browser-only values after mount (deferred one tick to avoid a render cascade).
  useEffect(() => { const id = setTimeout(() => { setSeat(readTab<Seat>(SEAT_KEY)); setCode((new URLSearchParams(window.location.search).get('code') ?? '').toUpperCase().slice(0, 6)); }, 0); return () => clearTimeout(id); }, []);

  const pushFeed = useCallback((text: string, tone: Feed['tone']) => {
    const id = Date.now() + Math.random();
    setFeed(f => [{ id, text, tone }, ...f].slice(0, 5));
    setTimeout(() => setFeed(f => f.filter(x => x.id !== id)), 4000);
  }, []);

  async function join() {
    setBusy(true); setError('');
    try {
      if (session === 'signed-out' || session === 'checking') { const { error: e } = await client.auth.signInAnonymously(); if (e) throw new LiveError('UNKNOWN'); }
      const rows = await rpc<{ room_id: string; player_id: string; team: Team; token: string }[]>(client, 'clash_join', { p_code: code.trim(), p_alias: alias.trim() });
      const r = rows?.[0];
      if (!r) throw new LiveError('UNKNOWN');
      const next = { roomId: r.room_id, playerId: r.player_id, token: r.token, team: r.team, alias: alias.trim() };
      writeTab(SEAT_KEY, next); setSeat(next);
    } catch (e) {
      const c = e instanceof LiveError ? e.code : 'UNKNOWN';
      setError(c === 'ROOM_UNAVAILABLE' ? "We couldn't find that match. Check the code." : c === 'ALIAS_TAKEN' ? 'Someone already has that name. Pick another.' : c === 'INVALID_ALIAS' ? 'Pick a name up to 24 characters.' : 'Could not join. Try again.');
    }
    setBusy(false);
  }

  // Room state (lobby / active / complete) and my stats.
  useEffect(() => {
    if (!seat || (session !== 'guest' && session !== 'teacher')) return;
    let alive = true;
    const load = async () => {
      try { const m = await rpc<Me>(client, 'clash_me', { p_room: seat.roomId, p_player: seat.playerId }); if (alive) setMe(m); }
      catch (e) { if (alive && e instanceof LiveError && (e.code === 'FORBIDDEN' || e.code === 'ROOM_UNAVAILABLE')) { writeTab(SEAT_KEY, null); setSeat(null); setError('That match is no longer available.'); } }
    };
    void load();
    const id = setInterval(load, 3000);
    return () => { alive = false; clearInterval(id); };
  }, [client, seat, session]);

  // Snapshots and roster from the host.
  useEffect(() => {
    if (!seat || (session !== 'guest' && session !== 'teacher')) return;
    const n = openClashChannel(client, seat.roomId, ['snap', 'roster'], (event, payload) => {
      if (event === 'roster') {
        const r = (payload as { r?: Roster })?.r;
        if (Array.isArray(r)) { setRoster(r); for (const [id, name] of r) names.current.set(id, name); }
        const sj = (payload as { subject?: unknown })?.subject;
        if (isClashSubject(sj)) setSubject(sj);
      } else if (event === 'snap') {
        const g = decodeSnapshot(payload as Snapshot, names.current);
        snaps.current.push({ g, at: performance.now() });
        if (snaps.current.length > 3) snaps.current.shift();
        setLive(true);
        if (g.ended) setEnded(true);
        for (const e of (payload as Snapshot).ev ?? []) {
          const mine = seatRef.current?.playerId;
          if (e.type === 'tag') {
            const v = g.players[e.victim], by = g.players[e.by];
            if (v) fx.current.push({ x: v.x, y: v.y, r: 8, life: 1, color: TEAM_COLOR[by?.team ?? 'blue'], kind: 'spark' });
            if (e.by === mine) { pushFeed(`You tagged ${v?.name ?? 'someone'}`, by?.team ?? 'info'); sound.cue('correct'); }
            else if (e.victim === mine) { pushFeed(`${by?.name ?? 'Someone'} tagged you`, by?.team ?? 'info'); sound.cue('wrong'); }
          } else if (e.type === 'capture') { const rc = g.reactors.find(x => x.id === e.reactor); if (rc) fx.current.push({ x: rc.x, y: rc.y, r: 30, life: 1, color: TEAM_COLOR[e.team], kind: 'pulse' }); pushFeed(`${e.team === 'blue' ? 'Blue' : 'Orange'} captured the ${e.reactor} reactor`, e.team); }
          else if (e.type === 'boss-spawn') { pushFeed(`${bossName} has arrived! Most damage wins +60`, 'info'); sound.cue('fanfare'); }
          else if (e.type === 'end') sound.cue('fanfare');
        }
      }
    });
    net.current = n;
    return () => { n.close(); net.current = null; };
  }, [client, seat, session, pushFeed, sound, bossName]);

  const openQuestion = useCallback(async () => {
    const st = seatRef.current, latest = snaps.current.at(-1)?.g;
    if (!st || !latest || questionRef.current) return;
    const mine = latest.players[st.playerId];
    if (!mine?.alive) return;
    const pos = { ...mine, x: local.current.x, y: local.current.y };
    const term = terminalNear(latest, pos);
    if (!term || terminalLocked(latest, mine, term.id)) return;
    net.current?.send('begin', { id: st.playerId, k: st.token, term: term.id });
    sound.cue('lock');
    try {
      const q = await rpc<{ issue_id: string; stem: string; options: string[] }>(client, 'clash_question', { p_room: st.roomId, p_player: st.playerId });
      setQuestion({ issueId: q.issue_id, stem: q.stem, options: q.options, picked: null, correctIndex: null, explanation: null, opened: performance.now() });
    } catch { net.current?.send('cancel', { id: st.playerId, k: st.token }); }
  }, [client, sound]);

  const answer = useCallback(async (i: number) => {
    const st = seatRef.current, q = questionRef.current;
    if (!st || !q || q.picked !== null || i >= q.options.length) return;
    setQuestion({ ...q, picked: i });
    try {
      const r = await rpc<{ correct: boolean; correct_index: number; explanation: string | null }>(client, 'clash_answer', { p_room: st.roomId, p_player: st.playerId, p_issue: q.issueId, p_choice: i });
      sound.cue(r.correct ? 'correct' : 'wrong');
      setQuestion(cur => (cur && cur.issueId === q.issueId ? { ...cur, correctIndex: r.correct_index, explanation: r.explanation } : cur));
      setTimeout(() => setQuestion(cur => (cur && cur.issueId === q.issueId ? null : cur)), r.correct ? 700 : 1800);
    } catch { setQuestion(null); }
  }, [client, sound]);

  // Controls
  useEffect(() => {
    if (!seat) return;
    const down = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest('input,select,textarea')) return;
      const k = e.key.toLowerCase();
      const q = questionRef.current;
      if (q) {
        const n = Number(e.key);
        if (n >= 1 && n <= 6) { e.preventDefault(); void answer(n - 1); }
        if (k === 'escape' && q.picked === null && seatRef.current) { net.current?.send('cancel', { id: seatRef.current.playerId, k: seatRef.current.token }); setQuestion(null); }
        return;
      }
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'shift'].includes(k)) e.preventDefault();
      if (k === 'e') void openQuestion();
      keys.current.add(k);
    };
    const up = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase());
    const blur = () => keys.current.clear();
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', blur);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur); };
  }, [seat, answer, openQuestion]);

  // Game loop: predict own movement, send controls, render interpolated world.
  useEffect(() => {
    if (!seat || !live) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const cam: Cam = { x: 0, y: 0, scale: 1 };
    let raf = 0, last = performance.now(), sendAt = 0, hudAt = 0, lastSent = '';
    const toWorld = (ev: MouseEvent) => {
      const rect = canvas.getBoundingClientRect(), dpr = canvas.width / rect.width;
      return { x: ((ev.clientX - rect.left) * dpr - canvas.width / 2) / cam.scale + cam.x, y: ((ev.clientY - rect.top) * dpr - canvas.height / 2) / cam.scale + cam.y };
    };
    const move = (ev: MouseEvent) => { const w = toWorld(ev); mouse.current = { ...mouse.current, x: w.x, y: w.y, has: true }; };
    const md = (ev: MouseEvent) => { if (ev.button === 0) { move(ev); mouse.current.down = true; } };
    const mu = () => { mouse.current.down = false; };
    canvas.addEventListener('mousemove', move); canvas.addEventListener('mousedown', md); window.addEventListener('mouseup', mu);

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (canvas.width !== Math.round(canvas.clientWidth * dpr)) { canvas.width = Math.round(canvas.clientWidth * dpr); canvas.height = Math.round(canvas.clientHeight * dpr); }
      const list = snaps.current;
      if (list.length) {
        // Render ~100ms in the past, interpolating between the two snapshots around that time.
        const renderAt = now - 100;
        let view = list[list.length - 1].g;
        for (let i = list.length - 1; i > 0; i--) {
          if (list[i - 1].at <= renderAt && renderAt <= list[i].at) { view = lerpState(list[i - 1].g, list[i].g, (renderAt - list[i - 1].at) / Math.max(1, list[i].at - list[i - 1].at)); break; }
        }
        const host = list[list.length - 1].g.players[seat.playerId];
        const l = local.current;
        if (host) {
          // Respawns, first frame and large disagreements snap to the host's position.
          if (!l.init || (host.alive && !l.wasAlive) || Math.hypot(host.x - l.x, host.y - l.y) > 140) { l.x = host.x; l.y = host.y; l.init = true; }
          l.wasAlive = host.alive;
          const k = keys.current;
          const mx = (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0);
          const my = (k.has('s') || k.has('arrowdown') ? 1 : 0) - (k.has('w') || k.has('arrowup') ? 1 : 0);
          const len = Math.hypot(mx, my) || 1;
          const sprint = k.has('shift') && host.energy > 0 && (mx || my);
          if (host.alive && !host.answering && !questionRef.current) {
            const sp = (sprint ? SPRINT_SPEED : SPEED) * dt;
            moveCircle(l, (mx / len) * sp, (my / len) * sp, PLAYER_R);
          }
          l.aim = mouse.current.has ? Math.atan2(mouse.current.y - l.y, mouse.current.x - l.x) : mx || my ? Math.atan2(my, mx) : l.aim;
          const fire = (mouse.current.down || k.has(' ')) && !questionRef.current;
          const msg = { id: seat.playerId, k: seat.token, x: Math.round(l.x), y: Math.round(l.y), a: Math.round(l.aim * 100) / 100, f: fire ? 1 : 0, s: sprint ? 1 : 0 };
          const sig = `${msg.x},${msg.y},${msg.a},${msg.f},${msg.s}`;
          if ((sig !== lastSent && now - sendAt > 66) || now - sendAt > 400) { net.current?.send('in', msg); sendAt = now; lastSent = sig; }
          view = { ...view, players: { ...view.players, [seat.playerId]: { ...view.players[seat.playerId] ?? host, x: l.x, y: l.y, aim: l.aim } } };
        }
        followCam(cam, canvas, local.current.init ? local.current : null);
        draw(ctx, canvas, view, cam, fx.current, images.current, dt, now, seat.playerId);

        if (now - hudAt > 120 && host) {
          hudAt = now;
          const latest = list[list.length - 1].g;
          const term = host.alive ? terminalNear(latest, { ...host, x: local.current.x, y: local.current.y }) : null;
          setHud({ t: latest.t, score: latest.score, energy: host.energy, streak: host.streak, alive: host.alive, respawnIn: Math.max(0, host.respawnAt - latest.t),
            near: term && !host.answering ? (terminalLocked(latest, host, term.id) ? 'locked' : 'ready') : null,
            lockIn: term ? Math.max(0, (host.locks[term.id] ?? 0) - latest.t) : 0, boss: latest.boss ? latest.boss.hp : null });
          // The host didn't accept the terminal (too far / tagged): close the question.
          const q = questionRef.current;
          if (q && q.picked === null && !host.answering && now - q.opened > 1500) { setQuestion(null); pushFeed(host.alive ? 'Too far from the terminal' : 'Tagged while answering', 'info'); }
        }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); canvas.removeEventListener('mousemove', move); canvas.removeEventListener('mousedown', md); window.removeEventListener('mouseup', mu); };
  }, [seat, live, pushFeed]);

  const leave = () => { writeTab(SEAT_KEY, null); setSeat(null); setMe(null); setLive(false); setEnded(false); snaps.current = []; local.current.init = false; };

  // ---- Screens ---------------------------------------------------------------
  if (session === 'checking') return <div className={s.stage}><p className={s.center}>Loading…</p></div>;

  if (!seat) {
    const ready = /^[A-HJKMNP-Za-hjkmnp-z2-9]{6}$/.test(code.trim()) && alias.trim().length > 0;
    return (
      <div className={s.stage}><div className={s.panel}>
        <p className={s.kicker}>Reactor Clash</p>
        <h1 className={s.title}>Join a match</h1>
        <label className={s.field}>Match code<input className={`${s.input} ${s.codeInput}`} value={code} maxLength={6} autoComplete="off" spellCheck={false} placeholder="ABC234" onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} /></label>
        <label className={s.field}>Your name<input className={s.input} value={alias} maxLength={24} placeholder="Nickname" onChange={e => setAlias(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && ready) void join(); }} /></label>
        <button className={s.btn} disabled={busy || !ready} onClick={() => void join()}>Join</button>
        {error && <p className={s.err}>{error}</p>}
        <p className={s.small}>The code is on your teacher&apos;s screen. Want to practise first? <a href="/clash" style={{ textDecoration: 'underline' }}>Play against bots</a>.</p>
      </div></div>
    );
  }

  const myTeam = me?.team ?? seat.team;
  if (me?.state === 'complete' || ended) {
    const r = me?.results;
    return (
      <div className={s.stage}><div className={s.panel}>
        <p className={s.kicker}>Match over</p>
        <h1 className={s.title} style={{ color: r?.winner ? TEAM_COLOR[r.winner] : undefined }}>{!r ? 'Final whistle!' : r.winner === myTeam ? 'Your team won!' : r.winner ? 'Your team lost' : 'Draw!'}</h1>
        {r && <p className={s.lead}>Blue {r.score.blue} · Orange {r.score.orange}</p>}
        {me && <div className={s.statGrid}><div><b>{me.correct}/{me.answered}</b>questions right</div></div>}
        <button className={s.btn} onClick={leave}>Join another match</button>
      </div></div>
    );
  }

  // Snapshots only flow once the match is running, so they decide when to show the game.
  if (!live) {
    const mates = roster.filter(([, , t]) => (t === 0 ? 'blue' : 'orange') === myTeam).map(([, n]) => n);
    return (
      <div className={s.stage}><div className={s.panel}>
        <p className={s.kicker}>You&apos;re in · waiting for the teacher to start</p>
        <h1 className={s.title} style={{ color: TEAM_COLOR[myTeam] }}>{seat.alias}, you&apos;re on {myTeam === 'blue' ? 'Blue' : 'Orange'}</h1>
        {mates.length > 0 && <p className={s.lead}>Team: {mates.join(', ')}</p>}
        <div className={s.controls}>
          <div><kbd>W A S D</kbd> move · <kbd>Shift</kbd> sprint</div>
          <div><kbd>Mouse</kbd> aim · <kbd>Click</kbd> / <kbd>Space</kbd> fire</div>
          <div><kbd>E</kbd> at a terminal to answer for energy · <kbd>1</kbd>–<kbd>4</kbd> to pick</div>
        </div>
        <p className={s.small}>Capture reactors, tag the other team, and keep your energy up by answering questions.</p>
        <button className={s.link} onClick={leave}>Leave</button>
      </div></div>
    );
  }

  const seconds = me?.seconds ?? 240;
  return (
    <div className={s.stage}>
      <canvas ref={canvasRef} className={s.canvas} />
      {hud && (
        <>
          <div className={s.top}>
            <span className={`${s.team} ${s.blue}`}>{myTeam === 'blue' ? 'Your team' : 'Blue'} {Math.floor(hud.score.blue)}</span>
            <span className={s.clock}>{mmss(seconds - hud.t)}</span>
            <span className={`${s.team} ${s.orange}`}>{Math.floor(hud.score.orange)} {myTeam === 'orange' ? 'Your team' : 'Orange'}</span>
          </div>
          {hud.boss !== null && <div className={s.bossBar}><span>{bossName}</span><span className={s.track}><span style={{ width: `${(hud.boss / BOSS_HP) * 100}%` }} /></span></div>}
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
            <p className={s.qStem}>{question.stem}</p>
            <div className={s.tiles}>
              {question.options.map((o, i) => {
                const st = question.correctIndex === null ? (question.picked === i ? s.right : '') : i === question.correctIndex ? s.right : i === question.picked ? s.wrong : s.faded;
                return <button key={i} className={`${s.tile} ${st}`} disabled={question.picked !== null} onClick={() => void answer(i)}><kbd>{i + 1}</kbd>{o}</button>;
              })}
            </div>
            {question.correctIndex !== null && question.picked !== question.correctIndex && question.explanation && <p className={s.explain}>{question.explanation}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
