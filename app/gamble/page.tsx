'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/lib/use-user';
import { getQuizQuestions, SUBJECTS, type Subject } from '@/lib/questions';
import { celebrate } from '@/lib/confetti';
import { useJuice, TimerBar, atEvent, type JuiceAt } from '@/components/juice';
import MathText from '@/components/math-text';
import AnswerTile from '@/components/answer-tile';
import {
  gambleQuickJoin, gambleJoin, gambleRejoin, gambleState, gambleMe, gambleSubmit, gambleDecide, gambleLeaderboard,
  gambleStart, gambleAdvance, gambleGetPartner, gambleAssignPairs, gambleDecideDefault, gambleBotDecide, gambleGetPlayers,
  gamblePopulateQuestions,
  subscribeGamble, joinGambleLive,
  type GambleState, type GambleMe, type GambleRevealEvent, type GambleLeader,
} from '@/lib/gamble';
import { PartnerCard, PotDisplay, DecisionButton, RevealCard } from '@/components/gamble-ui';
import { startHeartbeat, saveArenaSession, loadArenaSession, clearArenaSession, type ArenaSession } from '@/lib/presence';

type Phase = 'pick' | 'loading' | 'lobby' | 'play' | 'finished' | 'error';
type RoundPhase = 'question' | 'decision' | 'reveal' | 'finished';

const TOTAL_ROUNDS = 6;
const QUESTION_SECONDS = 18;
const DECISION_SECONDS = 5;
const REVEAL_SECONDS = 2;

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
  const [partner, setPartner] = useState('');
  const [partnerAlias, setPartnerAlias] = useState('');
  const [repHint, setRepHint] = useState('');
  const [potSize, setPotSize] = useState(0);
  const [myChoice, setMyChoice] = useState<'share' | 'steal' | null>(null);
  const [lastReveal, setLastReveal] = useState<GambleRevealEvent | null>(null);
  const [matchResults, setMatchResults] = useState<{ [playerId: string]: { alias: string; points: number } }>({});

  // Refs for async operations
  const subRef = useRef<(() => void) | null>(null);
  const liveRef = useRef<ReturnType<typeof joinGambleLive> | null>(null);
  const hbRef = useRef<(() => void) | null>(null);
  const drive = useRef({ st: null as GambleState | null, room: '', clock: 0 });
  const ansRound = useRef(-1);
  const decideRound = useRef(-1);
  const roundPhaseT = useRef(0);
  const syncRef = useRef<(rm?: string, pid?: string) => Promise<void>>(() => Promise.resolve());

  useEffect(() => {
    if (user && !alias) setAlias((user.email ?? '').split('@')[0].slice(0, 16));
  }, [user, alias]);

  useEffect(() => () => {
    subRef.current?.();
    hbRef.current?.();
    liveRef.current?.leave();
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

  // Self-driving clock
  useEffect(() => {
    const tick = setInterval(() => {
      const ms = Date.now();
      setNow(ms);
      const d = drive.current;
      if (!d.st || !d.room) return;

      const roundMs = ms - new Date(d.st.round_started_at || 0).getTime();
      const roundSecs = Math.floor(roundMs / 1000);

      // Auto-advance round when question time is up (idempotent)
      if (d.st.status === 'active' && roundSecs >= d.st.per_q_seconds && roundPhase === 'question') {
        // Move to decision phase
        setRoundPhase('decision');
      }

      // Auto-default to SHARE if decision window expires without a choice
      if (roundPhase === 'decision' && roundSecs >= d.st.per_q_seconds + DECISION_SECONDS && !myChoice && ansRound.current === d.st.round) {
        gambleDecideDefault(sb, player, d.room, d.st.round).catch(() => {});
      }

      // Auto-advance to next round after reveal
      if (roundPhase === 'reveal' && roundSecs >= d.st.per_q_seconds + DECISION_SECONDS + REVEAL_SECONDS) {
        if (d.st.round + 1 >= TOTAL_ROUNDS) {
          setPhase('finished');
        } else {
          gambleAdvance(sb, d.room, d.st.round + 1).catch(() => {});
          setRoundPhase('question');
          setAnswered(null);
          setMyChoice(null);
          setLastReveal(null);
        }
      }
    }, 250);
    return () => clearInterval(tick);
  }, [roundPhase, myChoice, player, room]);

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
    saveArenaSession('gamble', { code, alias });
    setPhase('lobby');

    hbRef.current = startHeartbeat(sb, { room: roomId, mode: 'gamble' });

    subRef.current?.();
    subRef.current = subscribeGamble(sb, roomId, () => syncRef.current(roomId, playerId));

    liveRef.current?.leave();
    liveRef.current = joinGambleLive(sb, roomId, (event) => {
      setLastReveal(event);
      juice.flash(event.outcome === 'both_share' ? 'gold' : 'red');
      juice.burst({ tone: event.outcome === 'both_share' ? 'green' : 'red' });
    });

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

  // Assign partners at the start of each round (idempotent)
  const pairingRound = useRef(-1);
  useEffect(() => {
    if (phase !== 'play' || !st || !player || !room || pairingRound.current === st.round) return;

    (async () => {
      try {
        // Assign pairs for this round (idempotent)
        await gambleAssignPairs(sb, room, st.round);
        pairingRound.current = st.round;

        // Get this player's partner
        const partnerInfo = await gambleGetPartner(sb, player, room, st.round);
        if (partnerInfo) {
          setPartner(partnerInfo.partner_id);
          setPartnerAlias(partnerInfo.alias);

          // Reputation hint
          if (me && me.stolen_from > 0) {
            setRepHint(`Has stolen ${me.stolen_from}x`);
          } else {
            setRepHint('Fresh start');
          }

          // Pot is the submitted points this round
          setPotSize(me?.points || 0);

          // If partner is a bot, auto-decide for it
          const isBot = partnerInfo.alias === 'Bot';
          if (isBot && roundPhase === 'decision') {
            const botChoice = Math.random() < 0.7 ? 'share' : 'steal';
            await gambleBotDecide(sb, partnerInfo.partner_id, room, st.round, player);
          }
        }
      } catch (e) {
        console.error('Failed to assign pairs:', msg(e));
      }
    })();
  }, [phase, st?.round, player, room, roundPhase, me]);

  async function submitAnswer(choice: number) {
    if (ansRound.current === st?.round || !st) return;
    setBusy(true);
    try {
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
              {Object.entries(SUBJECTS).map(([s, label]) => (
                <button
                  key={s}
                  onClick={() => start(s as Subject, year)}
                  disabled={busy || !alias}
                  className="w-full bg-blue-600 text-white py-3 rounded font-semibold hover:bg-blue-700 disabled:opacity-50"
                >
                  {label} Year {year}
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
                Round {st.round + 1} / {TOTAL_ROUNDS}
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
                    {(st.options || []).map((opt, i) => (
                      <AnswerTile
                        key={i}
                        label={String.fromCharCode(65 + i)}
                        text={opt}
                        selected={answered?.correct_index === i}
                        correct={answered?.correct_index === i && answered.correct}
                        incorrect={answered && answered.correct_index === i && !answered.correct}
                        onClick={() => !answered && submitAnswer(i)}
                        disabled={!!answered || busy}
                      />
                    ))}
                  </div>
                </div>

                {answered && (
                  <div
                    className={`p-4 rounded text-center font-semibold text-white ${answered.correct ? 'bg-green-600' : 'bg-red-600'}`}
                  >
                    {answered.correct ? `✓ +${answered.points_earned}` : '✗ Try next'}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Decision/Reveal pane */}
          <div className="flex-1 flex flex-col gap-4 lg:min-h-0">
            {roundPhase === 'question' && !answered && (
              <div className="flex-1 flex items-center justify-center text-gray-600 dark:text-gray-400 text-center">
                <p>Answer the question to unlock the decision...</p>
              </div>
            )}

            {roundPhase === 'question' && answered && (
              <div className="flex-1 flex items-center justify-center text-gray-600 dark:text-gray-400 text-center">
                <p>Waiting for decision phase...</p>
              </div>
            )}

            {roundPhase === 'decision' && answered && (
              <>
                <PartnerCard
                  name={partnerAlias || 'Unknown'}
                  stolenFromYou={me?.stolen_from || 0}
                  timeoutSeconds={Math.max(0, DECISION_SECONDS - Math.floor((now - new Date(st?.round_started_at || 0).getTime()) / 1000) + 18)}
                />
                <PotDisplay amount={potSize} />
                {!myChoice ? (
                  <div className="flex-1 flex flex-col justify-end gap-3">
                    <p className="text-center text-sm font-semibold text-gray-300">Choose fast</p>
                    <div className="flex gap-3">
                      <DecisionButton
                        choice="share"
                        isSelected={myChoice === 'share'}
                        isLocked={!!myChoice}
                        disabled={busy}
                        timeoutFraction={Math.max(0, DECISION_SECONDS - Math.floor((now - new Date(st?.round_started_at || 0).getTime()) / 1000) + 18) / DECISION_SECONDS}
                        onClick={() => submitChoice('share')}
                      />
                      <DecisionButton
                        choice="steal"
                        isSelected={myChoice === 'steal'}
                        isLocked={!!myChoice}
                        disabled={busy}
                        timeoutFraction={Math.max(0, DECISION_SECONDS - Math.floor((now - new Date(st?.round_started_at || 0).getTime()) / 1000) + 18) / DECISION_SECONDS}
                        onClick={() => submitChoice('steal')}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col justify-center items-center gap-4">
                    <p className="text-sm font-semibold text-gray-400">Your choice locked</p>
                    <div className={`text-6xl animate-bounce ${myChoice === 'share' ? '🤝' : '💰'}`} />
                    <p className="text-xs text-gray-500">Waiting for opponent...</p>
                  </div>
                )}
              </>
            )}

            {roundPhase === 'reveal' && lastReveal && (
              <div className="flex-1 flex flex-col items-center justify-center">
                <RevealCard
                  yourChoice={lastReveal.choice_a as 'share' | 'steal'}
                  theirChoice={lastReveal.choice_b as 'share' | 'steal'}
                  yourPoints={lastReveal.points_a}
                  theirPoints={lastReveal.points_b}
                  outcome={lastReveal.outcome}
                />
              </div>
            )}
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
