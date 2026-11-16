'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { StagingConfig } from '@/lib/classroom-v2/staging-config';
import { LiveError, SAMPLE_SET, SHAPES, liveClient, msRemaining, readTab, rpc, useNow, usePoll, useSession, writeTab, type HostView } from '@/lib/live-game';
import s from './live.module.css';

const ROOM_KEY = 'hsc-live-host-room';
const DURATIONS = [10, 20, 30, 45] as const;

/** Teacher / projector screen for a live classroom game (staging). */
export default function LiveHost({ config }: { config: StagingConfig }) {
  const client = useMemo(() => liveClient(config), [config]);
  const session = useSession(client);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [seconds, setSeconds] = useState<number>(20);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [boardFor, setBoardFor] = useState<string | null>(null); // question id whose leaderboard is showing
  const [origin, setOrigin] = useState('');

  useEffect(() => { setOrigin(window.location.origin); setRoomId(readTab<string>(ROOM_KEY)); }, []);

  const fetcher = useMemo(
    () => (roomId && session === 'teacher' ? () => rpc<HostView>(client, 'classroom_v2_game_host', { p_room: roomId }) : null),
    [client, roomId, session],
  );
  const poll = usePoll(fetcher, 1000);
  const now = useNow(200);
  const view = poll.data;

  useEffect(() => {
    if (poll.error === 'ROOM_UNAVAILABLE' || poll.error === 'FORBIDDEN') { writeTab(ROOM_KEY, null); setRoomId(null); }
  }, [poll.error]);

  const leave = useCallback(() => { writeTab(ROOM_KEY, null); setRoomId(null); setBoardFor(null); }, []);

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
      const rows = await rpc<{ room_id: string }[]>(client, 'classroom_v2_create', { p_request_id: crypto.randomUUID(), p_questions: SAMPLE_SET, p_seconds: seconds });
      const id = rows?.[0]?.room_id;
      if (!id) throw new LiveError('UNKNOWN');
      writeTab(ROOM_KEY, id); setRoomId(id); setBoardFor(null);
    } catch (e) {
      setError(e instanceof LiveError && e.code === 'FORBIDDEN' ? 'This account is not approved to host games yet.' : 'Could not create the game. Try again.');
    }
    setBusy(false);
  }

  // Host transitions need the room's current version. Answers bump the version,
  // so retry once with a freshly read view if the first attempt was stale.
  async function command(name: 'classroom_v2_start' | 'classroom_v2_next' | 'classroom_v2_finish') {
    if (!roomId || !view) return;
    setBusy(true); setError('');
    try {
      let ok = await rpc<boolean>(client, name, { p_room: roomId, p_expected_version: view.version });
      if (!ok) {
        const fresh = await rpc<HostView>(client, 'classroom_v2_game_host', { p_room: roomId });
        ok = await rpc<boolean>(client, name, { p_room: roomId, p_expected_version: fresh.version });
      }
      if (!ok) setError('The game changed while you clicked. Try again.');
    } catch {
      setError('That did not go through. Check your connection and try again.');
    }
    poll.refresh();
    setBusy(false);
  }

  const shell = (body: React.ReactNode, right?: React.ReactNode) => (
    <div className={s.stage}>
      <header className={s.top}><span className={s.brand}><b>HSC Legends</b> · Live</span>{right}</header>
      <main className={s.main}>{body}{error && <p className={s.error} role="alert">{error}</p>}</main>
    </div>
  );

  if (session === 'checking') return shell(<p className={s.dim}>Loading…</p>);

  if (session !== 'teacher') {
    return shell(
      <div className={`${s.card} ${s.narrow}`}>
        <h1 className={s.h2}>Teacher sign-in</h1>
        {session === 'guest' && <p className={s.dim}>This tab is signed in as a student. Sign in as the teacher to host.</p>}
        <label className={s.field}>Email<input className={s.input} type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="username" /></label>
        <label className={s.field}>Password<input className={s.input} type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" onKeyDown={e => { if (e.key === 'Enter' && email && password) void signIn(); }} /></label>
        <button className={`${s.btn} ${s.block}`} disabled={busy || !email || !password} onClick={() => void signIn()}>Sign in</button>
      </div>,
    );
  }

  const signOut = <button className={s.link} onClick={() => { leave(); void client.auth.signOut(); }}>Sign out</button>;

  if (!roomId) {
    return shell(
      <div className={`${s.card} ${s.narrow}`}>
        <h1 className={s.h2}>Host a live game</h1>
        <p className={s.dim}>Sample set: 8 mixed HSC questions (unreviewed, for testing).</p>
        <label className={s.field}>Time per question
          <select className={s.input} value={seconds} onChange={e => setSeconds(Number(e.target.value))}>
            {DURATIONS.map(d => <option key={d} value={d}>{d} seconds</option>)}
          </select>
        </label>
        <button className={`${s.btn} ${s.block}`} disabled={busy} onClick={() => void create()}>Create game</button>
      </div>,
      signOut,
    );
  }

  if (!view) return shell(<p className={s.dim}>{poll.error ? 'Reconnecting…' : 'Loading game…'}</p>, signOut);

  const players = view.players;
  const endBtn = <button className={s.link} onClick={leave}>Close game</button>;

  // Lobby
  if (view.state === 'lobby') {
    return shell(<>
      <div className={s.joinBox}>
        <div>
          <p className={s.joinUrl}>Join at <b>{origin.replace(/^https?:\/\//, '')}/live</b></p>
          <p className={s.joinUrl}>with game code</p>
        </div>
        <div className={s.bigCode}>{view.short_code}</div>
      </div>
      <p className={s.h2}>{players.length} {players.length === 1 ? 'player' : 'players'}</p>
      <div className={s.names}>{players.length === 0 ? <p className={s.dim}>Waiting for players…</p> : players.map(p => <span key={p.id} className={s.name}>{p.alias}</span>)}</div>
      <div className={s.row}>
        <button className={s.btn} disabled={busy || players.length === 0} onClick={() => void command('classroom_v2_start')}>Start game</button>
      </div>
      <p className={s.dim}>Testing on your own? Open <b>{origin}/live</b> in another tab. Each tab is a separate player.</p>
    </>, endBtn);
  }

  // Podium
  if (view.state === 'complete') {
    const [first, second, third] = players;
    return shell(<>
      <h1 className={s.h1}>Final results</h1>
      <div className={s.podium}>
        {[{ p: second, cls: s.block2, n: 2 }, { p: first, cls: s.block1, n: 1 }, { p: third, cls: s.block3, n: 3 }].map(({ p, cls, n }) => (
          <div key={n} className={s.step}>
            <span className={s.podName}>{p?.alias ?? ''}</span>
            <span className={s.dim}>{p ? p.score.toLocaleString() : ''}</span>
            <div className={cls}>{p ? n : ''}</div>
          </div>
        ))}
      </div>
      {players.length > 3 && <ol className={s.board} start={4}>{players.slice(3).map((p, i) => (
        <li key={p.id} className={s.boardRow}><span>{i + 4}</span><span>{p.alias}</span><span /><span>{p.score.toLocaleString()}</span></li>
      ))}</ol>}
      <button className={s.btn} onClick={leave}>New game</button>
    </>, signOut);
  }

  const q = view.question;
  if (!q) return shell(<p className={s.dim}>Loading question…</p>, endBtn);
  const remaining = msRemaining(view.closes_at, now, poll.offset);
  const total = Math.max(1, view.seconds * 1000);
  const everyone = players.length > 0 && view.answered >= players.length;
  const isLast = q.index + 1 >= view.question_total;
  const header = <span className={s.pill}>Question {q.index + 1} of {view.question_total}</span>;

  // Leaderboard between questions
  if (boardFor === q.id) {
    return shell(<>
      <h1 className={s.h1}>Leaderboard</h1>
      <ol className={s.board}>{players.slice(0, 5).map((p, i) => (
        <li key={p.id} className={s.boardRow} style={{ animationDelay: `${i * 80}ms` }}>
          <span>{i + 1}</span><span>{p.alias}</span>
          <span className={s.gain}>{p.last_points > 0 ? `+${p.last_points}` : ''}</span>
          <span>{p.score.toLocaleString()}</span>
        </li>
      ))}</ol>
      <button className={s.btn} disabled={busy} onClick={() => void command('classroom_v2_next')}>{isLast ? 'Final results' : 'Next question'}</button>
    </>, header);
  }

  const reveal = remaining <= 0 || everyone;
  const counts = view.choice_counts ?? [];
  const maxCount = Math.max(1, ...counts);
  const secs = Math.ceil(remaining / 1000);

  return shell(<>
    <div className={s.qHead}>
      <div className={s.stat}><b>{view.answered}</b>answered</div>
      {!reveal
        ? <div className={`${s.timer} ${secs <= 5 ? s.timerLow : ''}`} style={{ ['--p' as string]: String(remaining / total) }}><span>{secs}</span></div>
        : <span className={s.pill}>{everyone ? 'Everyone answered' : "Time's up"}</span>}
      <div className={s.stat}><b>{players.length}</b>players</div>
    </div>
    <div className={s.stem}>{q.stem}</div>
    <div className={s.tiles}>
      {q.options.map((opt, i) => {
        const right = i === q.correct_index;
        return (
          <div key={i} className={`${s.tile} ${reveal && !right ? s.dimmed : ''}`}>
            <span className={s.shape}>{SHAPES[i]}</span>
            <span className={s.tileText}>{opt}</span>
            {reveal && <span className={s.count}>{counts[i] ?? 0}</span>}
            {reveal && right && <span className={s.tick} aria-label="correct answer">✓</span>}
            {reveal && <span className={s.bar} style={{ width: `${((counts[i] ?? 0) / maxCount) * 100}%` }} />}
          </div>
        );
      })}
    </div>
    {reveal && q.explanation && <p className={s.explain}>{q.explanation}</p>}
    {reveal && <button className={s.btn} onClick={() => setBoardFor(q.id)}>Show leaderboard</button>}
  </>, header);
}
