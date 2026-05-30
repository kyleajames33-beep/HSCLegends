'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/lib/use-user';
import { getQuizQuestions, SUBJECTS, type Question, type Subject } from '@/lib/questions';
import { recordQuickGame, STREAK_MSG, type QuickResult } from '@/lib/progress';

type Phase = 'pick' | 'loading' | 'play' | 'done' | 'error';
type Sel = { subject: Subject; year: 11 | 12 };
const PENDING_KEY = 'legends_pending_quick';

export default function QuickGame() {
  const sb = useMemo(() => createClient(), []);
  const router = useRouter();
  const { user } = useUser();
  const [phase, setPhase] = useState<Phase>('pick');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [total, setTotal] = useState(10);
  const [sel, setSel] = useState<Sel | null>(null);
  const [result, setResult] = useState<QuickResult | null>(null);
  const [err, setErr] = useState('');

  async function start(subject: Subject, year: 11 | 12) {
    setPhase('loading');
    try {
      const qs = await getQuizQuestions(sb, { subject, year, count: 10 });
      if (!qs.length) throw new Error('No questions found for that selection.');
      setQuestions(qs);
      setSel({ subject, year });
      setTotal(qs.length);
      setI(0);
      setScore(0);
      setResult(null);
      setPicked(null);
      setPhase('play');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Something went wrong.');
      setPhase('error');
    }
  }

  // Save result for a signed-in player (auto on finish, or resumed after login).
  async function save(subject: Subject, year: 11 | 12, correct: number, tot: number) {
    try {
      setResult(await recordQuickGame(sb, subject, year, correct, tot));
    } catch {
      /* leave result null; UI keeps the manual save CTA */
    }
  }

  // Auto-save the moment a signed-in player finishes.
  useEffect(() => {
    if (phase === 'done' && user && sel && !result) save(sel.subject, sel.year, score, total);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, user]);

  // Resume a save deferred across the login redirect.
  useEffect(() => {
    if (!user) return;
    const raw = typeof window !== 'undefined' ? localStorage.getItem(PENDING_KEY) : null;
    if (!raw || result) return;
    localStorage.removeItem(PENDING_KEY);
    try {
      const p = JSON.parse(raw) as Sel & { correct: number; total: number };
      setScore(p.correct); setTotal(p.total); setSel({ subject: p.subject, year: p.year });
      setPhase('done');
      save(p.subject, p.year, p.correct, p.total);
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  function saveAfterLogin() {
    if (!sel) return;
    localStorage.setItem(PENDING_KEY, JSON.stringify({ ...sel, correct: score, total }));
    router.push('/login?next=/play');
  }

  function choose(idx: number) {
    if (picked !== null) return;
    setPicked(idx);
    if (idx === questions[i].correct_index) setScore((s) => s + 1);
  }

  function next() {
    if (i + 1 >= questions.length) setPhase('done');
    else {
      setI((n) => n + 1);
      setPicked(null);
    }
  }

  if (phase === 'pick' || phase === 'loading') {
    return (
      <Shell>
        <h1 className="text-2xl font-bold">Pick a subject</h1>
        <p className="text-zinc-400 mt-1 text-sm">10 questions. Choose your year.</p>
        <div className="mt-6 space-y-3">
          {SUBJECTS.map((s) => (
            <div key={s.id} className="flex items-center gap-2">
              <span className="flex-1 font-medium">{s.label}</span>
              {[11, 12].map((y) => (
                <button
                  key={y}
                  disabled={phase === 'loading'}
                  onClick={() => start(s.id, y as 11 | 12)}
                  className="rounded-lg bg-zinc-800 hover:bg-indigo-600 px-4 py-2 text-sm font-semibold disabled:opacity-40 transition"
                >
                  Y{y}
                </button>
              ))}
            </div>
          ))}
        </div>
        {phase === 'loading' && <p className="mt-6 text-indigo-400">Loading…</p>}
      </Shell>
    );
  }

  if (phase === 'error') {
    return (
      <Shell>
        <h1 className="text-xl font-bold text-red-400">Couldn’t load</h1>
        <p className="mt-2 text-zinc-400">{err}</p>
        <button onClick={() => setPhase('pick')} className="mt-6 rounded-lg bg-indigo-600 px-4 py-2 font-semibold">
          Back
        </button>
      </Shell>
    );
  }

  if (phase === 'done') {
    return (
      <Shell>
        <p className="text-indigo-400 font-semibold text-sm">QUICK GAME COMPLETE</p>
        <h1 className="mt-2 text-5xl font-bold">
          {score}/{total}
        </h1>
        <p className="mt-3 text-zinc-400">
          {score === total ? 'Flawless. Legend.' : 'Nice. Come back tomorrow to keep the streak.'}
        </p>

        {result ? (
          <div className="mt-5 rounded-xl bg-green-500/10 border border-green-500/40 px-4 py-4 text-center">
            <div className="text-green-300 font-semibold">+{result.xp_awarded} XP</div>
            <div className="text-2xl font-bold mt-1">🔥 {result.streak} day{result.streak === 1 ? '' : 's'}</div>
            <div className="text-xs text-zinc-400 mt-1">{STREAK_MSG[result.streak_event]}</div>
          </div>
        ) : user ? (
          <p className="mt-5 text-zinc-500 text-sm text-center">Saving…</p>
        ) : (
          <button onClick={saveAfterLogin} className="mt-5 w-full rounded-xl bg-indigo-600 hover:bg-indigo-500 px-4 py-4 font-semibold">
            Sign in to save {score * 10} XP + your streak
          </button>
        )}

        <div className="mt-6 space-y-3">
          <button onClick={() => setPhase('pick')} className="block w-full rounded-xl bg-indigo-600 hover:bg-indigo-500 px-4 py-4 font-semibold">
            Play again
          </button>
          <Link href="/" className="block w-full rounded-xl border border-zinc-800 px-4 py-4 text-center font-semibold">
            Home
          </Link>
        </div>
      </Shell>
    );
  }

  // phase === 'play'
  const q = questions[i];
  return (
    <Shell>
      <div className="flex items-center justify-between text-sm text-zinc-500">
        <span>
          Question {i + 1}/{questions.length}
        </span>
        <span className="uppercase tracking-wide">{q.subject.replace('-', ' ')}</span>
      </div>
      <div className="mt-1 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
        <div className="h-full bg-indigo-500 transition-all" style={{ width: `${(i / questions.length) * 100}%` }} />
      </div>

      <h2 className="mt-5 text-lg font-semibold leading-snug">{q.stem}</h2>

      <div className="mt-5 space-y-3">
        {q.options.map((opt, idx) => {
          const isCorrect = idx === q.correct_index;
          const revealed = picked !== null;
          const state = !revealed
            ? 'border-zinc-700 hover:border-indigo-500'
            : isCorrect
              ? 'border-green-500 bg-green-500/10'
              : idx === picked
                ? 'border-red-500 bg-red-500/10'
                : 'border-zinc-800 opacity-50';
          return (
            <button
              key={idx}
              onClick={() => choose(idx)}
              className={`block w-full text-left rounded-xl border px-4 py-3 transition ${state}`}
            >
              {opt}
            </button>
          );
        })}
      </div>

      {picked !== null && (
        <div className="mt-5">
          {q.explanation && <p className="text-sm text-zinc-400">{q.explanation}</p>}
          <button onClick={next} className="mt-4 w-full rounded-xl bg-indigo-600 hover:bg-indigo-500 px-4 py-4 font-semibold">
            {i + 1 >= questions.length ? 'Finish' : 'Next'}
          </button>
        </div>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="flex flex-1 flex-col px-6 pt-12 pb-10 max-w-md w-full mx-auto">{children}</main>;
}
