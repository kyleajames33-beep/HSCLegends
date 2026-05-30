'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { getQuizQuestions, SUBJECTS, type Question, type Subject } from '@/lib/questions';

type Phase = 'pick' | 'loading' | 'play' | 'done' | 'error';

export default function QuickGame() {
  const [phase, setPhase] = useState<Phase>('pick');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [err, setErr] = useState('');

  async function start(subject: Subject, year: 11 | 12) {
    setPhase('loading');
    try {
      const qs = await getQuizQuestions(createClient(), { subject, year, count: 10 });
      if (!qs.length) throw new Error('No questions found for that selection.');
      setQuestions(qs);
      setI(0);
      setScore(0);
      setPicked(null);
      setPhase('play');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Something went wrong.');
      setPhase('error');
    }
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
          {score}/{questions.length}
        </h1>
        <p className="mt-3 text-zinc-400">
          {score === questions.length ? 'Flawless. Legend.' : 'Nice. Come back tomorrow to keep the streak.'}
        </p>
        <div className="mt-8 space-y-3">
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
