'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/lib/use-user';
import {
  getProgress, getWeakTopics, bandRange, levelLabel,
  type SubjectProgress, type WeakTopic,
} from '@/lib/learning';
import { SUBJECTS, type Subject } from '@/lib/questions';
import MasteryRing from '@/components/mastery-ring';

type Phase = 'loading' | 'ready' | 'empty' | 'error' | 'signedout';

function subjectLabel(id: SubjectProgress['subject']): string {
  if (id === 'overall') return 'Overall';
  return SUBJECTS.find((s) => s.id === id)?.label ?? id;
}

// Tint the ring by mastery so a glance reads pass/strong.
function ringColor(pct: number): string {
  if (pct >= 80) return '#6b9b7c';  // leaf
  if (pct >= 50) return '#d6a85f';  // gold
  return '#c47b8a';                 // berry
}

export default function ProgressPage() {
  const sb = useMemo(() => createClient(), []);
  const { user, loading: userLoading } = useUser();
  const [phase, setPhase] = useState<Phase>('loading');
  const [rows, setRows] = useState<SubjectProgress[]>([]);
  const [weak, setWeak] = useState<WeakTopic[]>([]);
  const [err, setErr] = useState('');

  async function load() {
    setPhase('loading');
    setErr('');
    try {
      const [p, w] = await Promise.all([getProgress(sb), getWeakTopics(sb, null, 3)]);
      if (!p.length) { setPhase('empty'); return; }
      setRows(p);
      setWeak(w);
      setPhase('ready');
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

  if (phase === 'loading') {
    return <Shell><p className="mt-10 text-plum font-semibold">Loading your progress…</p></Shell>;
  }

  if (phase === 'signedout') {
    return (
      <Shell>
        <h1 className="text-3xl font-extrabold text-ink">📈 Progress</h1>
        <p className="mt-2 text-inksoft">Sign in to track your mastery per topic and see your predicted band range.</p>
        <Link href="/login?next=/progress" className="lg-btn lg-btn-berry mt-6 block w-full px-4 py-4 text-center">Sign in</Link>
        <Link href="/" className="lg-card mt-3 block w-full px-4 py-3.5 text-center font-display font-bold text-ink">Home</Link>
      </Shell>
    );
  }

  if (phase === 'error') {
    return (
      <Shell>
        <h1 className="text-xl font-extrabold text-brick">Couldn’t load progress</h1>
        <p className="mt-2 text-inksoft">{err}</p>
        <button onClick={load} className="lg-btn lg-btn-primary mt-6 px-5 py-2.5">Try again</button>
      </Shell>
    );
  }

  if (phase === 'empty') {
    return (
      <Shell>
        <h1 className="text-3xl font-extrabold text-ink">📈 Progress</h1>
        <p className="mt-3 text-inksoft">No data yet — play a few questions and your mastery will start filling in here.</p>
        <Link href="/play" className="lg-btn lg-btn-primary mt-6 block w-full px-4 py-4 text-center">Play a quick game</Link>
        <Link href="/" className="lg-card mt-3 block w-full px-4 py-3.5 text-center font-display font-bold text-ink">Home</Link>
      </Shell>
    );
  }

  const overall = rows.find((r) => r.subject === 'overall');
  const subjects = rows.filter((r) => r.subject !== 'overall');

  return (
    <Shell>
      <h1 className="text-3xl font-extrabold text-ink">📈 Progress</h1>

      {overall && (
        <div className="lg-card mt-5 flex items-center gap-4 px-4 py-4">
          <MasteryRing
            pct={overall.mastery_pct}
            color={ringColor(overall.mastery_pct)}
            band={bandRange(overall.band_low, overall.band_high)}
            size={104}
          />
          <div className="flex-1">
            <p className="font-display font-extrabold text-lg text-ink">Predicted band</p>
            <p className="text-2xl font-display font-extrabold text-plum">{bandRange(overall.band_low, overall.band_high)}</p>
            <p className="mt-1 text-xs text-muted leading-snug">
              Estimates the written-exam half only — not your moderated school assessment.
            </p>
          </div>
        </div>
      )}

      {weak.length > 0 && (
        <div className="lg-card mt-5 px-4 py-4" style={{ boxShadow: '0 4px 0 #c47165' }}>
          <p className="font-display font-extrabold text-ink">Focus on these {weak.length}</p>
          <div className="mt-3 space-y-2">
            {weak.map((w) => (
              <div key={`${w.subject}:${w.topic}`} className="flex items-center gap-2 text-sm">
                <span className="flex-1 font-semibold text-ink truncate">{w.topic}</span>
                <span className="text-muted">{subjectLabel(w.subject)}</span>
                <span className="rounded-full bg-parchment-deep px-2 py-0.5 text-xs font-semibold text-inksoft">{levelLabel(w.level)}</span>
                {w.due_count > 0 && (
                  <span className="rounded-full bg-brick px-2 py-0.5 text-xs font-bold text-white">{w.due_count} due</span>
                )}
              </div>
            ))}
          </div>
          <Link href="/review" className="lg-btn lg-btn-berry mt-4 block w-full px-4 py-3 text-center">🧠 Review these now</Link>
        </div>
      )}

      <p className="mt-6 mb-3 font-display font-extrabold text-ink">By subject</p>
      <div className="grid grid-cols-2 gap-3">
        {subjects.map((s) => (
          <div key={s.subject} className="lg-card flex flex-col items-center px-3 py-4">
            <MasteryRing
              pct={s.mastery_pct}
              color={ringColor(s.mastery_pct)}
              band={bandRange(s.band_low, s.band_high)}
              label={`${subjectLabel(s.subject)} · ${s.attempts} ans`}
              size={88}
            />
          </div>
        ))}
      </div>

      <Link href="/" className="lg-card mt-6 block w-full px-4 py-3.5 text-center font-display font-bold text-ink">Home</Link>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex flex-1 flex-col px-6 pt-14 pb-10 max-w-md w-full mx-auto">
      {children}
    </main>
  );
}
