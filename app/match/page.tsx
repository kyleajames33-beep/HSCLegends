'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/lib/use-user';
import { getQuizQuestions, SUBJECTS, type Question, type Subject } from '@/lib/questions';
import { celebrate } from '@/lib/confetti';
import MathText from '@/components/math-text';

type Phase = 'pick' | 'loading' | 'play' | 'done' | 'error';
type Sel = { subject: Subject; year: 11 | 12 };

const COUNT = 5;
const WRONG_PENALTY = 2; // seconds added per mismatch

// Fisher–Yates shuffle returning a new array.
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function fmt(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function MatchGame() {
  const sb = useMemo(() => createClient(), []);
  const { user } = useUser();
  const [phase, setPhase] = useState<Phase>('pick');
  const [err, setErr] = useState('');

  const [questions, setQuestions] = useState<Question[]>([]);
  // Right column order (question indices), shuffled once when questions load.
  const [rightOrder, setRightOrder] = useState<number[]>([]);

  const [pickedLeft, setPickedLeft] = useState<number | null>(null); // question index
  const [pickedRight, setPickedRight] = useState<number | null>(null); // question index
  const [matched, setMatched] = useState<number[]>([]); // question indices locked
  const [wrong, setWrong] = useState<{ left: number; right: number } | null>(null);
  const [mistakes, setMistakes] = useState(0);

  // Timer (count up, +penalty seconds folded in).
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(0);
  const penaltyRef = useRef(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wrongTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function stopTimer() {
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = null;
  }

  useEffect(() => () => { stopTimer(); if (wrongTimer.current) clearTimeout(wrongTimer.current); }, []);

  async function start(subject: Subject, year: 11 | 12) {
    setPhase('loading');
    setErr('');
    try {
      const qs = await getQuizQuestions(sb, { subject, year, count: COUNT });
      if (!qs.length) throw new Error('No questions found for that selection.');
      setQuestions(qs);
      setRightOrder(shuffle(qs.map((_, idx) => idx)));
      setMatched([]);
      setPickedLeft(null);
      setPickedRight(null);
      setWrong(null);
      setMistakes(0);
      penaltyRef.current = 0;
      startRef.current = Date.now();
      setElapsed(0);
      stopTimer();
      tickRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startRef.current) / 1000) + penaltyRef.current);
      }, 250);
      setPhase('play');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Something went wrong.');
      setPhase('error');
    }
  }

  // Resolve a left+right selection into a match or a miss.
  function resolve(left: number, right: number) {
    if (left === right) {
      // Correct pair — lock both.
      const nextMatched = [...matched, left];
      setMatched(nextMatched);
      setPickedLeft(null);
      setPickedRight(null);
      if (nextMatched.length === questions.length) finish();
    } else {
      // Wrong pair — flash red, time penalty, deselect.
      setWrong({ left, right });
      setMistakes((m) => m + 1);
      penaltyRef.current += WRONG_PENALTY;
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000) + penaltyRef.current);
      setPickedLeft(null);
      setPickedRight(null);
      if (wrongTimer.current) clearTimeout(wrongTimer.current);
      wrongTimer.current = setTimeout(() => setWrong(null), 550);
    }
  }

  function tapLeft(qi: number) {
    if (matched.includes(qi) || wrong) return;
    if (pickedRight !== null) {
      resolve(qi, pickedRight);
    } else {
      setPickedLeft((cur) => (cur === qi ? null : qi));
    }
  }

  function tapRight(qi: number) {
    if (matched.includes(qi) || wrong) return;
    if (pickedLeft !== null) {
      resolve(pickedLeft, qi);
    } else {
      setPickedRight((cur) => (cur === qi ? null : qi));
    }
  }

  // mistakes is read via the functional setter snapshot; capture final via ref-free closure.
  const mistakesRef = useRef(0);
  useEffect(() => { mistakesRef.current = mistakes; }, [mistakes]);

  function finish() {
    stopTimer();
    const finalTime = Math.floor((Date.now() - startRef.current) / 1000) + penaltyRef.current;
    setElapsed(finalTime);
    setPhase('done');
    celebrate(false);

    if (user) {
      const ms = mistakesRef.current;
      sb.rpc('credit_coins', { p_amount: Math.max(5, 20 - ms), p_reason: 'match', p_meta: null }).then(undefined, () => {});
      for (const q of questions) {
        sb.rpc('record_attempt', { p_question_id: q.id, p_subject: q.subject, p_topic: q.topic, p_correct: true }).then(undefined, () => {});
      }
      sb.rpc('increment_quest', { p_metric: 'answer', p_amount: COUNT }).then(undefined, () => {});
    }
  }

  // ---- PICK / LOADING ----
  if (phase === 'pick' || phase === 'loading') {
    return (
      <Shell>
        <h1 className="text-3xl font-extrabold text-ink">Match</h1>
        <p className="text-inksoft mt-1 text-sm">Pair {COUNT} questions with their answers — fast as you can.</p>
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

  // ---- ERROR ----
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

  // ---- DONE ----
  if (phase === 'done') {
    return (
      <Shell>
        <p className="text-berrydeep font-display font-bold tracking-wide text-sm">MATCH COMPLETE</p>
        <h1 className="mt-2 text-6xl font-extrabold text-ink">{fmt(elapsed)}</h1>
        <p className="mt-3 text-inksoft">
          {mistakes === 0 ? 'Flawless — no misses!' : `${mistakes} mistake${mistakes === 1 ? '' : 's'} (incl. +${WRONG_PENALTY}s each).`}
        </p>

        {user ? (
          <div className="lg-card mt-5 px-4 py-4 text-center" style={{ boxShadow: '0 4px 0 #6b9b7c' }}>
            <div className="text-leaf font-display font-extrabold text-lg">+{Math.max(5, 20 - mistakes)} ✨ Sparks</div>
            <div className="text-xs text-inksoft mt-1">Earned for finishing the match.</div>
          </div>
        ) : (
          <p className="mt-5 text-muted text-sm text-center">Sign in to earn Sparks for matches.</p>
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

  // ---- PLAY ----
  const remaining = questions.length - matched.length;
  return (
    <Shell wide>
      <div className="flex items-center justify-between text-sm text-muted font-semibold">
        <span>{remaining} left</span>
        <span className="font-display font-extrabold text-base text-ink tabular-nums">⏱ {fmt(elapsed)}</span>
        <span className="uppercase tracking-wide">{questions[0]?.subject.replace('-', ' ')}</span>
      </div>

      <p className="mt-3 text-center text-xs text-muted">Tap a question, then its answer.</p>

      <div className="mt-4 grid grid-cols-2 gap-3 md:gap-5">
        {/* LEFT — question stems */}
        <div className="space-y-3">
          {questions.map((q, qi) => {
            const isMatched = matched.includes(qi);
            const isSel = pickedLeft === qi;
            const isWrong = wrong?.left === qi;
            return (
              <MatchCard
                key={q.id}
                matched={isMatched}
                selected={isSel}
                wrong={isWrong}
                onClick={() => tapLeft(qi)}
              >
                <span className="line-clamp-3"><MathText text={q.stem} /></span>
              </MatchCard>
            );
          })}
        </div>

        {/* RIGHT — correct answers, shuffled */}
        <div className="space-y-3">
          {rightOrder.map((qi) => {
            const q = questions[qi];
            const isMatched = matched.includes(qi);
            const isSel = pickedRight === qi;
            const isWrong = wrong?.right === qi;
            return (
              <MatchCard
                key={q.id}
                matched={isMatched}
                selected={isSel}
                wrong={isWrong}
                onClick={() => tapRight(qi)}
              >
                <span className="line-clamp-3"><MathText text={q.options[q.correct_index]} /></span>
              </MatchCard>
            );
          })}
        </div>
      </div>
    </Shell>
  );
}

function MatchCard({
  children,
  onClick,
  selected,
  matched,
  wrong,
}: {
  children: React.ReactNode;
  onClick: () => void;
  selected: boolean;
  matched: boolean;
  wrong: boolean;
}) {
  let cls = 'lg-card border-rule';
  if (matched) cls = 'border-2 border-leaf bg-leaf/15 text-leaf';
  else if (wrong) cls = 'border-2 border-brick bg-brick/10 text-brick';
  else if (selected) cls = 'border-2 border-plum bg-plum/15 text-ink';

  return (
    <button
      onClick={onClick}
      disabled={matched}
      className={`min-h-16 w-full rounded-2xl px-3 py-3 text-left text-sm md:text-base font-display font-semibold leading-snug transition active:translate-y-[2px] disabled:active:translate-y-0 ${cls}`}
    >
      <span className="flex items-center gap-2">
        {matched && <span aria-hidden>✓</span>}
        <span className="flex-1">{children}</span>
      </span>
    </button>
  );
}

function Shell({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <main
      className={`flex flex-1 flex-col px-6 pt-12 pb-10 w-full mx-auto ${
        wide ? 'max-w-md md:max-w-3xl' : 'max-w-md'
      }`}
    >
      {children}
    </main>
  );
}
