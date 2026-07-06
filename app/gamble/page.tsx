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

type Phase = 'pick' | 'loading' | 'lobby' | 'play' | 'finished' | 'error';
type RoundPhase = 'question' | 'decision' | 'reveal' | 'finished';

const TOTAL_ROUNDS = 6;
const QUESTION_SECONDS = 18;
const DECISION_SECONDS = 5;
const REVEAL_SECONDS = 4; // the reveal is the payoff — give it time to land

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
    } else if (st.status === 'active' && phase === 'lobby') {
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

  async function start(subj: Subject, yr: 11 | 12) {
    setPhase('loading');
    setErr('');
    try {
      const res = await gambleQuickJoin(sb, subj, yr, alias);
      setCode(res.code);
      setSubject(subj);
      setYear(yr);
      await enter(res.room_id, res.player_id);

      // Fetch questions and populate gamble_rounds
      const questions = await getQuizQuestions(sb, { subject: subj, year: yr, count: TOTAL_ROUNDS });
      if (!questions.length) throw new Error('No questions found.');

      // Populate the game with questions
      await gamblePopulateQuestions(sb, res.room_id, questions);

      // Start the game
      await gambleStart(sb, res.room_id);
    } catch (e) {
      setErr(msg(e));
      setPhase('pick');
    }
  }

  async function joinByCode() {
    setPhase('loading');
    setErr('');
    try {
      const res = await gambleJoin(sb, joinCode, alias);
      setCode(joinCode);
      await enter(res.room_id, res.player_id);
    } catch (e) {
      setErr(msg(e));
      setPhase('pick');
    }
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
  }, [roundPhase, st?.round, partner, partnerAlias, room, player, sb, st]);

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
      // Server will reveal once both players lock
    } catch (e) {
      setErr(msg(e));
    } finally {
      setBusy(false);
    }
  }

  const remainingTime = st?.round_started_at
    ? Math.max(0, (st.per_q_seconds || 18) - Math.floor((now - new Date(st.round_started_at).getTime()) / 1000))
    : st?.per_q_seconds || 18;

  return (
    <main className={`min-h-screen ${juice.shakeClass}`}>
      {juice.overlay}

      {phase === 'pick' && (
        <div className="flex flex-col items-center justify-center min-h-screen gap-8 p-4 bg-parchment dark:bg-black">
          <h1 className="text-4xl font-display font-bold text-center text-black dark:text-white">Trust or Bust</h1>
          <p className="text-lg text-center max-w-md text-gray-700 dark:text-gray-300">
            Answer HSC science questions. Face off against classmates in rounds of simultaneous SHARE/STEAL.
          </p>

          {resume && (
            <div className="border-2 border-amber-600 rounded-lg p-4 bg-amber-50 dark:bg-amber-950 w-full max-w-md">
              <p className="font-semibold mb-3 text-black dark:text-white">Resume {resume.code}?</p>
              <div className="flex gap-2">
                <button
                  onClick={() => rejoin(resume)}
                  className="flex-1 bg-amber-600 text-white py-2 rounded font-semibold hover:bg-amber-700"
                >
                  Resume
                </button>
                <button
                  onClick={() => {
                    clearArenaSession('gamble');
                    setResume(null);
                  }}
                  className="flex-1 bg-gray-400 dark:bg-gray-700 py-2 rounded text-black dark:text-white"
                >
                  New
                </button>
              </div>
            </div>
          )}

          <div className="w-full max-w-md space-y-4">
            <div>
              <label className="block text-sm font-semibold mb-2 text-black dark:text-white">Your name</label>
              <input
                type="text"
                value={alias}
                onChange={(e) => setAlias(e.target.value.slice(0, 16))}
                placeholder="e.g., Alex"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900 text-black dark:text-white"
              />
            </div>

            <div className="space-y-2">
              <p className="text-sm font-semibold text-black dark:text-white">Quick start</p>
              {Object.entries(SUBJECTS).map(([s, subj]) => (
                <button
                  key={s}
                  onClick={() => start(s as Subject, year)}
                  disabled={busy || !alias}
                  className="w-full bg-blue-600 text-white py-3 rounded font-semibold hover:bg-blue-700 disabled:opacity-50"
                >
                  {subj.label} Year {year}
                </button>
              ))}
            </div>

            <div className="text-center text-gray-600 dark:text-gray-400 text-sm">or</div>

            <div className="space-y-2">
              <input
                type="text"
                placeholder="Game code"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900 text-black dark:text-white"
              />
              <button
                onClick={joinByCode}
                disabled={busy || !joinCode || !alias}
                className="w-full bg-gray-600 text-white py-3 rounded font-semibold hover:bg-gray-700 disabled:opacity-50"
              >
                Join by code
              </button>
            </div>
          </div>

          {err && <div className="bg-red-100 dark:bg-red-900 text-red-900 dark:text-red-100 p-3 rounded max-w-md">{err}</div>}
        </div>
      )}

      {(phase === 'loading' || phase === 'lobby') && (
        <div className="flex flex-col items-center justify-center min-h-screen gap-4 p-4 bg-parchment dark:bg-black">
          <div className="animate-spin text-4xl">⏳</div>
          <p className="text-lg font-semibold text-black dark:text-white">
            {phase === 'loading' ? 'Starting...' : `Waiting in ${code}`}
          </p>
          {phase === 'lobby' && st && (
            <div className="text-center text-gray-600 dark:text-gray-400">
              <p className="text-sm mb-2">Players: {st.players}</p>
              <p className="text-xs">Game will start when host begins...</p>
            </div>
          )}
        </div>
      )}

      {phase === 'play' && st && me && (
        <div className="flex flex-col lg:flex-row min-h-screen gap-0 lg:gap-4 p-4 bg-parchment dark:bg-gray-900">
          {/* Question pane */}
          <div className="flex-1 flex flex-col gap-4 lg:border-r border-gray-300 dark:border-gray-700 lg:pr-4">
            <div className="flex justify-between items-center">
              <div className="text-sm font-mono text-gray-600 dark:text-gray-400">
                Round {st.round + 1} / {st.total}
              </div>
              <div className="text-lg font-bold text-black dark:text-white">{me.points} pts</div>
            </div>

            <TimerBar secondsLeft={remainingTime} totalSeconds={st.per_q_seconds} trackClass="bg-gray-200 dark:bg-black/40" />

            {st.stem && (
              <div className="flex-1 flex flex-col gap-4">
                <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border border-gray-300 dark:border-gray-700">
                  <h2 className="text-lg font-semibold mb-6 text-black dark:text-white">
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
                          disabled={!!answered || busy}
                          reveal={reveal}
                        >
                          {opt}
                        </AnswerTile>
                      );
                    })}
                  </div>
                </div>

                {answered && (
                  <div
                    className={`p-4 rounded text-center font-semibold text-white ${answered.correct ? 'bg-green-600' : 'bg-red-600'}`}
                  >
                    {answered.correct
                      ? `✓ ${answered.points_earned} points staked in the pot`
                      : `✗ Wrong — only ${answered.points_earned} staked`}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Decision/Reveal pane */}
          <div className="flex-1 flex flex-col gap-4 lg:min-h-0">
            {roundPhase === 'question' && (
              <div className="flex-1 flex items-center justify-center text-gray-600 dark:text-gray-400 text-center">
                <p>{answered ? 'Locked in. The SHARE/STEAL decision opens when time runs out...' : 'Answer to build your stake — the decision comes next.'}</p>
              </div>
            )}

            {roundPhase === 'decision' && !partner && (
              <div className="flex-1 flex items-center justify-center text-gray-600 dark:text-gray-400 text-center">
                <p>Sitting out this round — you&apos;ll be paired next round.</p>
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
                      <p className="text-center text-sm font-semibold text-gray-600 dark:text-gray-300">Choose fast — no choice defaults to SHARE</p>
                      <div className="flex gap-3">
                        <DecisionButton
                          choice="share"
                          isSelected={false}
                          isLocked={false}
                          disabled={busy}
                          timeoutFraction={fraction}
                          onClick={() => submitChoice('share')}
                        />
                        <DecisionButton
                          choice="steal"
                          isSelected={false}
                          isLocked={false}
                          disabled={busy}
                          timeoutFraction={fraction}
                          onClick={() => submitChoice('steal')}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="flex-1 flex flex-col justify-center items-center gap-4">
                      <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">Your choice locked</p>
                      <div className="text-6xl animate-bounce">{myChoice === 'share' ? '🤝' : '💰'}</div>
                      <p className="text-xs text-gray-500">Waiting for {partnerAlias || 'opponent'}...</p>
                    </div>
                  )}
                </>
              );
            })()}

            {roundPhase === 'reveal' && lastReveal && (() => {
              const isA = lastReveal.player_a_id === player;
              return (
                <div className="flex-1 flex flex-col items-center justify-center">
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
      )}

      {phase === 'finished' && (
        <div className="flex flex-col items-center justify-center min-h-screen gap-8 p-4 bg-parchment dark:bg-black">
          <h1 className="text-4xl font-display font-bold text-black dark:text-white">Match complete!</h1>

          {me && (
            <div className="bg-white dark:bg-gray-900 p-6 rounded-lg border border-gray-300 dark:border-gray-700 text-center">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Your final score</p>
              <p className="text-5xl font-bold text-black dark:text-white">{me.points}</p>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-3">
                {me.shares} shares · {me.steals} steals
              </p>
            </div>
          )}

          <div className="w-full max-w-2xl">
            <h2 className="text-xl font-semibold text-center text-black dark:text-white mb-4">Season leaderboard</h2>
            <div className="space-y-2">
              {leaders.slice(0, 10).map((l, i) => (
                <div
                  key={i}
                  className={`flex items-center justify-between p-3 rounded border-2 ${
                    l.is_me ? 'bg-blue-50 dark:bg-blue-950 border-blue-500' : 'bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-700'
                  }`}
                >
                  <div className="flex-1">
                    <p className="font-semibold text-black dark:text-white">
                      {i + 1}. {l.alias} {l.is_me && '👤'}
                    </p>
                    <p className="text-xs text-gray-600 dark:text-gray-400">{l.games} games</p>
                  </div>
                  <p className="text-xl font-bold text-black dark:text-white">{l.points_total || 0}</p>
                </div>
              ))}
            </div>
          </div>

          <Link href="/" className="bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700">
            Back home
          </Link>
        </div>
      )}

      {phase === 'error' && (
        <div className="flex flex-col items-center justify-center min-h-screen gap-4 p-4 bg-parchment dark:bg-black">
          <p className="text-lg font-semibold text-black dark:text-white">Error</p>
          <p className="text-gray-700 dark:text-gray-300 max-w-md text-center">{err}</p>
          <button onClick={() => setPhase('pick')} className="bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700">
            Back
          </button>
        </div>
      )}
    </main>
  );
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : 'Something went wrong.';
}
