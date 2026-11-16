'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/lib/use-user';
import { SUBJECTS, type Subject } from '@/lib/questions';
import { getDailyDone } from '@/lib/daily';

// The directed daily pathway: the student's prescribed quizzes (their subjects,
// their year), with done/todo status.
export default function TodayQuizzes() {
  const { user, loading } = useUser();
  return !loading && user ? <AccountQuizzes key={user.id} userId={user.id} /> : null;
}

function AccountQuizzes({ userId }: { userId: string }) {
  const sb = useMemo(() => createClient(), []);
  const [year, setYear] = useState<number | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [done, setDone] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data, error } = await sb.from('user_profiles').select('year, subjects').eq('user_id', userId).maybeSingle();
      if (error) throw error;
      if (!active) return;
      setYear(data?.year ?? null);
      setSubjects(((data?.subjects ?? []) as string[]).filter((s) => SUBJECTS.some((x) => x.id === s)) as Subject[]);
      const completed = await getDailyDone(sb);
      if (active) { setDone(completed); setReady(true); }
    })().catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [userId, sb]);

  if (error) return <p role="status" className="mt-5 text-sm text-brick">Today’s quizzes are unavailable right now. Please try again later.</p>;
  if (!ready) return null;

  if (!year || subjects.length === 0) {
    return (
      <Link href="/welcome" className="lg-card mt-5 block px-4 py-4 text-center active:translate-y-0.5 transition">
        <div className="font-display font-bold text-ink">Set up your subjects →</div>
        <div className="text-xs text-muted mt-0.5">to unlock your daily quizzes</div>
      </Link>
    );
  }

  const doneCount = subjects.filter((s) => done.includes(s)).length;
  const allDone = doneCount === subjects.length;
  const label = (id: Subject) => SUBJECTS.find((x) => x.id === id)?.label ?? id;

  return (
    <div className="mt-5">
      <div className="flex items-center justify-between">
        <h2 className="font-display font-extrabold text-lg text-ink">
          {allDone ? "Today's quizzes — done! 🎉" : "Today's quizzes"}
        </h2>
        <span className="text-sm text-muted">{doneCount}/{subjects.length}</span>
      </div>
      <div className="mt-3 space-y-2">
        {subjects.map((s) => {
          const isDone = done.includes(s);
          return (
            <Link key={s} href={`/play?daily=1&subject=${s}&year=${year}`}
              className="lg-card flex items-center justify-between px-4 py-3.5 active:translate-y-0.5 transition">
              <span className="font-display font-bold text-ink">
                {label(s)} <span className="text-muted font-normal text-sm">· Y{year}</span>
              </span>
              {isDone ? (
                <span className="text-leaf font-bold text-sm">✓ done</span>
              ) : (
                <span className="lg-btn lg-btn-primary px-4 py-1.5 text-sm">Play ▶</span>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
