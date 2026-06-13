'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/lib/use-user';
import { getQuizQuestions, SUBJECTS, type Question, type Subject } from '@/lib/questions';
import { recordQuickGame, STREAK_MSG, type QuickResult } from '@/lib/progress';
import { recordDailyQuiz } from '@/lib/daily';
import { celebrate } from '@/lib/confetti';
import CelebrateLottie from '@/components/celebrate-lottie';
import ShareButton from '@/components/share-button';
import AnswerTile from '@/components/answer-tile';
import MathText from '@/components/math-text';

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
  const [daily, setDaily] = useState<Sel | null>(null);
  const [dailyCounted, setDailyCounted] = useState(true);
  const [saveErr, setSaveErr] = useState('');
  const [err, setErr] = useState('');

  // Daily mode: ?daily=1&subject=…&year=… auto-starts the prescribed quiz.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get('daily') !== '1') return;
    const subject = p.get('subject') as Subject;
    const year = Number(p.get('year')) as 11 | 12;
    if (subject && (year === 11 || year === 12)) {
      setDaily({ subject, year });
      start(subject, year);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    setSaveErr('');
    try {
      if (daily) {
        const r = await recordDailyQuiz(sb, subject, year, correct, tot);
        setDailyCounted(r.counted);
        setResult({ xp_awarded: r.xp_awarded, total_xp: r.total_xp, streak: r.streak, streak_event: r.streak_event });
      } else {
        setResult(await recordQuickGame(sb, subject, year, correct, tot));
      }
      // Earn Sparks for the round + advance the daily-quiz quest (non-blocking).
      sb.rpc('credit_coins', { p_amount: correct * 2 + 5, p_reason: 'quick_game', p_meta: null }).then(undefined, () => {});
      if (daily) sb.rpc('increment_quest', { p_metric: 'daily_quiz', p_amount: 1 }).then(undefined, () => {});
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : 'Could not save.');
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

  // Celebrate a strong round.
  useEffect(() => {
    if (result && total > 0 && score / total >= 0.6) celebrate(score === total);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  function choose(idx: number) {
    if (picked !== null) return;
    setPicked(idx);
    const q = questions[i];
    const correct = idx === q.correct_index;
    if (correct) setScore((s) => s + 1);
    // Learning + quest hooks (signed-in only, fire-and-forget — never block gameplay).
    if (user) {
      sb.rpc('record_attempt', { p_question_id: q.id, p_subject: q.subject, p_topic: q.topic, p_correct: correct }).then(undefined, () => {});
      sb.rpc('increment_quest', { p_metric: 'answer', p_amount: 1 }).then(undefined, () => {});
      if (correct) sb.rpc('increment_quest', { p_metric: 'correct', p_amount: 1 }).then(undefined, () => {});
    }
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
        <h1 className="text-3xl font-extrabold text-ink">Pick a subject</h1>
        <p className="text-inksoft mt-1 text-sm">10 questions. Choose your year.</p>
        <div className="mt-6 space-y-2.5">
          {SUBJECTS.map((s) => (
            <div key={s.id} className="lg-card flex items-center gap-2 px-4 py-2.5">
              <span className="flex-1 font-semibold text-ink">{s.label}</span>
              {[11, 12].map((y) => (
                <button
                  key={y}
                  disabled={phase === 'loading'}
                  onClick={() => start(s.id, y as 11 | 12)}
                  className="lg-btn lg-btn-primary px-4 py-1.5 text-sm disabled:opacity-40"
                >
                  Y{y}
                </button>
              ))}
            </div>
          ))}
        </div>
        {phase === 'loading' && <p className="mt-6 text-plum font-semibold">Loading…</p>}
      </Shell>
    );
  }

  if (phase === 'error') {
    return (
      <Shell>
        <h1 className="text-xl font-extrabold text-brick">Couldn’t load</h1>
        <p className="mt-2 text-inksoft">{err}</p>
        <button onClick={() => setPhase('pick')} className="lg-btn lg-btn-primary mt-6 px-5 py-2.5">
          Back
        </button>
      </Shell>
    );
  }

  if (phase === 'done') {
    return (
      <Shell>
        <p className="text-berrydeep font-display font-bold tracking-wide text-sm">QUICK GAME COMPLETE</p>
        {score === total && <CelebrateLottie className="mx-auto h-28 w-28 -mb-2" />}
        <h1 className="mt-2 text-6xl font-extrabold text-ink">
          {score}/{total}
        </h1>
        <p className="mt-3 text-inksoft">
          {score === total ? 'Flawless. Legend.' : 'Nice. Come back tomorrow to keep the streak.'}
        </p>

        {result ? (
          <div className="lg-card mt-5 px-4 py-4 text-center" style={{ boxShadow: '0 4px 0 #6b9b7c' }}>
            <div className="text-leaf font-display font-extrabold text-lg">+{result.xp_awarded} XP</div>
            <div className="text-2xl font-display font-extrabold mt-1 text-ink">🔥 {result.streak} day{result.streak === 1 ? '' : 's'}</div>
            <div className="text-xs text-inksoft mt-1">{STREAK_MSG[result.streak_event]}</div>
            <div className="mt-3"><ShareButton streak={result.streak} className="text-sm text-berrydeep font-semibold underline" /></div>
          </div>
        ) : saveErr ? (
          <div className="mt-5 text-center">
            <p className="text-brick text-sm">Couldn’t save: {saveErr}</p>
            {sel && (
              <button onClick={() => save(sel.subject, sel.year, score, total)}
                className="lg-btn lg-btn-primary mt-2 px-4 py-2">
                Try again
              </button>
            )}
          </div>
        ) : user ? (
          <p className="mt-5 text-muted text-sm text-center">Saving…</p>
        ) : (
          <button onClick={saveAfterLogin} className="lg-btn lg-btn-berry mt-5 w-full px-4 py-4">
            Sign in to save {score * 10} XP + your streak
          </button>
        )}

        {daily && result && (
          <div className="mt-3 text-center">
            {!dailyCounted && <p className="text-xs text-muted mb-1">Already done today — practice runs don’t re-count.</p>}
            <Link href={`/leaderboard?subject=${daily.subject}&year=${daily.year}`} className="text-sm text-berrydeep font-semibold underline">
              {SUBJECTS.find((s) => s.id === daily.subject)?.label} Y{daily.year} leaderboard →
            </Link>
          </div>
        )}

        <div className="mt-6 space-y-3">
          <button onClick={() => setPhase('pick')} className="lg-btn lg-btn-primary block w-full px-4 py-4">
            Play again
          </button>
          <Link href="/" className="lg-card block w-full px-4 py-3.5 text-center font-display font-bold text-ink">
            Home
          </Link>
        </div>
      </Shell>
    );
  }

  // phase === 'play'
  const q = questions[i];
  return (
    <Shell wide>
      <div className="flex items-center justify-between text-sm text-muted font-semibold">
        <span>
          Question {i + 1}/{questions.length}
        </span>
        <span className="uppercase tracking-wide">{q.subject.replace('-', ' ')}</span>
      </div>
      <div className="mt-1 h-2 rounded-full bg-parchment-deep overflow-hidden">
        <div className="h-full bg-gold transition-all" style={{ width: `${(i / questions.length) * 100}%` }} />
      </div>

      <h2 className="mt-5 text-xl md:text-3xl md:text-center font-display font-bold leading-snug text-ink">
        <MathText text={q.stem} />
      </h2>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {q.options.map((opt, idx) => {
          const revealed = picked !== null;
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

      {picked !== null && (
        <div className="mt-5">
          <p className={`font-display font-extrabold text-xl ${picked === q.correct_index ? 'text-leaf' : 'text-brick'}`}>
            {picked === q.correct_index ? '✅ Correct!' : '❌ Not quite'}
          </p>
          {q.explanation && <p className="mt-1 text-sm text-inksoft"><MathText text={q.explanation} /></p>}
          <button onClick={next} className="lg-btn lg-btn-primary mt-4 w-full px-4 py-4">
            {i + 1 >= questions.length ? 'Finish' : 'Next'}
          </button>
        </div>
      )}
    </Shell>
  );
}

function Shell({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <main
      className={`flex flex-1 flex-col px-6 pt-12 pb-10 w-full mx-auto ${
        wide ? 'max-w-md md:max-w-6xl md:justify-center md:px-12' : 'max-w-md'
      }`}
    >
      {children}
    </main>
  );
}
