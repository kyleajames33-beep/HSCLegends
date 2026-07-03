'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/lib/use-user';
import { getQuizQuestions, SUBJECTS, type Question, type Subject } from '@/lib/questions';
import { isCloseEnough } from '@/lib/fuzzy';
import { celebrate } from '@/lib/confetti';
import MathText from '@/components/math-text';

type Phase = 'pick' | 'loading' | 'play' | 'done' | 'error';
const TARGET = 8; // aim to present ~8 typeable questions

// A "typeable" answer is short and not a full sentence — free-recall works best
// on a term, name, or short phrase, not a paragraph.
function typeable(q: Question): boolean {
  const ans = q.options[q.correct_index];
  if (!ans) return false;
  const a = ans.trim();
  if (a.length === 0 || a.length > 40) return false;
  // Reject obvious full sentences: internal sentence punctuation, or long
  // multi-word phrases that read like prose.
  if (/[.!?](\s|$)/.test(a.slice(0, -1))) return false; // punctuation before the end
  if (a.split(/\s+/).length > 6) return false;
  return true;
}

export default function TypeGame() {
  const sb = useMemo(() => createClient(), []);
  const { user } = useUser();
  const [phase, setPhase] = useState<Phase>('pick');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [i, setI] = useState(0);
  const [typed, setTyped] = useState('');
  const [checked, setChecked] = useState(false);
  const [wasCorrect, setWasCorrect] = useState(false);
  const [score, setScore] = useState(0);
  const [thin, setThin] = useState(false); // fewer than TARGET typeable questions
  const [err, setErr] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  async function start(subject: Subject, year: 11 | 12) {
    setPhase('loading');
    try {
      const raw = await getQuizQuestions(sb, { subject, year, count: 12 });
      const usable = raw.filter(typeable).slice(0, TARGET);
      if (!usable.length) throw new Error('No short-answer questions found for that selection. Try another.');
      setQuestions(usable);
      setThin(usable.length < TARGET);
      setI(0);
      setScore(0);
      setTyped('');
      setChecked(false);
      setWasCorrect(false);
      setPhase('play');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Something went wrong.');
      setPhase('error');
    }
  }

  // Autofocus the input on each new question.
  useEffect(() => {
    if (phase === 'play' && !checked) inputRef.current?.focus();
  }, [phase, i, checked]);

  function submit() {
    if (checked) return;
    const q = questions[i];
    const answer = q.options[q.correct_index];
    const correct = isCloseEnough(typed, answer);
    setWasCorrect(correct);
    setChecked(true);
    if (correct) setScore((s) => s + 1);

    // Learning + quest hooks (signed-in only, fire-and-forget — never block play).
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
      setTyped('');
      setChecked(false);
      setWasCorrect(false);
    }
  }

  // On finish: celebrate + credit Sparks (typing is harder, reward a bit more).
  useEffect(() => {
    if (phase !== 'done') return;
    celebrate(score === questions.length && questions.length > 0);
    if (user) {
      sb.rpc('credit_coins', { p_amount: score * 3 + 5, p_reason: 'type_game', p_meta: null }).then(undefined, () => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  if (phase === 'pick' || phase === 'loading') {
    return (
      <Shell>
        <h1 className="text-3xl font-extrabold text-ink">⌨️ Type it</h1>
        <p className="text-inksoft mt-1 text-sm">Free-recall practice — no multiple choice. Type the answer from memory.</p>
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
    const total = questions.length;
    return (
      <Shell>
        <p className="text-berrydeep font-display font-bold tracking-wide text-sm">TYPE-IT COMPLETE</p>
        <h1 className="mt-2 text-6xl font-extrabold text-ink">
          {score}/{total}
        </h1>
        <p className="mt-3 text-inksoft">
          {score === total ? 'Flawless recall. Legend.' : 'Nice — typing it from memory sticks harder.'}
        </p>

        <div className="lg-card mt-5 px-4 py-4 text-center" style={{ boxShadow: '0 4px 0 #6b9b7c' }}>
          <div className="text-golddeep font-display font-extrabold text-sm">+{score * 3 + 5} ✨ Sparks</div>
          {user ? (
            <p className="text-xs text-inksoft mt-1">Wrong answers become review cards.</p>
          ) : (
            <p className="text-xs text-muted mt-1">Sign in to bank Sparks and save progress.</p>
          )}
        </div>

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
  const answer = q.options[q.correct_index];
  return (
    <Shell>
      <div className="flex items-center justify-between text-sm text-muted font-semibold">
        <span>
          Question {i + 1}/{questions.length}
        </span>
        <span className="uppercase tracking-wide">{q.subject.replace('-', ' ')}</span>
      </div>
      <div className="mt-1 h-2 rounded-full bg-parchment-deep overflow-hidden">
        <div className="h-full bg-gold transition-all" style={{ width: `${(i / questions.length) * 100}%` }} />
      </div>
      {thin && i === 0 && (
        <p className="mt-2 text-xs text-muted">Only {questions.length} short-answer question{questions.length === 1 ? '' : 's'} for this pick.</p>
      )}

      <h2 className="mt-5 text-xl font-display font-bold leading-snug text-ink">
        <MathText text={q.stem} />
      </h2>

      <form
        className="mt-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (!checked) submit();
        }}
      >
        <input
          ref={inputRef}
          type="text"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          disabled={checked}
          autoFocus
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          placeholder="Type your answer…"
          className="w-full rounded-2xl border-2 border-rule bg-panel px-4 py-4 text-lg font-semibold text-ink placeholder:text-muted focus:border-plum focus:outline-none disabled:opacity-70"
        />
        {!checked && (
          <button type="submit" disabled={!typed.trim()} className="lg-btn lg-btn-primary mt-4 w-full px-4 py-4 disabled:opacity-40">
            Submit
          </button>
        )}
      </form>

      {checked && (
        <div className="mt-5">
          <p className={`font-display font-extrabold text-xl ${wasCorrect ? 'text-leaf' : 'text-brick'}`}>
            {wasCorrect ? '✅ Correct!' : '❌ Not quite'}
          </p>
          <p className="mt-1 text-inksoft">
            {wasCorrect ? 'The answer was: ' : 'The answer was: '}
            <span className="font-bold text-ink"><MathText text={answer} /></span>
          </p>
          {q.explanation && (
            <p className="mt-2 text-sm text-inksoft"><MathText text={q.explanation} /></p>
          )}
          <button onClick={next} className="lg-btn lg-btn-primary mt-4 w-full px-4 py-4">
            {i + 1 >= questions.length ? 'Finish' : 'Next'}
          </button>
        </div>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex flex-1 flex-col px-6 pt-12 pb-10 max-w-md w-full mx-auto">
      {children}
    </main>
  );
}
