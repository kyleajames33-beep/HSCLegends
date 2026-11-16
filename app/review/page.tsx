'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/lib/use-user';
import { getDueReviews, gradeReview, type ReviewQuestion, type ReviewGrade } from '@/lib/learning';
import AnswerTile from '@/components/answer-tile';
import CountUp from '@/components/count-up';
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
  const [storedPhase, setPhase] = useState<Phase>('loading');
  const [queue, setQueue] = useState<ReviewQuestion[]>([]);
  const [i, setI] = useState(0);
  const [total, setTotal] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [grading, setGrading] = useState(false);
  const [sessionSparks, setSessionSparks] = useState(0);
  const [streak, setStreak] = useState(0);
  const [sparkPop, setSparkPop] = useState(0);
  const [err, setErr] = useState('');

  const [owner, setOwner] = useState<string | null>(null);
  const requestRef = useRef(0);
  const activeOwner = useRef<string | null>(null);
  const gradeLock = useRef(false);
  const choiceLock = useRef(false);
  const currentIndex = useRef(0);
  const phase: Phase = userLoading ? 'loading' : !user ? 'signedout' : owner === user.id ? storedPhase : 'loading';

  function applyReviews(qs: ReviewQuestion[], account: string, request: number) {
    if (requestRef.current !== request) return;
    gradeLock.current = false; choiceLock.current = false; currentIndex.current = 0;
    setOwner(account); setQueue(qs); setTotal(qs.length); setI(0); setPicked(null);
    setSessionSparks(0); setStreak(0); setSparkPop(0); setGrading(false); setErr('');
    setPhase(qs.length ? 'review' : 'empty');
  }

  useEffect(() => {
    const request = ++requestRef.current;
    activeOwner.current = user?.id ?? null;
    gradeLock.current = false; choiceLock.current = false;
    if (!userLoading && user) {
      const account = user.id;
      getDueReviews(sb, 15).then(qs => applyReviews(qs, account, request), e => {
        if (requestRef.current !== request) return;
        setOwner(account); setErr(e instanceof Error ? e.message : 'Something went wrong.'); setPhase('error');
      });
    }
    return () => { activeOwner.current = null; requestRef.current += 1; gradeLock.current = false; choiceLock.current = false; };
  }, [sb, user, userLoading]);

  function load() {
    if (!user || userLoading || activeOwner.current !== user.id) return;
    const request = ++requestRef.current, account = user.id;
    gradeLock.current = false; choiceLock.current = false; currentIndex.current = 0;
    setOwner(account); setPhase('loading'); setErr('');
    getDueReviews(sb, 15).then(qs => applyReviews(qs, account, request), e => {
      if (requestRef.current !== request) return;
      setErr(e instanceof Error ? e.message : 'Something went wrong.'); setPhase('error');
    });
  }

  function choose(idx: number) {
    if (phase !== 'review' || owner !== activeOwner.current || i !== currentIndex.current || choiceLock.current || picked !== null || !queue[i] || !Number.isInteger(idx) || idx < 0 || idx >= queue[i].options.length) return;
    choiceLock.current = true; setPicked(idx);
    setStreak(s => idx === queue[i].correct_index ? s + 1 : 0);
  }

  async function grade(g: ReviewGrade) {
    if (phase !== 'review' || !user || activeOwner.current !== user.id || i !== currentIndex.current || owner !== user.id || picked === null || gradeLock.current || !queue[i]) return;
    const request = requestRef.current, question = queue[i];
    gradeLock.current = true; setGrading(true);
    try {
      const r = await gradeReview(sb, question.id, g);
      if (requestRef.current !== request) return;
      if (r.awarded > 0) { setSessionSparks(s => s + r.awarded); setSparkPop(p => p + 1); }
      currentIndex.current = i + 1;
      if (i + 1 >= queue.length) setPhase('done');
      else { choiceLock.current = false; setI(i + 1); setPicked(null); }
    } catch (e) {
      if (requestRef.current !== request) return;
      setErr(e instanceof Error ? e.message : 'Could not save your review.'); setPhase('error');
    } finally {
      if (requestRef.current === request) { gradeLock.current = false; setGrading(false); }
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
        {sessionSparks > 0 && (
          <p className="mt-3 text-2xl font-display font-extrabold text-golddeep">+<CountUp to={sessionSparks} /> ✨ earned</p>
        )}
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
        <span className="flex items-center gap-2.5">
          {streak >= 2 && <span className="text-coraldeep">🔥 {streak}</span>}
          {sessionSparks > 0 && <span key={sparkPop} className="lg-pop text-golddeep">✨ {sessionSparks}</span>}
          <span className="uppercase tracking-wide">{q.subject.replace('-', ' ')}</span>
        </span>
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
        wide ? 'max-w-md md:max-w-6xl md:px-12' : 'max-w-md md:max-w-2xl'
      }`}
    >
      {children}
    </main>
  );
}
