'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/lib/use-user';
import { getDueReviews, gradeReview, type ReviewQuestion, type ReviewGrade } from '@/lib/learning';
import AnswerTile from '@/components/answer-tile';
import MathText from '@/components/math-text';

type Phase = 'loading' | 'review' | 'empty' | 'done' | 'error' | 'signedout';

// Self-grade buttons. grade maps to grade_review's SM-2 grades.
const GRADES: { grade: ReviewGrade; label: string; bg: string; deep: string }[] = [
  { grade: 0, label: 'Again', bg: '#c4646b', deep: '#9c4a50' }, // brick
  { grade: 1, label: 'Hard',  bg: '#d6a85f', deep: '#a87f3f' }, // gold
  { grade: 2, label: 'Good',  bg: '#6d5b8a', deep: '#4e4068' }, // plum
  { grade: 3, label: 'Easy',  bg: '#6b9b7c', deep: '#4a7a5b' }, // leaf
];

export default function ReviewPage() {
  const sb = useMemo(() => createClient(), []);
  const { user, loading: userLoading } = useUser();
  const [phase, setPhase] = useState<Phase>('loading');
  const [queue, setQueue] = useState<ReviewQuestion[]>([]);
  const [i, setI] = useState(0);
  const [total, setTotal] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [grading, setGrading] = useState(false);
  const [err, setErr] = useState('');

  async function load() {
    setPhase('loading');
    setErr('');
    try {
      const qs = await getDueReviews(sb, 15);
      if (!qs.length) { setPhase('empty'); return; }
      setQueue(qs);
      setTotal(qs.length);
      setI(0);
      setPicked(null);
      setPhase('review');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Something went wrong.');
      setPhase('error');
    }
  }

  useEffect(() => {
    if (userLoading) return;
    if (!user) { setPhase('signedout'); return; }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userLoading, user]);

  function choose(idx: number) {
    if (picked !== null) return;
    setPicked(idx);
  }

  async function grade(g: ReviewGrade) {
    if (grading) return;
    setGrading(true);
    try {
      await gradeReview(sb, queue[i].id, g);
      if (i + 1 >= queue.length) setPhase('done');
      else { setI((n) => n + 1); setPicked(null); }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save your review.');
      setPhase('error');
    } finally {
      setGrading(false);
    }
  }

  if (phase === 'loading') {
    return <Shell><p className="mt-10 text-plum font-semibold">Loading your reviews…</p></Shell>;
  }

  if (phase === 'signedout') {
    return (
      <Shell>
        <h1 className="text-3xl font-extrabold text-ink">🧠 Review</h1>
        <p className="mt-2 text-inksoft">Sign in to build your spaced-repetition deck and review the questions you found tricky.</p>
        <Link href="/login?next=/review" className="lg-btn lg-btn-berry mt-6 block w-full px-4 py-4 text-center">Sign in</Link>
        <Link href="/" className="lg-card mt-3 block w-full px-4 py-3.5 text-center font-display font-bold text-ink">Home</Link>
      </Shell>
    );
  }

  if (phase === 'error') {
    return (
      <Shell>
        <h1 className="text-xl font-extrabold text-brick">Couldn’t load reviews</h1>
        <p className="mt-2 text-inksoft">{err}</p>
        <button onClick={load} className="lg-btn lg-btn-primary mt-6 px-5 py-2.5">Try again</button>
      </Shell>
    );
  }

  if (phase === 'empty') {
    return (
      <Shell>
        <p className="text-berrydeep font-display font-bold tracking-wide text-sm">SPACED REPETITION</p>
        <h1 className="mt-2 text-4xl font-extrabold text-ink">All caught up! ✅</h1>
        <p className="mt-3 text-inksoft">Nothing is due right now. Keep playing — questions you miss show up here when it’s time to lock them in.</p>
        <div className="mt-6 space-y-3">
          <Link href="/play" className="lg-btn lg-btn-primary block w-full px-4 py-4 text-center">Play a quick game</Link>
          <Link href="/progress" className="lg-card block w-full px-4 py-3.5 text-center font-display font-bold text-ink">📈 See your progress</Link>
        </div>
      </Shell>
    );
  }

  if (phase === 'done') {
    return (
      <Shell>
        <p className="text-berrydeep font-display font-bold tracking-wide text-sm">REVIEW COMPLETE</p>
        <h1 className="mt-2 text-5xl font-extrabold text-ink">{total} done 🎉</h1>
        <p className="mt-3 text-inksoft">Nice work. The ones you marked harder will come back sooner.</p>
        <div className="mt-6 space-y-3">
          <button onClick={load} className="lg-btn lg-btn-primary block w-full px-4 py-4">Check for more</button>
          <Link href="/progress" className="lg-card block w-full px-4 py-3.5 text-center font-display font-bold text-ink">📈 Progress</Link>
          <Link href="/" className="lg-card block w-full px-4 py-3.5 text-center font-display font-bold text-ink">Home</Link>
        </div>
      </Shell>
    );
  }

  // phase === 'review'
  const q = queue[i];
  const revealed = picked !== null;
  return (
    <Shell wide>
      <div className="flex items-center justify-between text-sm text-muted font-semibold">
        <span>🧠 Review {i + 1}/{total}</span>
        <span className="uppercase tracking-wide">{q.subject.replace('-', ' ')}</span>
      </div>
      <div className="mt-1 h-2 rounded-full bg-parchment-deep overflow-hidden">
        <div className="h-full bg-leaf transition-all" style={{ width: `${(i / total) * 100}%` }} />
      </div>

      <h2 className="mt-5 text-xl md:text-3xl md:text-center font-display font-bold leading-snug text-ink">
        <MathText text={q.stem} />
      </h2>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {q.options.map((opt, idx) => {
          const reveal = !revealed
            ? null
            : idx === q.correct_index
              ? 'correct'
              : idx === picked
                ? 'wrong'
                : 'dim';
          return (
            <AnswerTile key={idx} index={idx} onClick={() => choose(idx)} disabled={revealed} reveal={reveal}>
              <MathText text={opt} />
            </AnswerTile>
          );
        })}
      </div>

      {revealed && (
        <div className="mt-5">
          <p className={`font-display font-extrabold text-xl ${picked === q.correct_index ? 'text-leaf' : 'text-brick'}`}>
            {picked === q.correct_index ? '✅ Correct!' : '❌ Not quite'}
          </p>
          {q.explanation && (
            <div className="lg-card mt-2 px-4 py-3">
              <p className="text-sm text-inksoft"><MathText text={q.explanation} /></p>
            </div>
          )}

          <p className="mt-5 text-center text-sm font-semibold text-inksoft">How well did you know it?</p>
          <div className="mt-2 grid grid-cols-4 gap-2">
            {GRADES.map((g) => (
              <button
                key={g.grade}
                disabled={grading}
                onClick={() => grade(g.grade)}
                className="lg-btn px-2 py-3 text-sm text-white disabled:opacity-50"
                style={{ background: g.bg, boxShadow: `0 4px 0 ${g.deep}` }}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </Shell>
  );
}

function Shell({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <main
      className={`flex flex-1 flex-col px-6 pt-14 pb-10 w-full mx-auto ${
        wide ? 'max-w-md md:max-w-6xl md:px-12' : 'max-w-md'
      }`}
    >
      {children}
    </main>
  );
}
