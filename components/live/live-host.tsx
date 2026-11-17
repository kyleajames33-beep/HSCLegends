'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { StagingConfig } from '@/lib/classroom-v2/staging-config';
import { LiveError, SAMPLE_SET, SHAPES, liveClient, msRemaining, readTab, rpc, useNow, usePoll, useSession, writeTab, type HostView } from '@/lib/live-game';
import { validateTeacherQuestions } from '@/lib/teacher-question-import.mjs';
import { draftQuestions } from '@/lib/classroom-v2/teacher-drafts.mjs';
import type { QuestionDraft } from '@/lib/classroom-v2';
import { useOnChange, useSound } from '@/lib/live-sound';
import QRCode from 'qrcode';
import { Icon } from './icon';
import Image from 'next/image';
import { BOSSES, BOSS_ORDER, BossBar, BossPanel, ResultArt, bossLeft, emblem } from './boss';
import type { BossSubject } from '@/lib/live-game';
import s from './live.module.css';

type SetSummary = { id: string; name: string; subject: BossSubject | null; count: number; created_at: string };
const SAMPLE_ID = 'sample';
const MAX_SET = 300;

/** Validate a teacher CSV/JSON file with the same rules as /question-import (up to 300 questions). */
function parseFile(fileName: string, text: string): { name: string; questions: QuestionDraft[] } | { errors: string[] } {
  const format = /\.csv$/i.test(fileName) ? 'csv' : /\.json$/i.test(fileName) ? 'json' : null;
  if (!format) return { errors: ['Choose a .csv or .json file.'] };
  try {
    const checked = validateTeacherQuestions(text, format, { maxQuestions: MAX_SET });
    if (!checked.valid || !checked.draft) {
      const errors = checked.results.filter(r => r.errors.length).slice(0, 4).map(r => `Row ${r.row}: ${r.errors.join(' ')}`);
      return { errors: errors.length ? errors : ['The file could not be used.'] };
    }
    const name = fileName.replace(/\.(csv|json)$/i, '').slice(0, 80) || 'Question set';
    return { name, questions: draftQuestions(checked.draft, `teacher-draft-${new Date().toISOString().slice(0, 10)}`) };
  } catch (e) {
    return { errors: [e instanceof Error ? e.message : 'The file could not be used.'] };
  }
}

/** Random selection of `n` questions in random order (unbiased shuffle). */
function draw<T>(pool: readonly T[], n: number): T[] {
  const a = [...pool];
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, Math.min(n, a.length));
}

const ROOM_KEY = 'hsc-live-host-room';

type Report = {
  questions: { index: number; stem: string; options: string[]; correct_index: number; opened: boolean }[];
  players: { alias: string; score: number; answers: { index: number; choice: number; correct: boolean; points: number }[] }[];
};
const LETTERS = 'ABCDEF';
const cell = (v: string | number) => { const t = String(v); return /[",\n\r]/.test(t) || /^[=+\-@]/.test(t) ? `"${t.replace(/^([=+\-@])/, "'$1").replace(/"/g, '""')}"` : t; };
/** One row per student: score, number correct, then their answer to each played question. */
function reportCsv(r: Report): string {
  const played = r.questions.filter(q => q.opened);
  const head = ['Name', 'Score', 'Correct', ...played.map(q => `Q${q.index + 1} (answer ${LETTERS[q.correct_index]}): ${q.stem}`)];
  const rows = r.players.map(p => {
    const by = new Map(p.answers.map(a => [a.index, a]));
    return [p.alias, p.score, `${p.answers.filter(a => a.correct).length}/${played.length}`,
      ...played.map(q => { const a = by.get(q.index); return a ? `${LETTERS[a.choice]} ${a.correct ? 'correct' : 'wrong'}` : 'no answer'; })];
  });
  return [head, ...rows].map(row => row.map(cell).join(',')).join('\r\n') + '\r\n';
}

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
  const client = useMemo(() => liveClient(config, 'host'), [config]);
  const session = useSession(client);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [seconds, setSeconds] = useState<number>(20);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [boardFor, setBoardFor] = useState<string | null>(null); // question id whose leaderboard is showing
  const [origin, setOrigin] = useState('');
  const [library, setLibrary] = useState<SetSummary[] | null>(null);
  const [selected, setSelected] = useState<string>(SAMPLE_ID);
  const [perGame, setPerGame] = useState<number>(10);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [mode, setMode] = useState<'classic' | 'boss'>('boss');
  const [bossSubject, setBossSubject] = useState<BossSubject>('chemistry');

  const loadLibrary = useCallback(async () => {
    try { setLibrary(await rpc<SetSummary[]>(client, 'classroom_v2_set_list', {})); } catch { setLibrary([]); }
  }, [client]);
  useEffect(() => { if (session === 'teacher' && !roomId) void loadLibrary(); }, [session, roomId, loadLibrary]);

  async function pickFile(file: File | undefined) {
    setImportErrors([]);
    if (!file) return;
    if (file.size > 1_000_000) { setImportErrors(['Choose a file under 1 MB.']); return; }
    const parsed = parseFile(file.name, await file.text());
    if ('errors' in parsed) { setImportErrors(parsed.errors); return; }
    setBusy(true);
    try {
      const id = await rpc<string>(client, 'classroom_v2_set_save', { p_name: parsed.name, p_questions: parsed.questions });
      await loadLibrary();
      setSelected(id);
      const subject = parsed.questions[0]?.teacher_draft?.subject;
      if (subject && subject in BOSSES) setBossSubject(subject as BossSubject);
    } catch {
      setImportErrors(['The set could not be saved. Try again.']);
    }
    setBusy(false);
  }

  async function deleteSet(id: string) {
    setConfirmDelete(null);
    try { await rpc<boolean>(client, 'classroom_v2_set_delete', { p_set: id }); } catch { setError('Could not delete that set.'); }
    if (selected === id) setSelected(SAMPLE_ID);
    await loadLibrary();
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

  async function endQuestion(questionId: string) {
    if (!roomId) return;
    setBusy(true); setError('');
    try { await rpc<boolean>(client, 'classroom_v2_game_close', { p_room: roomId, p_question: questionId }); }
    catch { setError('Could not end the question. Try again.'); }
    poll.refresh(); setBusy(false);
  }

  async function downloadReport() {
    if (!roomId) return;
    setError('');
    try {
      const report = await rpc<Report>(client, 'classroom_v2_game_report', { p_room: roomId });
      const blob = new Blob([reportCsv(report)], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `hsc-live-results-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { setError('Could not download the results. Try again.'); }
  }

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
      const pool: readonly QuestionDraft[] = selected === SAMPLE_ID ? SAMPLE_SET : await rpc<QuestionDraft[]>(client, 'classroom_v2_set_get', { p_set: selected });
      const rows = await rpc<{ room_id: string }[]>(client, 'classroom_v2_create', { p_request_id: crypto.randomUUID(), p_questions: draw(pool, perGame), p_seconds: seconds });
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
        <span className={s.row}><button className={`${s.link} ${s.iconRow}`} onClick={sound.toggle} aria-pressed={sound.on} aria-label={sound.on ? 'Sound on. Turn sound off' : 'Sound off. Turn sound on'}><Icon name={sound.on ? 'sound-on' : 'sound-off'} size={22} />{sound.on ? 'On' : 'Off'}</button>{right}</span></header>
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
        {mode === 'boss' && <fieldset className={s.field} style={{ border: 0, padding: 0 }}>
          <legend style={{ marginBottom: 6 }}>Boss</legend>
          <div className={s.bossPick} role="radiogroup" aria-label="Boss">
            {BOSS_ORDER.map(k => (
              <button key={k} role="radio" aria-checked={bossSubject === k} className={`${s.bossOpt} ${bossSubject === k ? s.modeOn : ''}`} onClick={() => setBossSubject(k)}>
                <Image src={emblem(k)} alt="" width={36} height={36} />
                <span><b>{BOSSES[k].name}</b><small>{BOSSES[k].subject}</small></span>
              </button>
            ))}
          </div>
        </fieldset>}
        <p className={s.field} style={{ marginBottom: 6 }}>Questions</p>
        <div className={s.setList} role="radiogroup" aria-label="Question set">
          {[{ id: SAMPLE_ID, name: 'Sample: mixed HSC questions', subject: null, count: SAMPLE_SET.length }, ...(library ?? [])].map(set => (
            <div key={set.id} className={`${s.setRow} ${selected === set.id ? s.modeOn : ''}`}>
              <button role="radio" aria-checked={selected === set.id} className={s.setPick} onClick={() => { setSelected(set.id); if (set.subject) setBossSubject(set.subject); }}>
                {set.subject ? <Image src={emblem(set.subject)} alt="" width={28} height={28} /> : <Icon name="star" size={28} />}
                <span><b>{set.name}</b><small>{set.count} questions{set.id === SAMPLE_ID ? ' · unreviewed sample' : ''}</small></span>
              </button>
              {set.id !== SAMPLE_ID && (confirmDelete === set.id
                ? <button className={s.link} onClick={() => void deleteSet(set.id)}>Confirm delete</button>
                : <button className={s.link} aria-label={`Delete ${set.name}`} onClick={() => setConfirmDelete(set.id)}>Delete</button>)}
            </div>
          ))}
          {library === null && <p className={s.dim}>Loading your sets…</p>}
        </div>
        <label className={`${s.btn} ${s.ghost}`} style={{ fontSize: '.95rem', padding: '10px 14px', margin: '10px 0 6px' }}>
          Upload a question set (CSV or JSON)
          <input type="file" accept=".csv,.json,text/csv,application/json" hidden disabled={busy} onChange={e => { void pickFile(e.target.files?.[0]); e.target.value = ''; }} />
        </label>
        {importErrors.length > 0 && <div className={s.error} role="alert" style={{ marginBottom: 14 }}>{importErrors.map((m, i) => <p key={i}>{m}</p>)}</div>}
        <p className={s.dim} style={{ fontSize: '.85rem', marginBottom: 14 }}>Up to 300 questions per set. Sets are saved to your account, and each game draws a random selection. Get the CSV template on the <a href="/question-import" style={{ textDecoration: 'underline' }}>Question import</a> page.</p>
        {(() => {
          const count = selected === SAMPLE_ID ? SAMPLE_SET.length : (library?.find(x => x.id === selected)?.count ?? 0);
          const choices = [...new Set([5, 10, 15, 20].filter(n => n < count).concat(Math.min(count, 20)))].filter(n => n > 0).sort((a, b) => a - b);
          const value = choices.includes(perGame) ? perGame : choices.at(-1) ?? 1;
          return <label className={s.field}>Questions per game
            <select className={s.input} value={value} onChange={e => setPerGame(Number(e.target.value))}>
              {choices.map(n => <option key={n} value={n}>{n} questions{n === count ? ' (all)' : ''}</option>)}
            </select>
          </label>;
        })()}
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

  if (!view) return shell(poll.error ? <p className={`${s.dim} ${s.iconRow}`}><Icon name="reconnect" size={28} />Reconnecting…</p> : <p className={s.dim}>Loading game…</p>, signOut);

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
          <ResultArt boss={view.boss} won={left === 0}>
            <p className={`${s.banner} ${left === 0 ? s.win : s.lose}`}>{left === 0 ? `${meta.name} defeated!` : `${meta.name} escaped with ${left?.toLocaleString()} HP`}</p>
            <p className={s.resultCaption}>Class damage: {view.boss.damage.toLocaleString()}</p>
          </ResultArt>
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
      <div className={s.row}>
        <button className={`${s.btn} ${s.ghost}`} onClick={() => void downloadReport()}>Download results (CSV)</button>
        <button className={s.btn} onClick={leave}>New game</button>
      </div>
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
    {!reveal && <button className={s.link} disabled={busy} onClick={() => void endQuestion(q.id)}>End question now</button>}
  </>, header);
}
