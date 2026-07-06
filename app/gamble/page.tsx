'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/lib/use-user';
import { getQuizQuestions, SUBJECTS, type Subject } from '@/lib/questions';
import { useJuice, TimerBar, atEvent } from '@/components/juice';
import MathText from '@/components/math-text';
import AnswerTile from '@/components/answer-tile';
import {
  gambleQuickJoin, gambleJoin, gambleRejoin, gambleState, gambleMe, gambleSubmit, gambleDecide, gambleLeaderboard,
  gambleStart, gambleAdvance, gambleGetPartner, gambleAssignPairs, gambleDecideDefault, gambleBotDecide,
  gamblePopulateQuestions, gambleGetResult,
  subscribeGamble,
  type GambleState, type GambleMe, type GambleResultRow, type GambleLeader,
} from '@/lib/gamble';
import { PartnerCard, PotDisplay, DecisionButton, RevealCard } from '@/components/gamble-ui';
import { startHeartbeat, saveArenaSession, loadArenaSession, clearArenaSession, type ArenaSession } from '@/lib/presence';

type Phase = 'pick' | 'loading' | 'lobby' | 'play' | 'finished';
type RoundPhase = 'question' | 'decision' | 'reveal';

const TOTAL_ROUNDS = 6;
const DECISION_SECONDS = 5;
const REVEAL_SECONDS = 4; // the reveal is the payoff — give it time to land

// Casino-felt shell — same family as the Heist vault, its own wine-dark mood.
const FELT = 'linear-gradient(165deg,#171021 0%,#31203f 55%,#8a4a3f 140%)';

function Table({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <main className="flex flex-1 flex-col w-full text-white" style={{ background: FELT }}>
      <div
        className={`flex flex-1 flex-col w-full mx-auto px-6 pt-12 pb-10 ${
          wide ? 'max-w-md lg:max-w-5xl lg:px-10' : 'max-w-md'
        }`}
      >
        {children}
      </div>
    </main>
  );
}

export default function GamblePage() {
  const sb = useMemo(() => createClient(), []);
  const { user } = useUser();
  const juice = useJuice();

  // Lobby/room state
  const [phase, setPhase] = useState<Phase>('pick');
  const [err, setErr] = useState('');
  const [alias, setAlias] = useState('');
  const [subject, setSubject] = useState<Subject>('biology');
  const [year, setYear] = useState<11 | 12>(12);
  const [code, setCode] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [resume, setResume] = useState<ArenaSession | null>(null);

  // Game state
  const [room, setRoom] = useState('');
  const [player, setPlayer] = useState('');
  const [st, setSt] = useState<GambleState | null>(null);
  const [me, setMe] = useState<GambleMe | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [leaders, setLeaders] = useState<GambleLeader[]>([]);
  const [busy, setBusy] = useState(false);

  // Round state
  const [roundPhase, setRoundPhase] = useState<RoundPhase>('question');
  const [answered, setAnswered] = useState<{ correct: boolean; correct_index: number; points_earned: number } | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [partner, setPartner] = useState('');
  const [partnerAlias, setPartnerAlias] = useState('');
  const [myChoice, setMyChoice] = useState<'share' | 'steal' | null>(null);
  const [lastReveal, setLastReveal] = useState<GambleResultRow | null>(null);

  // Refs for async operations
  const subRef = useRef<(() => void) | null>(null);
  const hbRef = useRef<(() => void) | null>(null);
  const drive = useRef({ st: null as GambleState | null, room: '', clock: 0 });
  const ansRound = useRef(-1);
  const decideRound = useRef(-1);
  const defaultedRound = useRef(-1);      // my auto-SHARE fired for this round
  const partnerDefaultedRound = useRef(-1); // partner failsafe auto-SHARE fired
  const advancedRound = useRef(-1);       // gambleAdvance fired after this round's reveal
  const botRound = useRef(-1);            // bot decision fired for this round
  const seenRound = useRef(-1);           // per-round state reset tracker
  const revealAt = useRef(0);             // when the reveal hit this client (min display time)
  const lastPoll = useRef(0);             // throttle for the reveal fallback poll
  const syncRef = useRef<(rm?: string, pid?: string) => Promise<void>>(() => Promise.resolve());

  useEffect(() => {
    if (user && !alias) setAlias((user.email ?? '').split('@')[0].slice(0, 16));
  }, [user, alias]);

  useEffect(() => () => {
    subRef.current?.();
    hbRef.current?.();
  }, []);

  useEffect(() => {
    setResume(loadArenaSession('gamble'));
  }, []);

  async function rejoin(s: ArenaSession) {
    setBusy(true);
    setErr('');
    try {
      const r = await gambleRejoin(sb, s.code, s.alias);
      if (!r) throw new Error('Could not find your player in that game.');
      setAlias(s.alias);
      setCode(s.code);
      setResume(null);
      await enter(r.room_id, r.player_id);
    } catch (e) {
      clearArenaSession('gamble');
      setResume(null);
      setErr(msg(e));
    } finally {
      setBusy(false);
    }
  }

  async function sync(rm = room, pid = player) {
    if (!rm) return;
    const s = await gambleState(sb, rm);
    setSt(s);
    if (pid) {
      const myMe = await gambleMe(sb, pid);
      setMe(myMe);
    }
    if (s.status === 'finished') {
      clearArenaSession('gamble');
      const lbs = await gambleLeaderboard(sb);
      setLeaders(lbs);
    }
  }

  syncRef.current = sync;

  // Self-driving clock. The server room row (round, round_started_at) is the
  // source of truth; this drives the local question → decision → reveal flow
  // and fires the idempotent server nudges (defaults, advance) on schedule.
  useEffect(() => {
    const tick = setInterval(() => {
      const ms = Date.now();
      setNow(ms);
      const d = drive.current;
      if (!d.st || !d.room || d.st.status !== 'active') return;

      const roundSecs = (ms - new Date(d.st.round_started_at || 0).getTime()) / 1000;

      // Question time up → decision phase (even if you didn't answer: the
      // partner may have staked points, and you can still share or steal).
      if (roundSecs >= d.st.per_q_seconds && roundPhase === 'question') {
        setRoundPhase('decision');
      }

      if (roundPhase === 'decision') {
        // My side: default to SHARE when the window closes without a choice.
        if (roundSecs >= d.st.per_q_seconds + DECISION_SECONDS && !myChoice && defaultedRound.current !== d.st.round) {
          defaultedRound.current = d.st.round;
          gambleDecideDefault(sb, player, d.room, d.st.round).then(() => setMyChoice('share')).catch(() => {});
        }
        // Partner failsafe: if they dropped, either client may default them
        // after a grace period so the reveal can't stall. Idempotent server-side.
        if (roundSecs >= d.st.per_q_seconds + DECISION_SECONDS + 2 && partner && partnerDefaultedRound.current !== d.st.round) {
          partnerDefaultedRound.current = d.st.round;
          gambleDecideDefault(sb, partner, d.room, d.st.round).catch(() => {});
        }
        // Reveal fallback: if the realtime insert was missed, poll for it.
        if (roundSecs >= d.st.per_q_seconds + DECISION_SECONDS + 3 && !lastReveal && ms - lastPoll.current > 1000) {
          lastPoll.current = ms;
          gambleGetResult(sb, d.room, d.st.round).then((row) => {
            if (row && (row.player_a_id === player || row.player_b_id === player)) {
              revealAt.current = Date.now();
              setLastReveal(row);
              setRoundPhase('reveal');
            }
          }).catch(() => {});
        }
        // No partner this round (odd join timing) → just move the round along.
        if (roundSecs >= d.st.per_q_seconds + DECISION_SECONDS + 6 && !partner && advancedRound.current !== d.st.round) {
          advancedRound.current = d.st.round;
          gambleAdvance(sb, d.room, d.st.round + 1).catch(() => {});
        }
      }

      // After the reveal has been on screen long enough, advance the room.
      // gamble_advance is idempotent and finishes the room past the last round.
      if (roundPhase === 'reveal' && lastReveal && revealAt.current &&
          ms - revealAt.current >= REVEAL_SECONDS * 1000 && advancedRound.current !== lastReveal.round) {
        advancedRound.current = lastReveal.round;
        gambleAdvance(sb, d.room, lastReveal.round + 1).catch(() => {});
      }
    }, 250);
    return () => clearInterval(tick);
    // sb is a stable useMemo instance — deliberately not a dep.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundPhase, myChoice, player, partner, room, lastReveal]);

  // Server round changed → reset all per-round local state.
  useEffect(() => {
    if (!st || seenRound.current === st.round) return;
    seenRound.current = st.round;
    setRoundPhase('question');
    setAnswered(null);
    setPicked(null);
    setMyChoice(null);
    setLastReveal(null);
    setPartner('');
    setPartnerAlias('');
    revealAt.current = 0;
  }, [st?.round]);

  // Sync state when it changes
  useEffect(() => {
    syncRef.current(room, player);
  }, [room, player]);

  // Update drive state
  useEffect(() => {
    if (st) drive.current.st = st;
    if (room) drive.current.room = room;
  }, [st, room]);

  // Phase transitions
  useEffect(() => {
    if (!st) return;
    if (st.status === 'finished') {
      setPhase('finished');
    } else if (st.status === 'active' && (phase === 'lobby' || phase === 'loading')) {
      setPhase('play');
    }
  }, [st?.status, phase]);

  async function enter(roomId: string, playerId: string) {
    setRoom(roomId);
    setPlayer(playerId);
    saveArenaSession('gamble', { code, alias, room: roomId, player: playerId });
    setPhase('lobby');

    hbRef.current = startHeartbeat(sb, 'gamble', playerId);

    subRef.current?.();
    subRef.current = subscribeGamble(
      sb, roomId,
      () => syncRef.current(roomId, playerId),
      (row) => {
        // Only my pair's reveal matters to this client.
        if (row.player_a_id !== playerId && row.player_b_id !== playerId) return;
        const mine = row.player_a_id === playerId ? row.points_a : row.points_b;
        revealAt.current = Date.now();
        setLastReveal(row);
        setRoundPhase('reveal');
        juice.flash(row.outcome === 'both_share' ? 'gold' : 'red');
        juice.burst({ tone: mine > 0 ? 'green' : 'red' });
      },
    );

    await sync(roomId, playerId);
  }

  // Quick match: create/join a lobby and load questions, but DON'T start —
  // the lobby shows the code so a second device can join, then anyone starts.
  async function start(subj: Subject, yr: 11 | 12) {
    setPhase('loading');
    setErr('');
    try {
      const res = await gambleQuickJoin(sb, subj, yr, alias.trim());
      setCode(res.code);

      const questions = await getQuizQuestions(sb, { subject: subj, year: yr, count: TOTAL_ROUNDS });
      if (!questions.length) throw new Error(`No ${subj} Year ${yr} questions found.`);
      await gamblePopulateQuestions(sb, res.room_id, questions.map((q) => ({
        stem: q.stem, options: q.options, correct_index: q.correct_index,
      })));

      await enter(res.room_id, res.player_id);
    } catch (e) {
      setErr(msg(e));
      setPhase('pick');
    }
  }

  async function startMatch() {
    setBusy(true);
    try {
      await gambleStart(sb, room);
      await sync(room, player);
    } catch (e) {
      setErr(msg(e));
    } finally {
      setBusy(false);
    }
  }

  async function joinByCode() {
    setPhase('loading');
    setErr('');
    try {
      const res = await gambleJoin(sb, joinCode, alias.trim());
      setCode(joinCode);
      await enter(res.room_id, res.player_id);
    } catch (e) {
      setErr(msg(e));
      setPhase('pick');
    }
  }

  function reset() {
    subRef.current?.(); subRef.current = null;
    hbRef.current?.(); hbRef.current = null;
    clearArenaSession('gamble');
    setRoom(''); setPlayer(''); setSt(null); setMe(null); setLeaders([]);
    setCode(''); setJoinCode(''); setErr('');
    setAnswered(null); setPicked(null); setMyChoice(null); setLastReveal(null);
    setPartner(''); setPartnerAlias('');
    setRoundPhase('question');
    ansRound.current = -1; decideRound.current = -1; defaultedRound.current = -1;
    partnerDefaultedRound.current = -1; advancedRound.current = -1; botRound.current = -1;
    seenRound.current = -1; revealAt.current = 0;
    drive.current = { st: null, room: '', clock: 0 };
    setPhase('pick');
  }

  // Assign partners at the start of each round (idempotent server-side).
  const pairingRound = useRef(-1);
  useEffect(() => {
    if (phase !== 'play' || !st || st.status !== 'active' || !player || !room || pairingRound.current === st.round) return;

    (async () => {
      try {
        await gambleAssignPairs(sb, room, st.round);
        const partnerInfo = await gambleGetPartner(sb, player, room, st.round);
        if (partnerInfo) {
          pairingRound.current = st.round;
          setPartner(partnerInfo.partner_id);
          setPartnerAlias(partnerInfo.alias);
        }
      } catch (e) {
        console.error('Failed to assign pairs:', msg(e));
      }
    })();
  }, [phase, st?.round, st?.status, player, room]);

  // Bot partners lock their (deterministic, server-rolled) choice once the
  // decision phase opens. Runs on whichever client is paired with the bot.
  useEffect(() => {
    if (roundPhase !== 'decision' || !st || !partner || partnerAlias !== 'Bot' || botRound.current === st.round) return;
    botRound.current = st.round;
    gambleBotDecide(sb, partner, room, st.round, player).catch(() => {});
    // sb stable; st.round covers the st read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundPhase, st?.round, partner, partnerAlias, room, player]);

  async function submitAnswer(choice: number) {
    if (ansRound.current === st?.round || !st) return;
    setBusy(true);
    try {
      setPicked(choice);
      const res = await gambleSubmit(sb, player, room, st.round, choice);
      setAnswered(res);
      ansRound.current = st.round;
      juice[res.correct ? 'correct' : 'wrong'](`${res.points_earned}`, atEvent({ clientX: window.innerWidth / 2, clientY: window.innerHeight / 2 }));
      await sync(room, player);
    } catch (e) {
      setErr(msg(e));
    } finally {
      setBusy(false);
    }
  }

  async function submitChoice(choice: 'share' | 'steal') {
    if (decideRound.current === st?.round || !st || !partner) return;
    setBusy(true);
    try {
      await gambleDecide(sb, player, room, st.round, partner, choice);
      setMyChoice(choice);
      decideRound.current = st.round;
      // Server reveals once both players lock.
    } catch (e) {
      setErr(msg(e));
    } finally {
      setBusy(false);
    }
  }

  const remainingTime = st?.round_started_at
    ? Math.max(0, (st.per_q_seconds || 18) - Math.floor((now - new Date(st.round_started_at).getTime()) / 1000))
    : st?.per_q_seconds || 18;

  // ── PICK ──
  if (phase === 'pick') {
    return (
      <Table>
        <h1 className="text-3xl font-display font-extrabold">🤝 Trust or Bust 💰</h1>
        <p className="text-white/60 mt-1 text-sm">
          Ace the question to build the pot — then look your partner in the eye and choose:
          <b className="text-white/90"> SHARE</b> the winnings, or <b className="text-white/90">STEAL</b> the lot. Both steal? The pot burns. 🔥
        </p>

        {resume && (
          <button onClick={() => rejoin(resume)} disabled={busy}
            className="mt-5 w-full rounded-2xl border border-gold/60 bg-gold/20 px-4 py-3 text-left active:translate-y-0.5 disabled:opacity-40">
            <span className="font-display font-extrabold text-gold">↩️ Rejoin game {resume.code}</span>
            <span className="block text-sm text-white/70">Pick up where you left off as {resume.alias} — your points are safe.</span>
          </button>
        )}

        <input value={alias} onChange={(e) => setAlias(e.target.value.slice(0, 16))} placeholder="Your name" maxLength={16}
          className="mt-5 w-full rounded-xl bg-white/10 border border-white/20 px-4 py-3 text-white placeholder-white/40 outline-none focus:border-white/50" />
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {SUBJECTS.map((s) => (
            <button key={s.id} onClick={() => setSubject(s.id)}
              className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-semibold ${subject === s.id ? 'bg-white text-ink' : 'bg-white/10 text-white/80'}`}>
              {s.label}
            </button>
          ))}
        </div>
        <div className="mt-2 flex gap-2">
          {[11, 12].map((y) => (
            <button key={y} onClick={() => setYear(y as 11 | 12)}
              className={`rounded-full px-3 py-1 text-sm font-semibold ${year === y ? 'bg-gold text-ink' : 'bg-white/10 text-white/80'}`}>
              Year {y}
            </button>
          ))}
        </div>

        <button onClick={() => start(subject, year)} disabled={busy || !alias.trim()}
          className="mt-6 w-full rounded-2xl bg-gold text-ink px-6 py-5 text-lg font-display font-extrabold active:translate-y-0.5 disabled:opacity-40"
          style={{ boxShadow: '0 4px 0 #a87f3f' }}>
          🎲 Quick Match
        </button>

        <div className="mt-4 flex gap-2">
          <input value={joinCode} onChange={(e) => setJoinCode(e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 6))} placeholder="CODE"
            className="flex-1 rounded-xl bg-white/10 border border-white/20 px-4 py-2.5 tracking-[0.2em] text-white placeholder-white/40 outline-none focus:border-white/50" />
          <button onClick={joinByCode} disabled={busy || joinCode.length < 4 || !alias.trim()}
            className="rounded-xl bg-white/15 px-4 py-2.5 text-sm font-semibold disabled:opacity-40">
            Join
          </button>
        </div>

        {err && <p className="mt-3 text-rose-300 text-sm">{err}</p>}
        <Link href="/" className="mt-6 text-center text-sm text-white/50 underline">Home</Link>
      </Table>
    );
  }

  // ── LOADING ──
  if (phase === 'loading') {
    return (
      <Table>
        <div className="flex flex-1 flex-col items-center justify-center gap-3">
          <div className="animate-spin text-4xl">🎲</div>
          <p className="font-display font-extrabold text-lg">Setting the table…</p>
        </div>
      </Table>
    );
  }

  // ── LOBBY ──
  if (phase === 'lobby') {
    const players = st?.players ?? 1;
    return (
      <Table>
        <p className="text-white/60 text-sm font-semibold">SHARE TO JOIN</p>
        <div className="text-6xl font-display font-black tracking-[0.2em] text-center py-5">{code}</div>
        <p className="text-center text-2xl font-display font-extrabold">
          {players >= 2 ? 'Your table is ready!' : 'Waiting for a rival…'}
        </p>
        <p className="text-center text-white/60 mt-1">{players} at the table</p>

        <button onClick={startMatch} disabled={busy}
          className="mt-6 w-full rounded-2xl bg-gold text-ink px-6 py-5 text-lg font-display font-extrabold active:translate-y-0.5 disabled:opacity-40"
          style={{ boxShadow: '0 4px 0 #a87f3f' }}>
          {players >= 2 ? '▶ Deal us in' : '🤖 Play the Bot instead'}
        </button>

        <div className="mt-6 rounded-2xl bg-white/5 border border-white/15 p-4 text-sm text-white/70 space-y-1.5">
          <p className="font-display font-extrabold text-white">How Trust or Bust works</p>
          <p>✅ Answer the question — correct answers stake big points into a shared pot.</p>
          <p>🤝 Then you both secretly pick <b>SHARE</b> or <b>💰 STEAL</b> in 5 seconds flat.</p>
          <p>⚖️ Both share → split the pot. One steals → takes it all. Both steal → 🔥 nothing.</p>
          <p>🏆 {st?.total ?? TOTAL_ROUNDS} rounds. Richest legend wins.</p>
        </div>

        {err && <p className="mt-3 text-rose-300 text-sm">{err}</p>}
        <button onClick={reset} className="mt-8 text-center text-sm text-white/50 underline">Leave</button>
      </Table>
    );
  }

  // ── PLAY ──
  if (phase === 'play' && st && me) {
    return (
      <Table wide>
        {juice.overlay}
        <div className={`flex items-center justify-between ${juice.shakeClass}`}>
          <span className="rounded-full bg-white/10 px-3 py-1 text-sm font-semibold text-white/80">
            Round {st.round + 1} <span className="text-white/40">/ {st.total}</span>
          </span>
          <span className="rounded-full bg-gold/20 border border-gold/50 px-3 py-1 text-sm font-display font-extrabold text-gold tabular-nums">
            {me.points} pts
          </span>
        </div>

        <div className="mt-3 flex flex-1 flex-col lg:flex-row gap-5">
          {/* Question pane */}
          <div className="flex-1 flex flex-col gap-3">
            <TimerBar secondsLeft={remainingTime} totalSeconds={st.per_q_seconds} trackClass="bg-white/10" />
            {st.stem ? (
              <div className="rounded-2xl bg-white/5 border border-white/15 p-5">
                <h2 className="text-lg font-display font-bold mb-4">
                  <MathText text={st.stem} />
                </h2>
                <div className="space-y-2">
                  {(st.options || []).map((opt, i) => {
                    let reveal: 'correct' | 'wrong' | 'dim' | null = null;
                    if (answered) {
                      if (i === answered.correct_index) reveal = 'correct';
                      else if (i === picked && !answered.correct) reveal = 'wrong';
                      else reveal = 'dim';
                    }
                    return (
                      <AnswerTile
                        key={i}
                        index={i}
                        onClick={() => !answered && submitAnswer(i)}
                        disabled={!!answered || busy || roundPhase !== 'question'}
                        reveal={reveal}
                      >
                        {opt}
                      </AnswerTile>
                    );
                  })}
                </div>
                {answered && (
                  <p className={`mt-4 rounded-xl px-4 py-3 text-center font-display font-extrabold ${answered.correct ? 'bg-emerald-500/25 text-emerald-200' : 'bg-rose-500/20 text-rose-200'}`}>
                    {answered.correct
                      ? `✓ ${answered.points_earned} points staked in the pot`
                      : `✗ Wrong — only ${answered.points_earned} staked`}
                  </p>
                )}
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-white/50">Shuffling the next question…</div>
            )}
          </div>

          {/* Decision / Reveal pane */}
          <div className="flex-1 flex flex-col gap-4 lg:max-w-md">
            {roundPhase === 'question' && (
              <div className="flex-1 flex items-center justify-center rounded-2xl border border-dashed border-white/15 p-6 text-center text-white/50">
                <p>{answered ? '🔒 Stake locked. The SHARE / STEAL showdown starts when time runs out…' : 'Answer to build your stake — the showdown comes next.'}</p>
              </div>
            )}

            {roundPhase === 'decision' && !partner && (
              <div className="flex-1 flex items-center justify-center rounded-2xl border border-dashed border-white/15 p-6 text-center text-white/50">
                <p>Sitting this one out — you&apos;ll be dealt in next round.</p>
              </div>
            )}

            {roundPhase === 'decision' && partner && (() => {
              const roundSecs = st.round_started_at ? (now - new Date(st.round_started_at).getTime()) / 1000 : 0;
              const decisionLeft = Math.max(0, st.per_q_seconds + DECISION_SECONDS - roundSecs);
              const fraction = Math.min(1, Math.max(0, decisionLeft / DECISION_SECONDS));
              return (
                <>
                  <PartnerCard
                    name={partnerAlias || 'Unknown'}
                    stolenFromYou={me?.stolen_from || 0}
                    timeoutSeconds={Math.ceil(decisionLeft)}
                  />
                  <PotDisplay amount={answered?.points_earned || 0} />
                  {!myChoice ? (
                    <div className="flex-1 flex flex-col justify-end gap-3">
                      <p className="text-center text-sm font-semibold text-white/70">Choose fast — silence means SHARE</p>
                      <div className="flex gap-3">
                        <DecisionButton choice="share" isSelected={false} isLocked={false} disabled={busy}
                          timeoutFraction={fraction} onClick={() => submitChoice('share')} />
                        <DecisionButton choice="steal" isSelected={false} isLocked={false} disabled={busy}
                          timeoutFraction={fraction} onClick={() => submitChoice('steal')} />
                      </div>
                    </div>
                  ) : (
                    <div className="flex-1 flex flex-col justify-center items-center gap-3 py-6">
                      <p className="text-sm font-semibold text-white/60">Your choice is locked</p>
                      <div className="text-6xl animate-bounce">{myChoice === 'share' ? '🤝' : '💰'}</div>
                      <p className="text-xs text-white/40">Waiting for {partnerAlias || 'your partner'}…</p>
                    </div>
                  )}
                </>
              );
            })()}

            {roundPhase === 'reveal' && lastReveal && (() => {
              const isA = lastReveal.player_a_id === player;
              return (
                <div className="flex-1 flex flex-col justify-center">
                  <RevealCard
                    yourChoice={isA ? lastReveal.choice_a : lastReveal.choice_b}
                    theirChoice={isA ? lastReveal.choice_b : lastReveal.choice_a}
                    yourPoints={isA ? lastReveal.points_a : lastReveal.points_b}
                    theirPoints={isA ? lastReveal.points_b : lastReveal.points_a}
                    outcome={lastReveal.outcome}
                  />
                </div>
              );
            })()}
          </div>
        </div>

        {err && <p className="mt-3 text-rose-300 text-sm">{err}</p>}
      </Table>
    );
  }

  // ── FINISHED ──
  if (phase === 'finished') {
    return (
      <Table>
        {juice.overlay}
        <p className="text-gold font-display font-bold text-sm">GAME OVER</p>
        <div className="text-center my-2">
          <div className="lg-pop text-6xl">🏆</div>
          <h1 className="mt-1 text-3xl font-display font-extrabold">Cash out!</h1>
        </div>

        {me && (
          <div className="mt-3 rounded-2xl bg-white/5 border border-white/15 p-5 text-center">
            <p className="text-sm text-white/60">Your winnings</p>
            <p className="text-5xl font-display font-black text-gold tabular-nums mt-1">{me.points}</p>
            <p className="text-xs text-white/50 mt-2">🤝 {me.shares} shares · 💰 {me.steals} steals · 😤 robbed {me.stolen_from}x</p>
          </div>
        )}

        {leaders.length > 0 && (
          <>
            <div className="mt-6 text-sm text-white/60">🎰 High Rollers — season board</div>
            <ol className="mt-2 space-y-1.5">
              {leaders.slice(0, 8).map((l, i) => (
                <li key={i} className={`flex items-center justify-between rounded-lg px-3 py-1.5 text-sm ${l.is_me ? 'bg-gold/25 border border-gold/60' : 'bg-white/5'}`}>
                  <span>#{i + 1} {l.alias}{l.is_me ? ' (you)' : ''} <span className="text-white/40 text-xs">· {l.games} games</span></span>
                  <span className="tabular-nums font-bold text-gold">{l.points_total || 0}</span>
                </li>
              ))}
            </ol>
          </>
        )}

        <button onClick={reset}
          className="mt-8 w-full rounded-2xl bg-gold text-ink px-6 py-4 text-lg font-display font-extrabold active:translate-y-0.5"
          style={{ boxShadow: '0 4px 0 #a87f3f' }}>
          🎲 Play again
        </button>
        <Link href="/" className="mt-4 text-center text-sm text-white/50 underline">Home</Link>
      </Table>
    );
  }

  return null;
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : 'Something went wrong.';
}
