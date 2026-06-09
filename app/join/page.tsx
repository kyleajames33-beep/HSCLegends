'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/lib/use-user';
import { useCountdown } from '@/lib/use-countdown';
import AnswerTile from '@/components/answer-tile';
import {
  joinGame, getLiveQuestion, submitAnswer, fetchPlayers, subscribeGame, claimGameXp,
  type LiveQuestion, type Player,
} from '@/lib/live';

type Phase = 'form' | 'lobby' | 'question' | 'answered' | 'complete';
type Result = { is_correct: boolean; correct_index: number; points: number };

const PENDING_KEY = 'legends_pending_claim';

export default function JoinPage() {
  const sb = useMemo(() => createClient(), []);
  const router = useRouter();
  const { user } = useUser();
  const [xp, setXp] = useState<{ awarded: number; total: number } | null>(null);
  const [phase, setPhase] = useState<Phase>('form');
  const [code, setCode] = useState('');
  const [alias, setAlias] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [playerId, setPlayerId] = useState('');
  const [q, setQ] = useState<LiveQuestion | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [me, setMe] = useState<{ rank: number; score: number } | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const timer = useCountdown(q?.question_started_at ?? null, q?.per_question_seconds ?? 15);

  const answeredIdx = useRef<number>(-1);
  const subRef = useRef<(() => void) | null>(null);
  useEffect(() => () => subRef.current?.(), []);

  // Resume a claim deferred across the login redirect (player_id stashed before sign-in).
  useEffect(() => {
    if (!user) return;
    const pending = typeof window !== 'undefined' ? localStorage.getItem(PENDING_KEY) : null;
    if (pending && !xp) {
      localStorage.removeItem(PENDING_KEY);
      claimGameXp(sb, pending).then((r) => { setXp({ awarded: r.awarded, total: r.total_xp }); setPhase('complete'); }).catch(() => {});
    }
  }, [user, xp, sb]);

  // Auto-save score the moment a signed-in player finishes.
  useEffect(() => {
    if (phase === 'complete' && user && playerId && !xp) {
      claimGameXp(sb, playerId).then((r) => setXp({ awarded: r.awarded, total: r.total_xp })).catch(() => {});
    }
  }, [phase, user, playerId, xp, sb]);

  function saveScore() {
    localStorage.setItem(PENDING_KEY, playerId);
    router.push('/login?next=/join');
  }

  async function loadState(sid: string, pid: string) {
    const lq = await getLiveQuestion(sb, sid);
    if (lq.status === 'complete') {
      const players = await fetchPlayers(sb, sid);
      const idx = players.findIndex((p) => p.id === pid);
      setMe({ rank: idx + 1, score: players[idx]?.score ?? 0 });
      setPhase('complete');
      return;
    }
    if (lq.status === 'lobby') { setPhase('lobby'); return; }
    setQ(lq);
    if (answeredIdx.current === lq.index) { setPhase('answered'); }
    else { setResult(null); setPhase('question'); }
  }
  const loadRef = useRef(loadState);
  loadRef.current = loadState;

  async function join(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      const j = await joinGame(sb, code, alias);
      setSessionId(j.session_id); setPlayerId(j.player_id);
      subRef.current = subscribeGame(sb, j.session_id, {
        onSession: () => loadRef.current(j.session_id, j.player_id),
      });
      await loadState(j.session_id, j.player_id);
    } catch (e) { setErr(msg(e)); } finally { setBusy(false); }
  }

  async function answer(choice: number) {
    if (!q) return;
    setBusy(true);
    try {
      const r = await submitAnswer(sb, playerId, q.index, choice);
      answeredIdx.current = q.index;
      setResult({ ...r });
      setPhase('answered');
    } catch (e) { setErr(msg(e)); } finally { setBusy(false); }
  }

  if (phase === 'form') {
    return (
      <Shell>
        <H>Join a game</H>
        <form onSubmit={join} className="mt-6 space-y-4">
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="CODE" maxLength={6} autoCapitalize="characters"
            className="w-full rounded-xl bg-panel border border-rule px-4 py-4 text-center text-3xl font-black tracking-[0.3em] outline-none focus:border-plum" />
          <input value={alias} onChange={(e) => setAlias(e.target.value)}
            placeholder="Your name" maxLength={20}
            className="w-full rounded-xl bg-panel border border-rule px-4 py-3 outline-none focus:border-plum" />
          <button disabled={busy || code.length < 6 || !alias.trim()}
            className="w-full rounded-xl bg-plum hover:bg-plumdeep text-white px-4 py-4 font-semibold disabled:opacity-40">
            Join
          </button>
        </form>
        {err && <Err>{err}</Err>}
      </Shell>
    );
  }

  if (phase === 'lobby') {
    return (
      <Shell>
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <div className="text-5xl mb-4">⏳</div>
          <H>You’re in, {alias}!</H>
          <p className="text-inksoft mt-2">Waiting for the host to start…</p>
        </div>
      </Shell>
    );
  }

  if (phase === 'question' && q) {
    return (
      <Shell>
        <div className="flex items-center justify-between text-sm text-muted">
          <span>Question {q.index + 1}/{q.total}</span>
          <span className={`font-bold tabular-nums ${timer.remaining <= 5 ? 'text-brick' : 'text-ink'}`}>{timer.remaining}s</span>
        </div>
        <div className="mt-1 h-1.5 rounded-full bg-parchment-deep overflow-hidden">
          <div className="h-full bg-gold transition-[width] duration-200" style={{ width: `${timer.frac * 100}%` }} />
        </div>
        {q.is_double && (
          <div className="mt-2 rounded-lg bg-gold/25 border border-gold px-3 py-1.5 text-center text-golddeep text-sm font-bold animate-pulse">
            ⚡ DOUBLE POINTS — get this one!
          </div>
        )}
        <h2 className="mt-3 text-xl font-display font-bold leading-snug">{q.stem}</h2>
        <div className="mt-5 space-y-3">
          {(q.options ?? []).map((o, i) => (
            <AnswerTile key={i} index={i} disabled={busy || timer.expired} onClick={() => answer(i)}>
              {o}
            </AnswerTile>
          ))}
        </div>
        {timer.expired && <p className="mt-4 text-center text-inksoft">⏰ Time’s up — waiting for the next question…</p>}
        {err && <Err>{err}</Err>}
      </Shell>
    );
  }

  if (phase === 'answered' && q) {
    return (
      <Shell>
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          {result?.is_correct ? (
            <><div className="text-6xl mb-3">✅</div><H>Correct!</H><p className="text-berrydeep text-2xl font-bold mt-2">+{result.points}</p></>
          ) : (
            <><div className="text-6xl mb-3">❌</div><H>Not quite</H>
              <p className="text-inksoft mt-2">Answer: <span className="text-ink font-semibold">{q.options?.[result?.correct_index ?? -1]}</span></p></>
          )}
          <p className="text-muted mt-6 text-sm">Waiting for the next question…</p>
        </div>
      </Shell>
    );
  }

  // complete
  return (
    <Shell>
      <div className="flex-1 flex flex-col items-center justify-center text-center">
        <p className="text-berrydeep font-semibold text-sm">GAME OVER</p>
        <div className="text-6xl my-3">{me && me.rank <= 3 ? '🏆' : '🎉'}</div>
        <H>{me ? `#${me.rank}` : 'Done'}</H>
        <p className="text-ink mt-2 text-xl font-bold">{me?.score ?? xp?.awarded ?? 0} pts</p>

        {xp ? (
          <p className="mt-4 rounded-xl bg-leaf/15 border border-leaf/50 px-4 py-3 text-leaf text-sm">
            Saved! +{xp.awarded} XP · {xp.total} total
          </p>
        ) : user ? (
          <p className="mt-4 text-muted text-sm">Saving your score…</p>
        ) : (
          <button onClick={saveScore} className="mt-6 rounded-xl bg-plum hover:bg-plumdeep text-white px-6 py-3 font-semibold">
            Save my {me?.score ?? 0} pts
          </button>
        )}

        <Link href="/join" className="mt-8 text-sm text-muted underline">Play another</Link>
      </div>
    </Shell>
  );
}

const msg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.');
const Shell = ({ children }: { children: React.ReactNode }) => (
  <main className="flex flex-1 flex-col px-6 pt-12 pb-10 max-w-md w-full mx-auto">{children}</main>
);
const H = ({ children }: { children: React.ReactNode }) => <h1 className="text-2xl font-bold">{children}</h1>;
const Err = ({ children }: { children: React.ReactNode }) => <p className="mt-4 text-brick text-sm">{children}</p>;
