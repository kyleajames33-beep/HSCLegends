'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/lib/use-user';
import { SUBJECTS, type Subject } from '@/lib/questions';
import { setLeaderboardOptIn } from '@/lib/progress';
import { getSubjectLeaderboard, type BoardRow } from '@/lib/daily';

export default function LeaderboardPage() {
  const sb = useMemo(() => createClient(), []);
  const { user } = useUser();
  const [subject, setSubject] = useState<Subject>('biology');
  const [year, setYear] = useState<11 | 12>(12);
  const [period, setPeriod] = useState<'day' | 'week'>('week');
  const [rows, setRows] = useState<BoardRow[]>([]);
  const [optIn, setOptIn] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  // Default the board from the URL (e.g. coming from a finished daily quiz).
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const s = p.get('subject') as Subject;
    const y = Number(p.get('year'));
    if (s && SUBJECTS.some((x) => x.id === s)) setSubject(s);
    if (y === 11 || y === 12) setYear(y);
  }, []);

  async function load() {
    setLoading(true);
    setRows(await getSubjectLeaderboard(sb, subject, year, period));
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [subject, year, period]);

  useEffect(() => {
    if (!user) { setOptIn(null); return; }
    sb.from('user_profiles').select('leaderboard_opt_in').eq('user_id', user.id).single()
      .then(({ data }) => setOptIn(Boolean(data?.leaderboard_opt_in)));
  }, [user, sb]);

  async function toggle() {
    const next = !optIn;
    setOptIn(next);
    await setLeaderboardOptIn(sb, next);
    load();
  }

  const label = SUBJECTS.find((s) => s.id === subject)?.label ?? subject;

  return (
    <main className="flex flex-1 flex-col px-6 pt-12 pb-10 max-w-md w-full mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold text-ink">🏆 Leaderboard</h1>
        <Link href="/" className="text-sm text-muted underline">Home</Link>
      </div>

      {/* subject + year picker */}
      <div className="mt-4 flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {SUBJECTS.map((s) => (
          <button key={s.id} onClick={() => setSubject(s.id)}
            className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-semibold transition ${subject === s.id ? 'bg-plum text-white' : 'bg-parchment-deep text-ink'}`}>
            {s.label}
          </button>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        {[11, 12].map((y) => (
          <button key={y} onClick={() => setYear(y as 11 | 12)}
            className={`rounded-full px-3 py-1 text-sm font-semibold ${year === y ? 'bg-berry text-white' : 'bg-parchment-deep text-ink'}`}>Year {y}</button>
        ))}
        <div className="ml-auto flex gap-1 rounded-full bg-parchment-deep p-1">
          {(['day', 'week'] as const).map((p) => (
            <button key={p} onClick={() => setPeriod(p)}
              className={`rounded-full px-3 py-1 text-sm font-semibold ${period === p ? 'bg-plum text-white' : 'text-ink'}`}>
              {p === 'day' ? 'Today' : 'Week'}
            </button>
          ))}
        </div>
      </div>

      <p className="mt-4 font-display font-bold text-ink">{label} · Year {year}</p>

      <div className="mt-2 flex-1">
        {loading ? (
          <p className="text-muted">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-muted text-sm">No scores yet. Do this {period === 'day' ? "subject's daily quiz" : 'week’s quizzes'} to get on the board.</p>
        ) : (
          <ol className="space-y-2">
            {rows.map((r) => (
              <li key={r.rank}
                className={`flex items-center justify-between rounded-xl px-4 py-3 ${r.is_me ? 'bg-gold/25 border border-gold/60' : 'bg-panel'}`}>
                <span className="font-medium"><span className="text-muted tabular-nums mr-2">{r.rank}</span>{r.name}{r.is_me ? ' (you)' : ''}</span>
                <span className="tabular-nums font-bold">{r.score}</span>
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="mt-6 border-t border-rule pt-4">
        {!user ? (
          <Link href="/login?next=/leaderboard" className="lg-btn lg-btn-primary block w-full px-4 py-3 text-center">
            Sign in to compete
          </Link>
        ) : (
          <label className="flex items-center justify-between text-sm">
            <span className="text-ink">Show me on leaderboards</span>
            <button onClick={toggle}
              className={`relative h-6 w-11 rounded-full transition ${optIn ? 'bg-plum' : 'bg-rule'}`}>
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${optIn ? 'left-[22px]' : 'left-0.5'}`} />
            </button>
          </label>
        )}
      </div>
    </main>
  );
}
