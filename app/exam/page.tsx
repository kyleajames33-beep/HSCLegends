'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { SUBJECTS, type Subject } from '@/lib/questions';
import { useCountdown } from '@/lib/use-countdown';
import AnswerTile from '@/components/answer-tile';
import MathText from '@/components/math-text';
import ExamTimer from '@/components/exam-timer';

// Section I simulation: 20 MC questions, one big timer (~60s/question).
const EXAM_COUNT = 20;
const EXAM_SECONDS = EXAM_COUNT * 60; // 20 minutes

type ExamQ = {
  id: string;
  stem: string;
  options: string[];
  correct_index: number;
  explanation: string;
  year: number;
  difficulty: number;
  topic: string;
};

type Phase = 'pick' | 'loading' | 'play' | 'done' | 'error';
type Sel = { subject: Subject; year: 11 | 12 };

// HSC band mapping from a percentage. B6 90–100 … B1 0–49.
function band(pct: number): { band: string; label: string } {
  if (pct >= 90) return { band: 'Band 6', label: '90–100' };
  if (pct >= 80) return { band: 'Band 5', label: '80–89' };
  if (pct >= 70) return { band: 'Band 4', label: '70–79' };
  if (pct >= 60) return { band: 'Band 3', label: '60–69' };
  if (pct >= 50) return { band: 'Band 2', label: '50–59' };
  return { band: 'Band 1', label: '0–49' };
}

export default function ExamMode() {
  const sb = useMemo(() => createClient(), []);
  const [phase, setPhase] = useState<Phase>('pick');
  const [sel, setSel] = useState<Sel | null>(null);
  const [questions, setQuestions] = useState<ExamQ[]>([]);
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState<(number | null)[]>([]);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const submittedRef = useRef(false);

  const { remaining, expired } = useCountdown(startedAt, EXAM_SECONDS);

  async function start(subject: Subject, year: 11 | 12) {
    setPhase('loading');
    setErr('');
    try {
      const { data, error } = await sb.rpc('get_exam_questions', {
        p_subject: subject,
        p_year: year,
        p_limit: EXAM_COUNT,
      });
      if (error) throw new Error(error.message);
      const qs = (data ?? []) as ExamQ[];
      if (!qs.length) throw new Error('No questions found for that selection.');
      setQuestions(qs);
      setAnswers(new Array(qs.length).fill(null));
      setSel({ subject, year });
      setI(0);
      submittedRef.current = false;
      setStartedAt(new Date().toISOString());
      setPhase('play');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Something went wrong.');
      setPhase('error');
    }
  }

  function finish() {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setPhase('done');
  }

  // Auto-submit when the big timer expires.
  useEffect(() => {
    if (phase === 'play' && expired) finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, expired]);

  function choose(idx: number) {
    setAnswers((a) => {
      const next = [...a];
      next[i] = idx;
      return next;
    });
  }

  function go(delta: number) {
    setI((n) => Math.min(questions.length - 1, Math.max(0, n + delta)));
  }

  const score = useMemo(
    () => questions.reduce((acc, q, idx) => acc + (answers[idx] === q.correct_index ? 1 : 0), 0),
    [questions, answers]
  );

  // ----- PICK / LOADING -----
  if (phase === 'pick' || phase === 'loading') {
    return (
      <Shell>
        <p className="text-berrydeep font-display font-bold tracking-wide text-sm">EXAM MODE</p>
        <h1 className="mt-1 text-3xl font-extrabold text-ink">Section I — 20 in 20</h1>
        <p className="text-inksoft mt-1 text-sm">
          20 multiple-choice questions. One 20-minute clock. No going back to change your mind once
          time’s up — just like the real thing.
        </p>
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
        {phase === 'loading' && <p className="mt-6 text-plum font-semibold">Loading paper…</p>}
        <Link href="/" className="mt-6 text-sm text-muted underline">
          ← Home
        </Link>
      </Shell>
    );
  }

  // ----- ERROR -----
  if (phase === 'error') {
    return (
      <Shell>
        <h1 className="text-xl font-extrabold text-brick">Couldn’t load the paper</h1>
        <p className="mt-2 text-inksoft">{err}</p>
        <button onClick={() => setPhase('pick')} className="lg-btn lg-btn-primary mt-6 px-5 py-2.5">
          Back
        </button>
      </Shell>
    );
  }

  // ----- DONE (results + review) -----
  if (phase === 'done') {
    const pct = questions.length ? Math.round((score / questions.length) * 100) : 0;
    const b = band(pct);
    const subjLabel = SUBJECTS.find((s) => s.id === sel?.subject)?.label ?? '';
    return (
      <Shell wide>
        <div className="md:max-w-2xl md:mx-auto w-full">
          <p className="text-berrydeep font-display font-bold tracking-wide text-sm">EXAM COMPLETE</p>
          <h1 className="mt-2 text-6xl font-extrabold text-ink">
            {score}/{questions.length}
          </h1>
          <p className="mt-1 text-2xl font-display font-extrabold text-plum">{pct}%</p>
          <div className="lg-card mt-4 px-5 py-4">
            <div className="font-display font-extrabold text-2xl text-ink">{b.band}</div>
            <div className="text-sm text-inksoft mt-0.5">
              {subjLabel} Y{sel?.year} · Section I band range {b.label}
            </div>
            <p className="text-sm text-inksoft mt-2">
              {pct >= 90
                ? 'Elite. That’s a state-ranking pace — keep it up.'
                : pct >= 80
                  ? 'Strong Band 5. A bit more polish and Band 6 is in reach.'
                  : pct >= 70
                    ? 'Solid Band 4. Drill your weak topics in the Topic Map.'
                    : pct >= 60
                      ? 'Band 3 — you’ve got the fundamentals. Target the misses below.'
                      : pct >= 50
                        ? 'Band 2. The review list below is your study plan.'
                        : 'Band 1 today — but every miss below is a quick win. Let’s go.'}
            </p>
          </div>

          <h2 className="mt-7 font-display font-extrabold text-lg text-ink">Review</h2>
          <div className="mt-3 space-y-4">
            {questions.map((q, idx) => {
              const your = answers[idx];
              const right = your === q.correct_index;
              return (
                <div key={q.id} className="lg-card px-4 py-3.5">
                  <div className="flex items-start gap-2">
                    <span
                      className={`font-display font-extrabold ${right ? 'text-leaf' : 'text-brick'}`}
                    >
                      {right ? '✓' : '✗'}
                    </span>
                    <div className="flex-1">
                      <p className="font-semibold text-ink text-sm">
                        <span className="text-muted">Q{idx + 1}. </span>
                        <MathText text={q.stem} />
                      </p>
                      <p className="mt-2 text-sm">
                        <span className="text-muted">Your answer: </span>
                        {your === null ? (
                          <span className="text-brick italic">no answer</span>
                        ) : (
                          <span className={right ? 'text-leaf' : 'text-brick'}>
                            <MathText text={q.options[your]} />
                          </span>
                        )}
                      </p>
                      {!right && (
                        <p className="mt-1 text-sm">
                          <span className="text-muted">Correct: </span>
                          <span className="text-leaf">
                            <MathText text={q.options[q.correct_index]} />
                          </span>
                        </p>
                      )}
                      {q.explanation && (
                        <p className="mt-1.5 text-xs text-inksoft">
                          <MathText text={q.explanation} />
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-7 space-y-3">
            <button
              onClick={() => sel && start(sel.subject, sel.year)}
              className="lg-btn lg-btn-primary block w-full px-4 py-4"
            >
              Retry
            </button>
            <Link
              href="/"
              className="lg-card block w-full px-4 py-3.5 text-center font-display font-bold text-ink"
            >
              Exit
            </Link>
          </div>
        </div>
      </Shell>
    );
  }

  // ----- PLAY -----
  const q = questions[i];
  const picked = answers[i];
  const answeredCount = answers.filter((a) => a !== null).length;
  return (
    <Shell wide>
      <div className="flex items-center justify-between text-sm font-semibold">
        <span className="text-muted">
          Question {i + 1}/{questions.length} · {answeredCount} answered
        </span>
        <span className="text-base">
          <ExamTimer remaining={remaining} />
        </span>
      </div>
      <div className="mt-1 h-2 rounded-full bg-parchment-deep overflow-hidden">
        <div
          className="h-full bg-gold transition-all"
          style={{ width: `${((i + 1) / questions.length) * 100}%` }}
        />
      </div>

      <h2 className="mt-5 text-xl md:text-3xl md:text-center font-display font-bold leading-snug text-ink">
        <MathText text={q.stem} />
      </h2>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {q.options.map((opt, idx) => (
          <AnswerTile
            key={idx}
            index={idx}
            onClick={() => choose(idx)}
            reveal={picked === idx ? null : picked === null ? null : 'dim'}
          >
            <MathText text={opt} />
          </AnswerTile>
        ))}
      </div>
      {picked !== null && (
        <p className="mt-3 text-sm text-leaf font-semibold">Answer locked in — you can change it.</p>
      )}

      <div className="mt-6 flex items-center gap-3">
        <button
          onClick={() => go(-1)}
          disabled={i === 0}
          className="lg-card px-4 py-3 font-display font-bold text-ink disabled:opacity-40"
        >
          ← Prev
        </button>
        {i + 1 < questions.length ? (
          <button onClick={() => go(1)} className="lg-btn lg-btn-primary flex-1 px-4 py-3.5">
            Next →
          </button>
        ) : (
          <button onClick={finish} className="lg-btn lg-btn-berry flex-1 px-4 py-3.5">
            Submit exam
          </button>
        )}
      </div>
      <button onClick={finish} className="mt-4 text-sm text-muted underline self-start">
        Submit early
      </button>
    </Shell>
  );
}

function Shell({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <main
      className={`flex flex-1 flex-col px-6 pt-12 pb-10 w-full mx-auto ${
        wide ? 'max-w-md md:max-w-6xl md:px-12' : 'max-w-md'
      }`}
    >
      {children}
    </main>
  );
}
