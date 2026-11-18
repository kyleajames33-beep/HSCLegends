'use client';

// Reactor Clash host (projector). The teacher's browser runs the authoritative
// game simulation and relays snapshots to students. Energy is granted only for
// answers the database has recorded (clash_receipts).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import type { StagingConfig } from '@/lib/classroom-v2/staging-config';
import { LiveError, liveClient, readTab, rpc, useSession, writeTab } from '@/lib/live-game';
import { addPlayer, answerResult, applyRemotePosition, beginAnswer, cancelAnswer, createClash, EMERGENCY, step, type ClashEvent, type ClashState, type Input, type Team } from '@/lib/clash/sim';
import { botInputs, type BotBrain } from '@/lib/clash/bots';
import { encodeRoster, encodeSnapshot, inputFromMsg, PROJECTOR_TIMEOUT_MS, type InputMsg, type TerminalMsg } from '@/lib/clash/protocol';
import { openClashChannel, type ClashNet } from '@/lib/clash/net';
import { PRACTICE_BANK } from '@/lib/clash/questions';
import { useSound } from '@/lib/live-sound';
import { draw, followCam, loadSprites, isClashSubject, CLASH_SUBJECTS, TEAM_COLOR, type Cam, type ClashSubject, type Fx } from './render';
import { BOSSES } from '../live/boss';
import s from './clash.module.css';

const ROOM_KEY = 'hsc-clash-host-room';
type HostPlayer = { id: string; alias: string; team: Team; token: string };
type HostView = { room_id: string; short_code: string; state: 'lobby' | 'active' | 'complete'; seconds: number; pool_size: number; results: Results | null; players: HostPlayer[] };
type SetSummary = { id: string; name: string; count: number; subject: string | null };
const SUBJECT_KEY = 'hsc-clash-host-subject';
type Results = { score: Record<Team, number>; winner: Team | null; players: { name: string; team: Team; bot: boolean; tags: number; captures: number; correct: number; answered: number; bossDamage: number }[] };
type Feed = { id: number; text: string; tone: Team | 'info' };
const mmss = (sec: number) => `${Math.floor(Math.max(0, sec) / 60)}:${String(Math.max(0, Math.floor(sec % 60))).padStart(2, '0')}`;
const BOT_NAMES = ['Nova', 'Ash', 'Kai', 'Rex', 'Vee', 'Jun', 'Ola', 'Sol'];

function JoinQr({ url }: { url: string }) {
  const [svg, setSvg] = useState('');
  useEffect(() => {
    let alive = true;
    QRCode.toString(url, { type: 'svg', margin: 1, color: { dark: '#0e1020', light: '#ffffff' } }).then(out => { if (alive) setSvg(out); }).catch(() => {});
    return () => { alive = false; };
  }, [url]);
  return svg ? <div className={s.qr} role="img" aria-label="QR code to join" dangerouslySetInnerHTML={{ __html: svg }} /> : null;
}

export default function ClashHost({ config }: { config: StagingConfig }) {
  const client = useMemo(() => liveClient(config, 'host'), [config]);
  const session = useSession(client);
  const sound = useSound('clash-host', true);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [view, setView] = useState<HostView | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [sets, setSets] = useState<SetSummary[]>([]);
  const [source, setSource] = useState('practice');
  const [minutes, setMinutes] = useState(4);
  const [fillBots, setFillBots] = useState(true);
  const [subject, setSubject] = useState<ClashSubject>('chemistry');
  const bossName = BOSSES[subject].name;
  const [origin, setOrigin] = useState('');
  const [hud, setHud] = useState<{ t: number; score: Record<Team, number>; answering: number; exhausted: number; boss: number | null } | null>(null);
  const [paused, setPaused] = useState(false);
  const [feed, setFeed] = useState<Feed[]>([]);
  const [results, setResults] = useState<Results | null>(null);

  const sim = useRef<ClashState | null>(null);
  const brain = useRef<BotBrain>({});
  const net = useRef<ClashNet | null>(null);
  const tokens = useRef(new Map<string, string>());
  const remote = useRef(new Map<string, ReturnType<typeof inputFromMsg> & { at: number; seq?: number; life?: number }>());
  const pending = useRef<ClashEvent[]>([]);
  const lastSeq = useRef(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fx = useRef<Fx[]>([]);
  const images = useRef<Record<string, HTMLImageElement>>({});

  useEffect(() => { images.current = loadSprites(subject); }, [subject]);
  // Read browser-only values after mount (deferred one tick to avoid a render cascade).
  useEffect(() => { const id = setTimeout(() => { setOrigin(window.location.origin); setRoomId(readTab<string>(ROOM_KEY)); const sj = readTab<string>(SUBJECT_KEY); if (isClashSubject(sj)) setSubject(sj); }, 0); return () => clearTimeout(id); }, []);

  const pushFeed = useCallback((text: string, tone: Feed['tone']) => {
    const id = Date.now() + Math.random();
    setFeed(f => [{ id, text, tone }, ...f].slice(0, 6));
    setTimeout(() => setFeed(f => f.filter(x => x.id !== id)), 5000);
  }, []);

  // Saved question sets for the setup screen.
  useEffect(() => {
    if (session === 'signed-out' || roomId) return;
    rpc<SetSummary[]>(client, 'classroom_v2_set_list', {}).then(setSets).catch(() => setSets([]));
  }, [client, session, roomId]);

  // Poll the room (roster, state) while hosting.
  useEffect(() => {
    if (session === 'signed-out' || !roomId) return;
    let alive = true;
    const load = async () => {
      try {
        const v = await rpc<HostView>(client, 'clash_host_view', { p_room: roomId });
        if (!alive) return;
        setView(v);
        for (const p of v.players) tokens.current.set(p.id, p.token);
        const g = sim.current;
        if (g && !g.ended) for (const p of v.players) if (!g.players[p.id]) { addPlayer(g, p.id, p.alias, p.team).remote = true; pushFeed(`${p.alias} joined ${p.team === 'blue' ? 'Blue' : 'Orange'}`, p.team); }
      } catch (e) {
        if (alive && e instanceof LiveError && (e.code === 'FORBIDDEN' || e.code === 'ROOM_UNAVAILABLE')) { writeTab(ROOM_KEY, null); setRoomId(null); setView(null); }
      }
    };
    void load();
    const id = setInterval(load, 2000);
    return () => { alive = false; clearInterval(id); };
  }, [client, session, roomId, pushFeed]);

  // Realtime channel: student controls in, snapshots out.
  useEffect(() => {
    if (session === 'signed-out' || !roomId) return;
    const valid = (m: unknown): m is { id: string; k: string } => {
      if (!m || typeof m !== 'object' || !('id' in m) || !('k' in m)) return false;
      return typeof m.id === 'string' && typeof m.k === 'string' && tokens.current.get(m.id) === m.k;
    };
    const n = openClashChannel(client, roomId, ['in', 'begin', 'cancel'], (event, payload) => {
      if (!valid(payload)) return;
      const g = sim.current;
      if (event === 'in' && g?.players[payload.id] && !g.ended) {
        const msg = payload as InputMsg;
        const r = inputFromMsg(msg);
        if (Number.isFinite(r.x) && Number.isFinite(r.y)) {
          remote.current.set(msg.id, { ...r, at: performance.now(), seq: Number.isSafeInteger(msg.seq) ? msg.seq : undefined, life: msg.life });
        }
      }
      else if (g && event === 'begin') beginAnswer(g, payload.id, String((payload as TerminalMsg).term ?? ''));
      else if (g && event === 'cancel') cancelAnswer(g, payload.id);
    });
    net.current = n;
    return () => { n.close(); net.current = null; };
  }, [client, session, roomId]);

  // Lobby roster broadcast so students can see who's on their team.
  useEffect(() => {
    if (!view || view.state !== 'lobby') return;
    const send = () => net.current?.send('roster', { r: view.players.map(p => [p.id, p.alias, p.team === 'blue' ? 0 : 1]), state: 'lobby', subject });
    send();
    const id = setInterval(send, 2000);
    return () => clearInterval(id);
  }, [view, subject]);

  const finish = useCallback(async (g: ClashState) => {
    const winner: Team | null = Math.round(g.score.blue) === Math.round(g.score.orange) ? null : g.score.blue > g.score.orange ? 'blue' : 'orange';
    const res: Results = {
      score: { blue: Math.floor(g.score.blue), orange: Math.floor(g.score.orange) }, winner,
      players: Object.values(g.players).map(p => ({ name: p.name, team: p.team, bot: p.bot, ...p.stats })),
    };
    setResults(res);
    sound.cue('fanfare');
    if (roomId) await rpc(client, 'clash_finish', { p_room: roomId, p_results: res }).catch(() => setError('The results could not be saved, but the game is over.'));
  }, [client, roomId, sound]);

  // Run the match once the room is active.
  useEffect(() => {
    if (!view || view.state !== 'active' || !roomId) return;
    if (!sim.current) {
      const g = createClash(Math.floor(Math.random() * 1e9), view.seconds);
      for (const p of view.players) addPlayer(g, p.id, p.alias, p.team).remote = true;
      if (fillBots) {
        let n = 0;
        for (const team of ['blue', 'orange'] as Team[]) {
          const have = view.players.filter(p => p.team === team).length;
          for (let i = have; i < 3; i++) addPlayer(g, `bot-${team}-${i}`, `${BOT_NAMES[n++ % BOT_NAMES.length]} (bot)`, team, true);
        }
      }
      sim.current = g; brain.current = {}; lastSeq.current = 0;
      // Development-only hook so browser tests can inspect the match.
      if (process.env.NODE_ENV !== 'production') (window as unknown as { __clashHost?: ClashState }).__clashHost = g;
    }
    const g = sim.current;
    let steppedAt = performance.now(), nextSnapshotAt = steppedAt, rosterAt = 0, receiptBusy = false;
    const stepMs = 1000 / 30;
    const consumedAt = new Map<string, number>();
    let finished = g.ended;

    // Answers recorded by the database become energy.
    let active = true;
    let nextReceiptAt = 0;
    const readReceipts = async () => {
      receiptBusy = true;
      try {
        const list = await rpc<{ seq: number; player_id: string; correct: boolean }[]>(client, 'clash_receipts', { p_room: roomId, p_since: lastSeq.current });
        if (!active || g.ended) return;
        for (const r of list) {
          if (r.seq <= lastSeq.current) continue;
          lastSeq.current = r.seq;
          answerResult(g, r.player_id, r.correct, pending.current);
        }
      } catch { /* retry next tick */ }
      finally { receiptBusy = false; }
    };

    const tick = () => {
      const now = performance.now();
      if (g.ended) return;
      // Bound work per message, retaining any remaining time for the next wake-up.
      // Send just the current snapshot after catching up.
      const events: ClashEvent[] = [];
      for (let i = 0; i < 30 && now - steppedAt >= stepMs && !g.ended; i++) {
        steppedAt += stepMs;
        const inputs: Record<string, Input> = {};
        for (const [id, report] of remote.current) {
          const player = g.players[id];
          const age = steppedAt - report.at;
          if (!player || age < -stepMs || age > 600) continue;
          if (report.life !== undefined && report.life !== Math.round(player.respawnAt * 10) / 10) continue;
          const previous = consumedAt.get(id);
          if (previous !== report.at) {
            const elapsed = previous === undefined ? stepMs : report.at - previous;
            applyRemotePosition(g, id, report.x, report.y, elapsed / 1000, report.input.sprint);
            consumedAt.set(id, report.at);
            player.reportSeq = report.seq;
          }
          inputs[id] = report.input;
        }
        Object.assign(inputs, botInputs(g, brain.current, events));
        events.push(...step(g, stepMs / 1000, inputs));
      }
      pending.current.push(...events);
      for (const e of events) {
        if (e.type === 'tag') { const v = g.players[e.victim], by = g.players[e.by]; fx.current.push({ x: v.x, y: v.y, r: 8, life: 1, color: TEAM_COLOR[by?.team ?? 'blue'], kind: 'spark' }); pushFeed(`${by?.name ?? '?'} tagged ${v?.name ?? '?'}`, by?.team ?? 'info'); }
        else if (e.type === 'capture') { const rc = g.reactors.find(x => x.id === e.reactor); if (rc) fx.current.push({ x: rc.x, y: rc.y, r: 30, life: 1, color: TEAM_COLOR[e.team], kind: 'pulse' }); pushFeed(`${e.team === 'blue' ? 'Blue' : 'Orange'} captured the ${e.reactor} reactor`, e.team); sound.cue('start'); }
        else if (e.type === 'boss-spawn') { pushFeed(`${bossName} has arrived! Most damage wins +60`, 'info'); sound.cue('fanfare'); }
        else if (e.type === 'boss-down') pushFeed(e.team ? `${e.team === 'blue' ? 'Blue' : 'Orange'} wins the boss bonus` : 'Boss bonus tied', e.team ?? 'info');
      }
      if ((now >= nextSnapshotAt && now - steppedAt < stepMs) || g.ended) {
        // Keep the 10 Hz cadence across late ticks. One current snapshot covers missed deadlines.
        nextSnapshotAt += (Math.floor((now - nextSnapshotAt) / 100) + 1) * 100;
        net.current?.send('snap', encodeSnapshot(g, pending.current));
        pending.current = [];
      }
      if (now - rosterAt > 2000) { rosterAt = now; net.current?.send('roster', { r: encodeRoster(g), state: 'active', seconds: g.duration, subject }); }
      if (!g.ended && !receiptBusy && now >= nextReceiptAt) {
        nextReceiptAt = now + 700;
        void readReceipts();
      }
      if (g.ended && !finished) { finished = true; void finish(g); }
    };
    const worker = new Worker(new URL('./clash-clock.worker.ts', import.meta.url));
    worker.onmessage = () => {
      tick();
      if (!g.ended) worker.postMessage(performance.now() - steppedAt >= stepMs);
    };
    worker.postMessage(null);

    // This watchdog also runs when the worker has stopped delivering messages.
    const checkClock = () => {
      const now = performance.now();
      setPaused(now - steppedAt > PROJECTOR_TIMEOUT_MS);
    };
    const watchdog = setInterval(checkClock, 250);
    document.addEventListener('visibilitychange', checkClock);

    // Projector rendering
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const cam: Cam = { x: 0, y: 0, scale: 1 };
    let raf = 0, lastFrame = performance.now(), hudAt = 0;
    const frame = (now: number) => {
      if (canvas && ctx) {
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        if (canvas.width !== Math.round(canvas.clientWidth * dpr)) { canvas.width = Math.round(canvas.clientWidth * dpr); canvas.height = Math.round(canvas.clientHeight * dpr); }
        followCam(cam, canvas, null);
        draw(ctx, canvas, g, cam, fx.current, images.current, Math.min(0.05, (now - lastFrame) / 1000), now, null);
      }
      lastFrame = now;
      if (now - hudAt > 150) {
        hudAt = now;
        setHud({ t: g.t, score: { ...g.score }, answering: Object.values(g.players).filter(p => p.answering).length, exhausted: Object.values(g.players).filter(p => p.answering === EMERGENCY).length, boss: g.boss ? g.boss.hp : null });
      }
      if (!g.ended) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      active = false;
      worker.terminate();
      clearInterval(watchdog);
      document.removeEventListener('visibilitychange', checkClock);
      cancelAnimationFrame(raf);
    };
  }, [view?.state, roomId, client, fillBots, finish, pushFeed, sound, bossName, subject]); // eslint-disable-line react-hooks/exhaustive-deps

  async function signIn() {
    setBusy(true); setError('');
    const pw = password; setPassword('');
    const { error: e } = await client.auth.signInWithPassword({ email, password: pw });
    if (e) setError('Sign-in failed. Check the teacher email and password.');
    setBusy(false);
  }

  async function create() {
    setBusy(true); setError('');
    try {
      const pool = source === 'practice' ? PRACTICE_BANK : await rpc<unknown[]>(client, 'classroom_v2_set_get', { p_set: source });
      const rows = await rpc<{ room_id: string }[]>(client, 'clash_create', { p_questions: pool, p_seconds: minutes * 60 });
      const id = rows?.[0]?.room_id;
      if (!id) throw new LiveError('UNKNOWN');
      sim.current = null; remote.current.clear(); pending.current = []; setPaused(false); setResults(null); setView(null);
      writeTab(SUBJECT_KEY, subject); writeTab(ROOM_KEY, id); setRoomId(id);
    } catch (e) {
      setError(e instanceof LiveError && e.code === 'FORBIDDEN' ? 'This account is not approved to host games yet.' : 'Could not create the game. Try again.');
    }
    setBusy(false);
  }

  async function startMatch() {
    if (!roomId) return;
    setBusy(true);
    try { await rpc(client, 'clash_start', { p_room: roomId }); setView(v => (v ? { ...v, state: 'active' } : v)); sound.cue('start'); }
    catch { setError('Could not start. Try again.'); }
    setBusy(false);
  }

  async function swapTeam(p: HostPlayer) {
    if (!roomId) return;
    await rpc(client, 'clash_set_team', { p_room: roomId, p_player: p.id, p_team: p.team === 'blue' ? 'orange' : 'blue' }).catch(() => {});
    setView(v => (v ? { ...v, players: v.players.map(x => (x.id === p.id ? { ...x, team: x.team === 'blue' ? 'orange' : 'blue' } : x)) } : v));
  }

  async function downloadReport() {
    if (!roomId) return;
    try {
      const rep = await rpc<{ alias: string; team: Team; answered: number; correct: number; missed: string[] }[]>(client, 'clash_report', { p_room: roomId });
      const cell = (v: string | number) => { const t = String(v); return /[",\n\r]/.test(t) || /^[=+\-@]/.test(t) ? `"${t.replace(/^([=+\-@])/, "'$1").replace(/"/g, '""')}"` : t; };
      const csv = [['Name', 'Team', 'Answered', 'Correct', 'Questions missed'], ...rep.map(r => [r.alias, r.team, r.answered, r.correct, r.missed.join(' | ')])]
        .map(row => row.map(cell).join(',')).join('\r\n') + '\r\n';
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const a = document.createElement('a'); a.href = url; a.download = `reactor-clash-results-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { setError('Could not download the results.'); }
  }

  const leave = () => { writeTab(ROOM_KEY, null); setRoomId(null); setView(null); sim.current = null; setResults(null); };

  // ---- Screens ---------------------------------------------------------------
  if (session === 'checking') return <div className={s.stage}><p className={s.center}>Loading…</p></div>;
  // Hosting is authorised by the server's host allowlist; any signed-in account may try.
  if (session === 'signed-out') {
    return (
      <div className={s.stage}><div className={s.panel}>
        <p className={s.kicker}>Reactor Clash · Host</p>
        <h1 className={s.title}>Teacher sign-in</h1>
        <label className={s.field}>Email<input className={s.input} type="email" value={email} onChange={e => setEmail(e.target.value)} /></label>
        <label className={s.field}>Password<input className={s.input} type="password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void signIn(); }} /></label>
        <button className={s.btn} disabled={busy || !email || !password} onClick={() => void signIn()}>Sign in</button>
        {error && <p className={s.err}>{error}</p>}
      </div></div>
    );
  }

  if (!roomId || !view) {
    return (
      <div className={s.stage}><div className={s.panel}>
        <p className={s.kicker}>Reactor Clash · Host a class match</p>
        <h1 className={s.title}>Set up a match</h1>
        <label className={s.field}>Questions
          <select className={s.input} value={source} onChange={e => { setSource(e.target.value); const sj = sets.find(x => x.id === e.target.value)?.subject; if (isClashSubject(sj)) setSubject(sj); }}>
            <option value="practice">Practice bank ({PRACTICE_BANK.length} questions, unreviewed)</option>
            {sets.map(x => <option key={x.id} value={x.id}>{x.name} ({x.count} questions)</option>)}
          </select>
        </label>
        <label className={s.field}>Boss for the final minute (and its minions)
          <select className={s.input} value={subject} onChange={e => setSubject(e.target.value as ClashSubject)}>
            {CLASH_SUBJECTS.map(k => <option key={k} value={k}>{BOSSES[k].name} ({BOSSES[k].subject})</option>)}
          </select>
        </label>
        <label className={s.field}>Match length
          <select className={s.input} value={minutes} onChange={e => setMinutes(Number(e.target.value))}>
            {[3, 4, 6, 8].map(m => <option key={m} value={m}>{m} minutes</option>)}
          </select>
        </label>
        <label className={s.check}><input type="checkbox" checked={fillBots} onChange={e => setFillBots(e.target.checked)} /> Fill small teams with bots (up to 3 per side)</label>
        <button className={s.btn} disabled={busy || !!roomId} onClick={() => void create()}>{roomId ? 'Loading…' : 'Create match'}</button>
        {error && <p className={s.err}>{error}</p>}
        <p className={s.small}>Students join on their laptops at <b>{origin}/clash/join</b>. Keep this tab open during the match.</p>
      </div></div>
    );
  }

  if (view.state === 'lobby') {
    const team = (t: Team) => view.players.filter(p => p.team === t);
    return (
      <div className={s.stage}><div className={s.lobby}>
        <div className={s.joinBox}>
          <div><p className={s.dim}>Join at <b>{origin.replace(/^https?:\/\//, '')}/clash/join</b></p><p className={s.bigCode}>{view.short_code}</p></div>
          {origin && <JoinQr url={`${origin}/clash/join?code=${view.short_code}`} />}
        </div>
        <div className={s.teams}>
          {(['blue', 'orange'] as Team[]).map(t => (
            <div key={t} className={`${s.teamCol} ${t === 'blue' ? s.blueCol : s.orangeCol}`}>
              <h2>{t === 'blue' ? 'Blue' : 'Orange'} · {team(t).length}</h2>
              {team(t).map(p => <button key={p.id} className={s.chip} title="Click to move to the other team" onClick={() => void swapTeam(p)}>{p.alias}</button>)}
              {team(t).length === 0 && <p className={s.dim}>Waiting…</p>}
            </div>
          ))}
        </div>
        <div className={s.row}>
          <button className={s.btn} disabled={busy || view.players.length === 0} onClick={() => void startMatch()}>Start match</button>
          <button className={s.link} onClick={leave}>Cancel</button>
        </div>
        <p className={s.small}>Click a name to move them to the other team.{fillBots ? ' Bots fill each side up to 3.' : ''}</p>
      </div></div>
    );
  }

  return (
    <div className={s.stage}>
      <canvas ref={canvasRef} className={s.canvas} />
      {paused && !results && view.state === 'active' && <p className={s.connection} role="status">Projector paused. Keep this tab in front.</p>}
      {hud && !results && (
        <>
          <div className={s.top}>
            <span className={`${s.team} ${s.blue}`}>Blue {Math.floor(hud.score.blue)}</span>
            <span className={s.clock}>{mmss(view.seconds - hud.t)}</span>
            <span className={`${s.team} ${s.orange}`}>{Math.floor(hud.score.orange)} Orange</span>
          </div>
          <div className={s.codeTag}>Join: <b>{view.short_code}</b> · {hud.answering} answering questions{hud.exhausted > 0 && ` · ${hud.exhausted} out of energy`}</div>
          <ul className={s.feed}>{feed.map(f => <li key={f.id} className={f.tone === 'info' ? s.feedInfo : f.tone === 'blue' ? s.feedBlue : s.feedOrange}>{f.text}</li>)}</ul>
          <button className={s.sound} onClick={sound.toggle}>{sound.on ? 'Sound on' : 'Sound off'}</button>
        </>
      )}
      {(results || view.state === 'complete') && (
        <div className={s.qWrap}><div className={s.panel}>
          {(() => {
            const r = results ?? view.results;
            if (!r) return <p>Match over.</p>;
            const humans = r.players.filter(p => !p.bot);
            const best = (k: 'tags' | 'correct' | 'captures') => [...humans].sort((a, b) => b[k] - a[k])[0];
            return <>
              <p className={s.kicker}>Match over</p>
              <h1 className={s.title} style={{ color: r.winner ? TEAM_COLOR[r.winner] : undefined }}>{r.winner ? `${r.winner === 'blue' ? 'Blue' : 'Orange'} wins!` : 'Draw!'}</h1>
              <p className={s.lead}>Blue {r.score.blue} · Orange {r.score.orange}</p>
              {humans.length > 0 && <div className={s.statGrid}>
                {(['correct', 'tags', 'captures'] as const).map(k => {
                  const top = best(k);
                  return top && top[k] > 0 ? <div key={k}><b>{top.name}</b>most {k === 'correct' ? 'questions right' : k} ({top[k]})</div> : null;
                })}
                <div><b>{humans.reduce((a, p) => a + p.correct, 0)}</b>questions answered right by the class</div>
              </div>}
              <div className={s.row}>
                <button className={s.btn} onClick={() => void downloadReport()}>Download results (CSV)</button>
                <button className={s.link} onClick={leave}>New match</button>
              </div>
            </>;
          })()}
        </div></div>
      )}
      {error && <p className={`${s.err} ${s.floatErr}`}>{error}</p>}
    </div>
  );
}
