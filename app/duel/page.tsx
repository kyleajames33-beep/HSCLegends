'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/lib/use-user';
import { SUBJECTS, type Subject } from '@/lib/questions';
import AnswerTile from '@/components/answer-tile';
import MathText from '@/components/math-text';
import Avatar from '@/components/avatar';
import { celebrate } from '@/lib/confetti';
import {
  duelFindOrCreate, duelQuestion, duelAnswer, duelResult, getDuelLadder,
  type DuelMatch, type DuelQ, type DuelResult, type LadderRow,
} from '@/lib/duel';

type Phase = 'pick' | 'playing' | 'done' | 'ladder';

export default function DuelPage() {
  const sb = useMemo(() => createClient(), []);
  const { user, loading } = useUser();
  const [phase, setPhase] = useState<Phase>('pick');
  const [subject, setSubject] = useState<Subject>('biology');
  const [year, setYear] = useState<11 | 12>(12);
  const [ranked, setRanked] = useState(true);

  const [duel, setDuel] = useState<DuelMatch | null>(null);
  const [total, setTotal] = useState(5);
  const [index, setIndex] = useState(0);
  const [q, setQ] = useState<DuelQ | null>(null);
  const [answered, setAnswered] = useState<{ correct: boolean; correct_index: number } | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [result, setResult] = useState<DuelResult | null>(null);
  const [ladder, setLadder] = useState<LadderRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (result?.outcome === 'win') celebrate(true);
  }, [result]);

  async function find() {
    setBusy(true); setErr('');
    try {
      const m = await duelFindOrCreate(sb, subject, year, ranked);
      setDuel(m); setScore(0); setIndex(0); setAnswered(null); setPicked(null);
      const first = await duelQuestion(sb, m.duel_id, 0);
      setQ(first); setTotal(first.total);
      setPhase('playing');
    } catch (e) { setErr(msg(e)); } finally { setBusy(false); }
  }
  async function answer(choice: number) {
    if (!duel || answered) return;
    setBusy(true); setPicked(choice);
    try {
      const r = await duelAnswer(sb, duel.duel_id, index, choice);
      setAnswered(r);
      if (r.correct) setScore((s) => s + 1);
    } catch (e) { setErr(msg(e)); } finally { setBusy(false); }
  }
  async function next() {
    if (!duel) return;
    if (index + 1 >= total) {
      setBusy(true);
      try { setResult(await duelResult(sb, duel.duel_id)); setPhase('done'); }
      finally { setBusy(false); }
      return;
    }
    setBusy(true);
    try { const nq = await duelQuestion(sb, duel.duel_id, index + 1); setQ(nq); setIndex(index + 1); setAnswered(null); setPicked(null); }
    finally { setBusy(false); }
  }
  async function openLadder() {
    setLadder(await getDuelLadder(sb, subject, year));
    setPhase('ladder');
  }

  // ---------- PICK ----------
  if (phase === 'pick') {
    if (!loading && !user) {
      return (
        <Shell>
          <H>⚔️ Duel</H>
          <p className="mt-2 text-inksoft">1v1 ranked battles. Sign in to challenge the ladder.</p>
          <Link href="/login?next=/duel" className="lg-btn lg-btn-primary mt-6 px-5 py-3 text-center">Sign in</Link>
          <Home />
        </Shell>
      );
    }
    return (
      <Shell>
        <H>⚔️ Duel</H>
        <p className="text-inksoft text-sm mt-1">Same 5 questions, head to head. Fastest brain wins ELO.</p>
        <div className="mt-4 flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          {SUBJECTS.map((s) => (
            <button key={s.id} onClick={() => setSubject(s.id)}
              className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-semibold ${subject === s.id ? 'bg-plum text-white' : 'bg-parchment-deep text-ink'}`}>{s.label}</button>
          ))}
        </div>
        <div className="mt-2 flex gap-2">
          {[11, 12].map((y) => (
            <button key={y} onClick={() => setYear(y as 11 | 12)}
              className={`rounded-full px-3 py-1 text-sm font-semibold ${year === y ? 'bg-berry text-white' : 'bg-parchment-deep text-ink'}`}>Year {y}</button>
          ))}
          <div className="ml-auto flex gap-1 rounded-full bg-parchment-deep p-1">
            {[['Ranked', true], ['Casual', false]].map(([lbl, val]) => (
              <button key={lbl as string} onClick={() => setRanked(val as boolean)}
                className={`rounded-full px-3 py-1 text-sm font-semibold ${ranked === val ? 'bg-plum text-white' : 'text-ink'}`}>{lbl}</button>
            ))}
          </div>
        </div>
        <button onClick={find} disabled={busy} className="lg-btn lg-btn-primary mt-6 w-full px-6 py-5 text-lg disabled:opacity-40">
          {busy ? 'Finding…' : '⚔️ Find a Duel'}
        </button>
        <button onClick={openLadder} className="lg-card mt-3 flex items-center justify-between px-4 py-3.5">
          <span className="font-display font-bold text-ink">🏆 Duel ladder</span>
          <span className="text-sm text-muted">ELO rankings</span>
        </button>
        {err && <Err>{err}</Err>}
        <Home />
      </Shell>
    );
  }

  // ---------- PLAYING ----------
  if (phase === 'playing' && q) {
    return (
      <Shell wide>
        <div className="flex items-center justify-between text-sm text-muted">
          <span>Q{index + 1}/{total}</span>
          <span>{duel?.is_opponent ? `vs ${duel.opp_name} (${duel.opp_elo})` : 'setting the pace'}</span>
        </div>
        <div className="mt-1 h-2 rounded-full bg-parchment-deep overflow-hidden">
          <div className="h-full bg-gold" style={{ width: `${(index / total) * 100}%` }} />
        </div>
        <h2 className="mt-4 text-xl md:text-3xl md:text-center font-display font-bold text-ink leading-snug"><MathText text={q.stem ?? ''} /></h2>
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {(q.options ?? []).map((o, i) => (
            <AnswerTile key={i} index={i} disabled={busy || !!answered} onClick={() => answer(i)}
              reveal={answered ? (i === answered.correct_index ? 'correct' : i === picked ? 'wrong' : 'dim') : null}>
              <MathText text={o} />
            </AnswerTile>
          ))}
        </div>
        {answered && (
          <div className="mt-4">
            <p className={`font-display font-extrabold ${answered.correct ? 'text-leaf' : 'text-brick'}`}>
              {answered.correct ? '✓ Correct' : '✗ Wrong'}
            </p>
            <button onClick={next} disabled={busy} className="lg-btn lg-btn-primary mt-2 w-full px-4 py-4">
              {index + 1 >= total ? 'See result' : 'Next'}
            </button>
          </div>
        )}
        {err && <Err>{err}</Err>}
      </Shell>
    );
  }

  // ---------- DONE ----------
  if (phase === 'done' && result) {
    const pending = result.outcome === 'pending';
    const emoji = pending ? '⏳' : result.outcome === 'win' ? '🏆' : result.outcome === 'draw' ? '🤝' : '💔';
    return (
      <Shell>
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <div className="text-6xl">{emoji}</div>
          <H>{pending ? `You scored ${result.my_score}/${total}` : result.outcome.toUpperCase()}</H>
          {pending ? (
            <p className="mt-2 text-inksoft">Your run’s in — we’ll match you with an opponent and the result lands here.</p>
          ) : (
            <>
              <p className="mt-2 text-lg font-display font-bold text-ink">
                {result.my_score} – {result.opp_score} vs {result.opp_name}
              </p>
              {ranked && result.my_delta != null && (
                <p className="mt-1 text-plum font-display font-bold">
                  {result.my_delta >= 0 ? '+' : ''}{result.my_delta} ELO · now {result.my_elo}
                </p>
              )}
            </>
          )}
          <button onClick={() => setPhase('pick')} className="lg-btn lg-btn-primary mt-8 w-full px-6 py-4">Find another</button>
          <button onClick={openLadder} className="mt-3 text-sm text-berrydeep underline">View ladder</button>
        </div>
      </Shell>
    );
  }

  // ---------- LADDER ----------
  return (
    <Shell>
      <div className="flex items-center justify-between">
        <H>🏆 Duel ladder</H>
        <button onClick={() => setPhase('pick')} className="text-sm text-muted underline">Back</button>
      </div>
      <p className="mt-1 font-display font-bold text-ink">{SUBJECTS.find((s) => s.id === subject)?.label} · Year {year}</p>
      <ol className="mt-3 space-y-2">
        {ladder.map((r) => (
          <li key={r.rank} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${r.is_me ? 'bg-gold/25 border border-gold/60' : 'bg-panel'}`}>
            <span className="text-muted tabular-nums w-5 text-center font-semibold">{r.rank}</span>
            <Avatar seed={r.name} size={34} className="rounded-full shrink-0" />
            <span className="font-medium flex-1 truncate">{r.name}{r.is_me ? ' (you)' : ''}</span>
            <span className="text-xs text-muted">{r.wins}W {r.losses}L</span>
            <span className="tabular-nums font-bold w-12 text-right">{r.elo}</span>
          </li>
        ))}
        {!ladder.length && <p className="text-muted text-sm">No ranked duels played yet. Be the first to climb.</p>}
      </ol>
      <Home />
    </Shell>
  );
}

const msg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.');
const Shell = ({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) => (
  <main
    className={`flex flex-1 flex-col px-6 pt-12 pb-10 w-full mx-auto ${
      wide ? 'max-w-md md:max-w-6xl md:justify-center md:px-12' : 'max-w-md'
    }`}
  >
    {children}
  </main>
);
const H = ({ children }: { children: React.ReactNode }) => <h1 className="text-2xl font-extrabold text-ink">{children}</h1>;
const Err = ({ children }: { children: React.ReactNode }) => <p className="mt-3 text-brick text-sm">{children}</p>;
const Home = () => <Link href="/" className="mt-6 text-center text-sm text-muted underline">Home</Link>;
