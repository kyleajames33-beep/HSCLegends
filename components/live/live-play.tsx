'use client';

import { useEffect, useMemo, useState } from 'react';
import type { StagingConfig } from '@/lib/classroom-v2/staging-config';
import { LiveError, SHAPES, liveClient, msRemaining, ordinal, readTab, rpc, useNow, usePoll, useSession, writeTab, type PlayerView } from '@/lib/live-game';
import { useOnChange, useSound } from '@/lib/live-sound';
import s from './live.module.css';

const SEAT_KEY = 'hsc-live-seat';
type Seat = { roomId: string; playerId: string };

/** Student phone screen for a live classroom game (staging). */
export default function LivePlay({ config }: { config: StagingConfig }) {
  const client = useMemo(() => liveClient(config), [config]);
  const session = useSession(client);
  const [seat, setSeat] = useState<Seat | null>(null);
  const [code, setCode] = useState('');
  const [alias, setAlias] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sending, setSending] = useState<{ questionId: string; choice: number } | null>(null);

  useEffect(() => {
    setSeat(readTab<Seat>(SEAT_KEY));
    const fromUrl = new URLSearchParams(window.location.search).get('code');
    if (fromUrl) setCode(fromUrl.toUpperCase().slice(0, 6));
  }, []);

  const fetcher = useMemo(
    () => (seat && (session === 'guest' || session === 'teacher')
      ? () => rpc<PlayerView>(client, 'classroom_v2_game_player', { p_room: seat.roomId, p_player: seat.playerId })
      : null),
    [client, seat, session],
  );
  const poll = usePoll(fetcher, 1000);
  const now = useNow(200);
  const view = poll.data;
  const sound = useSound('player', false);

  // Sound cues for the result and final screens.
  const pq = view?.question ?? null, pr = view?.receipt ?? null;
  const pLeft = msRemaining(view?.closes_at ?? null, now, poll.offset);
  const pAll = !!view && view.player_count > 0 && view.answered >= view.player_count;
  const resultKey = !view ? null : view.state === 'complete' ? 'complete'
    : view.state === 'active' && pq && (pLeft <= 0 || (pr && pAll)) ? `result-${pq.id}` : 'other';
  useOnChange(resultKey, () => {
    if (resultKey === 'complete') sound.cue(view && view.rank <= 3 ? 'fanfare' : 'reveal');
    else if (resultKey?.startsWith('result-')) sound.cue(pr?.correct ? 'correct' : 'wrong');
  });

  useEffect(() => {
    if (poll.error === 'ROOM_UNAVAILABLE' || poll.error === 'FORBIDDEN') { writeTab(SEAT_KEY, null); setSeat(null); setError('That game has ended or is no longer available.'); }
  }, [poll.error]);

  // A session that disappears (e.g. storage cleared) cannot keep its seat.
  useEffect(() => { if (session === 'signed-out' && seat) { writeTab(SEAT_KEY, null); setSeat(null); } }, [session, seat]);

  async function join() {
    setBusy(true); setError('');
    try {
      if (session === 'signed-out' || session === 'checking') {
        const { error: e } = await client.auth.signInAnonymously();
        if (e) throw new LiveError('UNKNOWN');
      }
      const rows = await rpc<{ room_id: string; player_id: string }[]>(client, 'classroom_v2_game_join', { p_code: code.trim(), p_alias: alias.trim() });
      const row = rows?.[0];
      if (!row) throw new LiveError('UNKNOWN');
      const next = { roomId: row.room_id, playerId: row.player_id };
      writeTab(SEAT_KEY, next); setSeat(next);
    } catch (e) {
      const c = e instanceof LiveError ? e.code : 'UNKNOWN';
      setError(c === 'ROOM_UNAVAILABLE' ? "We couldn't find that game. Check the code. You can only join before the game starts."
        : c === 'INVALID_ALIAS' ? 'Pick a name between 1 and 40 characters.'
        : 'Could not join. Check your connection and try again.');
    }
    setBusy(false);
  }

  async function answer(questionId: string, choice: number) {
    if (!seat || sending?.questionId === questionId) return;
    setSending({ questionId, choice }); setError(''); sound.cue('lock');
    try {
      await rpc(client, 'classroom_v2_answer', { p_room: seat.roomId, p_player: seat.playerId, p_question: questionId, p_choice: choice });
    } catch (e) {
      const c = e instanceof LiveError ? e.code : 'UNKNOWN';
      setError(c === 'OUTSIDE_WINDOW' ? 'Too late, time was up.' : c === 'STALE_QUESTION' ? 'The game moved on.' : 'Your answer did not go through. Try again.');
      setSending(null);
    }
    poll.refresh();
  }

  const leave = () => { writeTab(SEAT_KEY, null); setSeat(null); setSending(null); };

  const shell = (body: React.ReactNode, right?: React.ReactNode) => (
    <div className={s.stage}>
      <header className={s.top}><span className={s.brand}><b>HSC Legends</b> · Live</span>
        <span className={s.row}><button className={s.link} onClick={sound.toggle} aria-pressed={sound.on}>Sound {sound.on ? 'on' : 'off'}</button>{right}</span></header>
      <main className={`${s.main}`}>{body}{error && <p className={`${s.error} ${s.narrow}`} role="alert">{error}</p>}</main>
    </div>
  );

  if (session === 'checking') return shell(<p className={s.dim}>Loading…</p>);

  if (!seat) {
    const ready = /^[A-HJKMNP-Za-hjkmnp-z2-9]{6}$/.test(code.trim()) && alias.trim().length > 0;
    return shell(
      <div className={`${s.card} ${s.narrow}`}>
        <h1 className={s.h2}>Join a game</h1>
        <label className={s.field}>Game code
          <input className={`${s.input} ${s.code}`} value={code} maxLength={6} autoCapitalize="characters" autoComplete="off" spellCheck={false}
            onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} placeholder="ABC234" />
        </label>
        <label className={s.field}>Your name
          <input className={s.input} value={alias} maxLength={40} onChange={e => setAlias(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && ready) void join(); }} placeholder="Nickname" />
        </label>
        <button className={`${s.btn} ${s.block}`} disabled={busy || !ready} onClick={() => void join()}>Join</button>
        <p className={`${s.dim} ${s.center}`} style={{ marginTop: 12 }}>The code is on your teacher&apos;s screen.</p>
      </div>,
    );
  }

  if (!view) return shell(<p className={s.dim}>{poll.error ? 'Reconnecting…' : 'Joining…'}</p>);

  const scorePill = <span className={s.pill}>{view.alias} · {view.score.toLocaleString()}</span>;

  if (view.state === 'lobby') {
    return shell(<div className={`${s.narrow} ${s.center}`}>
      <div className={`${s.result} ${s.neutral}`}>
        <p className={s.dim}>You&apos;re in!</p>
        <p className={s.points}>{view.alias}</p>
        <p className={s.dim}>Look for your name on the big screen. The game starts soon.</p>
      </div>
      <button className={s.link} style={{ marginTop: 16 }} onClick={leave}>Leave game</button>
    </div>, scorePill);
  }

  if (view.state === 'complete') {
    return shell(<div className={`${s.narrow} ${s.center}`}>
      <div className={`${s.result} ${view.rank <= 3 ? s.good : s.neutral}`}>
        <p>Final place</p>
        <p className={s.points}>{ordinal(view.rank)}</p>
        <p>of {view.player_count} · {view.score.toLocaleString()} points</p>
      </div>
      <button className={`${s.btn} ${s.ghost}`} style={{ marginTop: 16 }} onClick={leave}>Join another game</button>
    </div>, scorePill);
  }

  const q = view.question;
  if (!q) return shell(<p className={s.dim}>Get ready…</p>, scorePill);
  const remaining = msRemaining(view.closes_at, now, poll.offset);
  const r = view.receipt;
  const everyone = view.player_count > 0 && view.answered >= view.player_count;
  const header = <span className={s.pill}>{q.index + 1}/{view.question_total} · {Math.ceil(remaining / 1000)}s</span>;

  // Answering
  if (!r && remaining > 0) {
    const pending = sending?.questionId === q.id ? sending.choice : null;
    return shell(<>
      <p className={`${s.stem}`} style={{ fontSize: 'clamp(1.1rem, 4.5vw, 1.6rem)', padding: 18 }}>{q.stem}</p>
      <div className={s.tiles}>
        {q.options.map((opt, i) => (
          <button key={i} className={`${s.tile} ${pending !== null && pending !== i ? s.dimmed : ''} ${pending === i ? s.chosen : ''}`}
            disabled={pending !== null} onClick={() => void answer(q.id, i)}>
            <span className={s.shape}>{SHAPES[i]}</span><span className={s.tileText}>{opt}</span>
          </button>
        ))}
      </div>
    </>, header);
  }

  // Answered, waiting for the rest of the class
  if (r && remaining > 0 && !everyone) {
    return shell(<div className={`${s.narrow} ${s.center}`}>
      <div className={`${s.result} ${s.neutral}`}>
        <p className={s.points}>Locked in</p>
        <p className={s.dim}>Waiting for everyone else… ({view.answered}/{view.player_count})</p>
      </div>
    </div>, header);
  }

  // Result (or time ran out)
  return shell(<div className={`${s.narrow} ${s.center}`}>
    {!r ? (
      <div className={`${s.result} ${s.bad}`}>
        <p className={s.points}>Time&apos;s up</p>
        <p>No answer this round.</p>
      </div>
    ) : r.correct ? (
      <div className={`${s.result} ${s.good}`}>
        <p>Correct</p>
        <p className={s.points}>+{r.points}</p>
        {view.streak >= 2 && <p>{view.streak} in a row</p>}
      </div>
    ) : (
      <div className={`${s.result} ${s.bad}`}>
        <p className={s.points}>Not quite</p>
        <p>Answer: {q.options[r.correct_index]}</p>
      </div>
    )}
    <p className={s.h2} style={{ marginTop: 20 }}>{ordinal(view.rank)} of {view.player_count}</p>
    <p className={s.dim}>{view.score.toLocaleString()} points</p>
    {r?.explanation && <p className={s.explain} style={{ marginTop: 12 }}>{r.explanation}</p>}
  </div>, scorePill);
}
