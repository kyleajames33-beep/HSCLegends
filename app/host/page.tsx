'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useCountdown } from '@/lib/use-countdown';
import { SUBJECTS, type Subject } from '@/lib/questions';
import {
  createGame, startGame, nextQuestion, getLiveQuestion, fetchPlayers,
  subscribeGame, type LiveQuestion, type Player,
} from '@/lib/live';

export default function HostPage() {
  const sb = useMemo(() => createClient(), []);
  const [phase, setPhase] = useState<'setup' | 'lobby' | 'active' | 'complete'>('setup');
  const [code, setCode] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [players, setPlayers] = useState<Player[]>([]);
  const [q, setQ] = useState<LiveQuestion | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const subRef = useRef<(() => void) | null>(null);

  useEffect(() => () => subRef.current?.(), []);

  async function refreshQuestion() {
    const lq = await getLiveQuestion(sb, sessionId);
    setQ(lq);
    if (lq.status === 'complete') setPhase('complete');
    else if (lq.status === 'active') setPhase('active');
  }

  async function create(subject: Subject, year: 11 | 12) {
    setBusy(true); setErr('');
    try {
      const g = await createGame(sb, subject, year, 10);
      setCode(g.code); setSessionId(g.session_id); setPhase('lobby');
      subRef.current = subscribeGame(sb, g.session_id, {
        onPlayers: async () => setPlayers(await fetchPlayers(sb, g.session_id)),
        onSession: () => refreshQuestionRef.current(),
      });
      setPlayers(await fetchPlayers(sb, g.session_id));
    } catch (e) { setErr(msg(e)); } finally { setBusy(false); }
  }

  // keep a stable ref so the subscription callback always sees current sessionId
  const refreshQuestionRef = useRef(refreshQuestion);
  refreshQuestionRef.current = refreshQuestion;

  // Per-question countdown; host auto-advances ~2s after time runs out.
  const timer = useCountdown(q?.question_started_at ?? null, q?.per_question_seconds ?? 15);
  const advancedFor = useRef(-2);
  useEffect(() => {
    if (phase !== 'active' || !q) return;
    if (timer.expired && advancedFor.current !== q.index) {
      advancedFor.current = q.index;
      const t = setTimeout(() => advance(), 2000);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timer.expired, q?.index, phase]);

  async function begin() {
    setBusy(true);
    try { await startGame(sb, sessionId); await refreshQuestion(); }
    catch (e) { setErr(msg(e)); } finally { setBusy(false); }
  }
  async function advance() {
    setBusy(true);
    try { await nextQuestion(sb, sessionId); await refreshQuestion(); setPlayers(await fetchPlayers(sb, sessionId)); }
    catch (e) { setErr(msg(e)); } finally { setBusy(false); }
  }

  if (phase === 'setup') {
    return (
      <Shell>
        <H>Host a game</H>
        <p className="text-zinc-400 text-sm mt-1">Pick a subject. Students join with the code on their phones.</p>
        <div className="mt-6 space-y-3">
          {SUBJECTS.map((s) => (
            <div key={s.id} className="flex items-center gap-2">
              <span className="flex-1 font-medium">{s.label}</span>
              {[11, 12].map((y) => (
                <button key={y} disabled={busy} onClick={() => create(s.id, y as 11 | 12)}
                  className="rounded-lg bg-zinc-800 hover:bg-indigo-600 px-4 py-2 text-sm font-semibold disabled:opacity-40">
                  Y{y}
                </button>
              ))}
            </div>
          ))}
        </div>
        {err && <Err>{err}</Err>}
      </Shell>
    );
  }

  if (phase === 'lobby') {
    return (
      <Shell>
        <p className="text-indigo-400 text-sm font-semibold">JOIN AT /join</p>
        <div className="mt-2 text-6xl font-black tracking-[0.2em] text-center py-6">{code}</div>
        <p className="text-center text-zinc-400">{players.length} player{players.length === 1 ? '' : 's'} in</p>
        <div className="mt-4 flex flex-wrap gap-2 justify-center min-h-16">
          {players.map((p) => (
            <span key={p.id} className="rounded-full bg-zinc-800 px-3 py-1 text-sm">{p.alias}</span>
          ))}
        </div>
        <button disabled={busy || players.length === 0} onClick={begin}
          className="mt-8 w-full rounded-2xl bg-indigo-600 hover:bg-indigo-500 px-6 py-5 text-lg font-semibold disabled:opacity-40">
          Start game
        </button>
        {err && <Err>{err}</Err>}
      </Shell>
    );
  }

  if (phase === 'active' && q) {
    return (
      <Shell>
        <div className="flex items-center justify-between text-sm text-zinc-500">
          <span>Question {q.index + 1}/{q.total}</span>
          <span className={`font-bold tabular-nums ${timer.remaining <= 5 ? 'text-red-400' : 'text-zinc-300'}`}>{timer.remaining}s</span>
        </div>
        <div className="mt-1 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
          <div className="h-full bg-indigo-500 transition-[width] duration-200" style={{ width: `${timer.frac * 100}%` }} />
        </div>
        {q.is_double && (
          <div className="mt-2 rounded-lg bg-amber-500/20 border border-amber-500/50 px-3 py-1.5 text-center text-amber-300 text-sm font-bold animate-pulse">
            ⚡ DOUBLE POINTS
          </div>
        )}
        <h2 className="mt-3 text-2xl font-bold leading-snug">{q.stem}</h2>
        <div className="mt-4 grid grid-cols-2 gap-3">
          {(q.options ?? []).map((o, i) => (
            <div key={i} className="rounded-xl border border-zinc-700 px-4 py-3">{o}</div>
          ))}
        </div>
        <div className="mt-6">
          <div className="text-sm text-zinc-500 mb-2">Live scores</div>
          <Scoreboard players={players} />
        </div>
        <button disabled={busy} onClick={advance}
          className="mt-6 w-full rounded-xl bg-indigo-600 hover:bg-indigo-500 px-4 py-4 font-semibold disabled:opacity-40">
          {q.index + 1 >= q.total ? 'Finish' : 'Next question'}
        </button>
        {err && <Err>{err}</Err>}
      </Shell>
    );
  }

  // complete
  return (
    <Shell>
      <p className="text-indigo-400 font-semibold text-sm">FINAL</p>
      <H>Podium</H>
      <div className="mt-6"><Scoreboard players={players} podium /></div>
      <Link href="/host" className="mt-8 block w-full rounded-xl bg-indigo-600 px-4 py-4 text-center font-semibold">
        New game
      </Link>
    </Shell>
  );
}

function Scoreboard({ players, podium }: { players: Player[]; podium?: boolean }) {
  if (!players.length) return <p className="text-zinc-600 text-sm">No scores yet.</p>;
  const medal = ['🥇', '🥈', '🥉'];
  return (
    <ol className="space-y-2">
      {players.map((p, i) => (
        <li key={p.id} className={`flex items-center justify-between rounded-xl px-4 py-3 ${podium && i < 3 ? 'bg-indigo-600/20 border border-indigo-500/40' : 'bg-zinc-900'}`}>
          <span className="font-medium">{(podium && medal[i]) || `${i + 1}.`} {p.alias}</span>
          <span className="tabular-nums font-bold">{p.score}</span>
        </li>
      ))}
    </ol>
  );
}

const msg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.');
const Shell = ({ children }: { children: React.ReactNode }) => (
  <main className="flex flex-1 flex-col px-6 pt-12 pb-10 max-w-md w-full mx-auto">{children}</main>
);
const H = ({ children }: { children: React.ReactNode }) => <h1 className="text-2xl font-bold">{children}</h1>;
const Err = ({ children }: { children: React.ReactNode }) => <p className="mt-4 text-red-400 text-sm">{children}</p>;
