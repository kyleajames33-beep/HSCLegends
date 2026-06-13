'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { SUBJECTS, type Subject } from '@/lib/questions';
import { subjectModules, SUBJECT_LABELS, moduleName, type SyllabusModule } from '@/lib/syllabus';
import AnswerTile from '@/components/answer-tile';
import MathText from '@/components/math-text';

// "Past papers by topic" — the syllabus map. Pick a subject, see its HSC
// modules (grouped by Year 11 / Year 12 for sciences) with live per-module
// question counts, tap a module to drill it.
const DRILL_LIMIT = 12;

type DrillQ = {
  id: string;
  stem: string;
  options: string[];
  correct_index: number;
  explanation: string;
  year: number;
  difficulty: number;
  topic: string;
};

type View =
  | { kind: 'pick' }
  | { kind: 'map'; subject: Subject }
  | { kind: 'drill'; subject: Subject; code: string };

export default function TopicsPage() {
  const sb = useMemo(() => createClient(), []);
  const [view, setView] = useState<View>({ kind: 'pick' });

  // ----- SUBJECT PICK -----
  if (view.kind === 'pick') {
    return (
      <Shell>
        <p className="text-berrydeep font-display font-bold tracking-wide text-sm">TOPIC MAP</p>
        <h1 className="mt-1 text-3xl font-extrabold text-ink">Past papers by topic</h1>
        <p className="text-inksoft mt-1 text-sm">
          Every HSC module, every question we have for it. Drill your weak spots one module at a time.
        </p>
        <div className="mt-6 space-y-2.5">
          {SUBJECTS.map((s) => (
            <button
              key={s.id}
              onClick={() => setView({ kind: 'map', subject: s.id })}
              className="lg-card flex w-full items-center px-4 py-3.5 text-left"
            >
              <span className="flex-1 font-display font-bold text-ink">{s.label}</span>
              <span className="text-plum font-bold">→</span>
            </button>
          ))}
        </div>
        <Link href="/" className="mt-6 text-sm text-muted underline">
          ← Home
        </Link>
      </Shell>
    );
  }

  if (view.kind === 'map') {
    return (
      <ModuleMap
        sb={sb}
        subject={view.subject}
        onBack={() => setView({ kind: 'pick' })}
        onModule={(code) => setView({ kind: 'drill', subject: view.subject, code })}
      />
    );
  }

  // drill
  return (
    <ModuleDrill
      sb={sb}
      subject={view.subject}
      code={view.code}
      onBack={() => setView({ kind: 'map', subject: view.subject })}
    />
  );
}

// ---------------------------------------------------------------------------
// MAP — syllabus modules with count chips, grouped by year (sciences) or in
// order (maths).
// ---------------------------------------------------------------------------
function ModuleMap({
  sb,
  subject,
  onBack,
  onModule,
}: {
  sb: ReturnType<typeof createClient>;
  subject: Subject;
  onBack: () => void;
  onModule: (code: string) => void;
}) {
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    let live = true;
    (async () => {
      const { data, error } = await sb.rpc('get_module_counts', { p_subject: subject });
      if (!live) return;
      if (error) {
        setErr(error.message);
        setCounts({});
        return;
      }
      const map: Record<string, number> = {};
      for (const row of (data ?? []) as { module: string; n: number }[]) map[row.module] = row.n;
      setCounts(map);
    })();
    return () => {
      live = false;
    };
  }, [sb, subject]);

  const mods = subjectModules(subject);
  const isScience = mods.some((m) => m.year !== null);

  // Sciences: split into Year 12 / Year 11. Maths: single ordered group (null).
  const groups: { label: string | null; mods: SyllabusModule[] }[] = isScience
    ? ([12, 11] as const)
        .map((year) => ({ label: `YEAR ${year}`, mods: mods.filter((m) => m.year === year) }))
        .filter((g) => g.mods.length)
    : [{ label: null, mods }];

  return (
    <Shell>
      <button onClick={onBack} className="text-sm text-muted underline self-start">
        ← Subjects
      </button>
      <h1 className="mt-2 text-3xl font-extrabold text-ink">{SUBJECT_LABELS[subject]}</h1>
      <p className="text-inksoft mt-1 text-sm">Tap a module to drill it. Counts are live.</p>
      {err && <p className="mt-2 text-brick text-sm">Couldn’t load counts: {err}</p>}

      {groups.map((g, gi) => (
        <div key={g.label ?? `g-${gi}`} className="mt-6">
          {g.label && (
            <h2 className="font-display font-extrabold text-berrydeep tracking-wide text-sm">
              {g.label}
            </h2>
          )}
          <div className="mt-2 space-y-1.5">
            {g.mods.map((m) => {
              const n = counts?.[m.code] ?? 0;
              const ready = n > 0;
              return (
                <button
                  key={m.code}
                  disabled={!ready || counts === null}
                  onClick={() => onModule(m.code)}
                  className={`flex w-full items-center gap-2 rounded-xl border border-rule px-3.5 py-3 text-left ${
                    ready ? 'bg-panel active:translate-y-[1px]' : 'opacity-50'
                  }`}
                >
                  <span className="flex-1 text-sm font-semibold text-ink">{m.name}</span>
                  {ready ? (
                    <span className="rounded-full bg-leaf/20 text-leaf font-bold text-xs px-2 py-0.5">
                      {n} Q
                    </span>
                  ) : (
                    <span className="rounded-full bg-parchment-deep text-muted text-xs px-2 py-0.5">
                      coming soon
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {counts === null && <p className="mt-6 text-plum font-semibold">Loading counts…</p>}
    </Shell>
  );
}

// ---------------------------------------------------------------------------
// DRILL — quiz UI over get_module_questions, explanation reveal per question.
// ---------------------------------------------------------------------------
function ModuleDrill({
  sb,
  subject,
  code,
  onBack,
}: {
  sb: ReturnType<typeof createClient>;
  subject: Subject;
  code: string;
  onBack: () => void;
}) {
  const [questions, setQuestions] = useState<DrillQ[] | null>(null);
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState('');

  const title = moduleName(subject, code);

  useEffect(() => {
    let live = true;
    (async () => {
      const { data, error } = await sb.rpc('get_module_questions', {
        p_subject: subject,
        p_module: code,
        p_limit: DRILL_LIMIT,
      });
      if (!live) return;
      if (error) {
        setErr(error.message);
        setQuestions([]);
        return;
      }
      setQuestions((data ?? []) as DrillQ[]);
    })();
    return () => {
      live = false;
    };
  }, [sb, subject, code]);

  function choose(idx: number) {
    if (picked !== null || !questions) return;
    setPicked(idx);
    if (idx === questions[i].correct_index) setScore((s) => s + 1);
  }

  function next() {
    if (!questions) return;
    if (i + 1 >= questions.length) setDone(true);
    else {
      setI((n) => n + 1);
      setPicked(null);
    }
  }

  if (questions === null) {
    return (
      <Shell>
        <p className="mt-6 text-plum font-semibold">Loading {title}…</p>
      </Shell>
    );
  }

  if (err || !questions.length) {
    return (
      <Shell>
        <h1 className="text-xl font-extrabold text-ink">{title}</h1>
        <p className="mt-2 text-inksoft">{err || 'No questions available yet for this module.'}</p>
        <button onClick={onBack} className="lg-btn lg-btn-primary mt-6 px-5 py-2.5">
          ← Back to map
        </button>
      </Shell>
    );
  }

  if (done) {
    return (
      <Shell>
        <p className="text-berrydeep font-display font-bold tracking-wide text-sm">DRILL COMPLETE</p>
        <p className="text-inksoft text-sm">{title}</p>
        <h1 className="mt-2 text-6xl font-extrabold text-ink">
          {score}/{questions.length}
        </h1>
        <div className="mt-6 space-y-3">
          <button
            onClick={() => {
              setI(0);
              setPicked(null);
              setScore(0);
              setDone(false);
            }}
            className="lg-btn lg-btn-primary block w-full px-4 py-4"
          >
            Drill again
          </button>
          <button
            onClick={onBack}
            className="lg-card block w-full px-4 py-3.5 text-center font-display font-bold text-ink"
          >
            Back to map
          </button>
        </div>
      </Shell>
    );
  }

  const q = questions[i];
  return (
    <Shell wide>
      <div className="flex items-center justify-between text-sm text-muted font-semibold">
        <span>
          Question {i + 1}/{questions.length}
        </span>
        <button onClick={onBack} className="underline">
          {title} ✕
        </button>
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
          <p
            className={`font-display font-extrabold text-xl ${
              picked === q.correct_index ? 'text-leaf' : 'text-brick'
            }`}
          >
            {picked === q.correct_index ? '✅ Correct!' : '❌ Not quite'}
          </p>
          {q.explanation && (
            <p className="mt-1 text-sm text-inksoft">
              <MathText text={q.explanation} />
            </p>
          )}
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
      className={`flex flex-1 flex-col px-6 pt-14 pb-10 w-full mx-auto ${
        wide ? 'max-w-md md:max-w-6xl md:px-12' : 'max-w-md'
      }`}
    >
      {children}
    </main>
  );
}
