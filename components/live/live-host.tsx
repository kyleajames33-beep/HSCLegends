'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { StagingConfig } from '@/lib/classroom-v2/staging-config';
import { LiveError, SAMPLE_SET, SHAPES, liveClient, msRemaining, readTab, rpc, useNow, usePoll, useSession, writeTab, type HostView } from '@/lib/live-game';
import { validateTeacherQuestions } from '@/lib/teacher-question-import.mjs';
import { prepareTeacherDraftRequest } from '@/lib/classroom-v2/teacher-drafts.mjs';
import type { QuestionDraft } from '@/lib/classroom-v2';
import { useOnChange, useSound } from '@/lib/live-sound';
import QRCode from 'qrcode';
import { Icon } from './icon';
import { BOSSES, BOSS_ORDER, BossBar, BossPanel, bossLeft } from './boss';
import type { BossSubject } from '@/lib/live-game';
import s from './live.module.css';

type QuestionSet = { name: string; questions: readonly QuestionDraft[] };
const SAMPLE: QuestionSet = { name: 'Sample: 8 mixed HSC questions (unreviewed, for testing)', questions: SAMPLE_SET };

/** Validate a teacher CSV/JSON file with the same rules as /question-import. */
function loadSet(fileName: string, text: string): { set: QuestionSet } | { errors: string[] } {
  const format = /\.csv$/i.test(fileName) ? 'csv' : /\.json$/i.test(fileName) ? 'json' : null;
  if (!format) return { errors: ['Choose a .csv or .json file.'] };
  try {
    const checked = validateTeacherQuestions(text, format);
    if (!checked.valid || !checked.draft) {
      const errors = checked.results.filter(r => r.errors.length).slice(0, 4).map(r => `Row ${r.row}: ${r.errors.join(' ')}`);
      return { errors: errors.length ? errors : ['The file could not be used.'] };
    }
    const revision = `teacher-draft-${new Date().toISOString().slice(0, 10)}`;
    const request = prepareTeacherDraftRequest(JSON.stringify(checked.draft), crypto.randomUUID(), 20, revision);
    return { set: { name: `${fileName} (${request.questions.length} questions, unreviewed)`, questions: request.questions } };
  } catch (e) {
    return { errors: [e instanceof Error && e.message !== 'INVALID_TEACHER_DRAFT' ? e.message : 'The file could not be used.'] };
  }
}

const ROOM_KEY = 'hsc-live-host-room';

/** QR code for the join link, rendered locally as SVG (no network). */
function JoinQr({ url }: { url: string }) {
  const [svg, setSvg] = useState('');
  useEffect(() => {
    let alive = true;
    QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#0e1020', light: '#ffffff' } })
      .then(out => { if (alive) setSvg(out); }).catch(() => {});
    return () => { alive = false; };
  }, [url]);
  return svg ? <div className={s.qr} aria-label="QR code to join" role="img" dangerouslySetInnerHTML={{ __html: svg }} /> : null;
}
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
  const [questionSet, setQuestionSet] = useState<QuestionSet>(SAMPLE);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [mode, setMode] = useState<'classic' | 'boss'>('boss');
  const [bossSubject, setBossSubject] = useState<BossSubject>('chemistry');

  async function pickFile(file: File | undefined) {
    setImportErrors([]);
    if (!file) return;
    if (file.size > 1_000_000) { setImportErrors(['Choose a file under 1 MB.']); return; }
    const result = loadSet(file.name, await file.text());
    if ('set' in result) {
      setQuestionSet(result.set);
      const subject = result.set.questions[0]?.teacher_draft?.subject;
      if (subject && subject in BOSSES) setBossSubject(subject as BossSubject);
    } else { setImportErrors(result.errors); setQuestionSet(SAMPLE); }
  }

  useEffect(() => { setOrigin(window.location.origin); setRoomId(readTab<string>(ROOM_KEY)); }, []);

  const fetcher = useMemo(
    () => (roomId && session === 'teacher' ? () => rpc<HostView>(client, 'classroom_v2_game_host', { p_room: roomId }) : null),
    [client, roomId, session],
  );
  const poll = usePoll(fetcher, 1000);
  const now = useNow(200);
  const view = poll.data;
  const sound = useSound('host', true);

  // Sound cues, derived from what the projector is showing.
  const hq = view?.question ?? null;
  const hLeft = msRemaining(view?.closes_at ?? null, now, poll.offset);
  const hAll = !!view && view.players.length > 0 && view.answered >= view.players.length;
  const phaseKey = !view ? null : view.state === 'lobby' ? 'lobby' : view.state === 'complete' ? 'complete'
    : !hq ? null : boardFor === hq.id ? `board-${hq.id}` : hLeft <= 0 || hAll ? `reveal-${hq.id}` : `q-${hq.id}`;
  useOnChange(phaseKey, () => {
    if (phaseKey?.startsWith('q-')) sound.cue('start');
    else if (phaseKey?.startsWith('reveal-')) sound.cue('reveal');
    else if (phaseKey === 'complete') sound.cue('fanfare');
  });
  useOnChange(view?.state === 'lobby' ? String(view.players.length) : null, () => sound.cue('join'));
  const tickSecs = Math.ceil(hLeft / 1000);
  useOnChange(phaseKey?.startsWith('q-') ? `${phaseKey}-${tickSecs}` : null, () => { if (tickSecs > 0 && tickSecs <= 5) sound.cue('tick'); });

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
      const rows = await rpc<{ room_id: string }[]>(client, 'classroom_v2_create', { p_request_id: crypto.randomUUID(), p_questions: questionSet.questions, p_seconds: seconds });
      const id = rows?.[0]?.room_id;
      if (!id) throw new LiveError('UNKNOWN');
      if (mode === 'boss') {
        const ok = await rpc<boolean>(client, 'classroom_v2_game_configure', { p_room: id, p_mode: 'boss', p_boss: bossSubject }).catch(() => false);
        if (!ok) setError('The game was created, but Boss Battle could not be switched on. It will run as a classic game.');
      }
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

  const shell = (body: React.ReactNode, right?: React.ReactNode, backdrop = false) => (
    <div className={`${s.stage} ${backdrop ? s.lobbyArt : ''}`}>
      <header className={s.top}><span className={s.brand}><b>HSC Legends</b> · Live</span>
        <span className={s.row}><button className={s.link} onClick={sound.toggle} aria-pressed={sound.on}>Sound {sound.on ? 'on' : 'off'}</button>{right}</span></header>
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
        <div className={s.modePick} role="radiogroup" aria-label="Game mode">
          <button role="radio" aria-checked={mode === 'boss'} className={`${s.modeBtn} ${mode === 'boss' ? s.modeOn : ''}`} onClick={() => setMode('boss')}>Boss Battle<small>The class teams up to take down a boss</small></button>
          <button role="radio" aria-checked={mode === 'classic'} className={`${s.modeBtn} ${mode === 'classic' ? s.modeOn : ''}`} onClick={() => setMode('classic')}>Classic<small>Everyone for themselves</small></button>
        </div>
        {mode === 'boss' && <label className={s.field}>Boss
          <select className={s.input} value={bossSubject} onChange={e => setBossSubject(e.target.value as BossSubject)}>
            {BOSS_ORDER.map(k => <option key={k} value={k}>{BOSSES[k].name} ({BOSSES[k].subject})</option>)}
          </select>
        </label>}
        <p className={s.field} style={{ marginBottom: 4 }}>Questions</p>
        <p className={s.dim} style={{ marginBottom: 10 }}>{questionSet.name}</p>
        <div className={s.row} style={{ justifyContent: 'flex-start', marginBottom: 14 }}>
          <label className={`${s.btn} ${s.ghost}`} style={{ fontSize: '.95rem', padding: '10px 14px' }}>
            Use my own file (CSV or JSON)
            <input type="file" accept=".csv,.json,text/csv,application/json" hidden onChange={e => { void pickFile(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
          {questionSet !== SAMPLE && <button className={s.link} onClick={() => { setQuestionSet(SAMPLE); setImportErrors([]); }}>Use sample instead</button>}
        </div>
        {importErrors.length > 0 && <div className={s.error} role="alert" style={{ marginBottom: 14 }}>{importErrors.map((m, i) => <p key={i}>{m}</p>)}</div>}
        <p className={s.dim} style={{ fontSize: '.85rem', marginBottom: 14 }}>Up to 20 questions per game. Get the CSV template and check a file on the <a href="/question-import" style={{ textDecoration: 'underline' }}>Question import</a> page.</p>
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
        <div className={s.codeWrap}>
          <div className={s.bigCode}>{view.short_code}</div>
          {origin && <JoinQr url={`${origin}/live?code=${view.short_code}`} />}
        </div>
      </div>
      <div className={view.boss ? s.lobbyGrid : undefined} style={view.boss ? undefined : { display: 'contents' }}>
        <div className={s.main} style={{ gap: 16 }}>
          <p className={`${s.h2} ${s.iconRow}`}><Icon name="players-group" size={32} />{players.length} {players.length === 1 ? 'player' : 'players'}</p>
          <div className={s.names}>{players.length === 0 ? <p className={s.dim}>Waiting for players…</p> : players.map(p => <span key={p.id} className={s.name}>{p.alias}</span>)}</div>
          <div className={s.row}>
            <button className={s.btn} disabled={busy || players.length === 0} onClick={() => void command('classroom_v2_start')}>{view.boss ? 'Start the battle' : 'Start game'}</button>
          </div>
        </div>
        {view.boss && <BossPanel boss={view.boss} size={240} caption="Your class vs" />}
      </div>
      <p className={s.dim}>Testing on your own? Open <b>{origin}/live</b> in another tab. Each tab is a separate player.</p>
    </>, endBtn, true);
  }

  // Podium
  if (view.state === 'complete') {
    const [first, second, third] = players;
    return shell(<>
      {view.boss && (() => {
        const left = bossLeft(view.boss);
        const meta = BOSSES[view.boss.subject];
        return <>
          <p className={`${s.banner} ${left === 0 ? s.win : s.lose}`}>{left === 0 ? `${meta.name} defeated!` : `${meta.name} escaped with ${left?.toLocaleString()} HP`}</p>
          <BossPanel boss={view.boss} size={100} caption={`Class damage: ${view.boss.damage.toLocaleString()}`} />
        </>;
      })()}
      <h1 className={`${s.h1} ${s.iconRow}`}><Icon name="trophy" size={48} />{view.boss ? 'Top damage dealers' : 'Final results'}</h1>
      <div className={s.podium}>
        {[{ p: second, cls: s.block2, n: 2 }, { p: first, cls: s.block1, n: 1 }, { p: third, cls: s.block3, n: 3 }].map(({ p, cls, n }) => (
          <div key={n} className={s.step}>
            {n === 1 && p && <Icon name="crown" size={56} label="Winner" />}
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
      {view.boss && <div style={{ width: '100%', maxWidth: 720 }}><BossBar boss={view.boss} /></div>}
      <h1 className={s.h1}>{view.boss ? 'Top damage dealers' : 'Leaderboard'}</h1>
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
    {view.boss && !reveal && <BossBar boss={view.boss} />}
    {view.boss && reveal
      ? <div className={s.revealRow}>
          <BossPanel boss={view.boss} size={130} hit caption={bossLeft(view.boss) === 0 ? 'Defeated!' : `Class hit for ${view.boss.round_damage.toLocaleString()} this round`} />
          <div className={s.stem}>{q.stem}</div>
        </div>
      : <div className={s.stem}>{q.stem}</div>}
    <div className={s.tiles}>
      {q.options.map((opt, i) => {
        const right = i === q.correct_index;
        return (
          <div key={i} className={`${s.tile} ${reveal && !right ? s.dimmed : ''}`}>
            <span className={s.shape}>{SHAPES[i]}</span>
            <span className={s.tileText}>{opt}</span>
            {reveal && <span className={s.count}>{counts[i] ?? 0}</span>}
            {reveal && right && <span className={s.tick}><Icon name="correct-tick" size={40} label="Correct answer" /></span>}
            {reveal && <span className={s.bar} style={{ width: `${((counts[i] ?? 0) / maxCount) * 100}%` }} />}
          </div>
        );
      })}
    </div>
    {reveal && q.explanation && <p className={s.explain}>{q.explanation}</p>}
    {reveal && <button className={s.btn} onClick={() => setBoardFor(q.id)}>Show leaderboard</button>}
  </>, header);
}
