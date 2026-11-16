'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/lib/use-user';
import { SUBJECTS, type Subject } from '@/lib/questions';
import { setLeaderboardOptIn } from '@/lib/progress';
import { getSubjectLeaderboard, type BoardRow } from '@/lib/daily';
import Avatar from '@/components/avatar';
import { PodiumSpot } from '@/components/spot';

export default function LeaderboardPage() {
  const auth = useUser();
  return <Suspense fallback={<main className="p-6">Loading leaderboard…</main>}><LeaderboardView key={auth.loading ? 'loading' : auth.user?.id ?? 'guest'} {...auth} /></Suspense>;
}

function LeaderboardView({ user }: ReturnType<typeof useUser>) {
  const sb = useMemo(() => createClient(), []);
  const search = useSearchParams();
  const [subject, setSubject] = useState<Subject>(() => {
    const value = search.get('subject');
    return SUBJECTS.find((item) => item.id === value)?.id ?? 'biology';
  });
  const [year, setYear] = useState<11 | 12>(() => search.get('year') === '11' ? 11 : 12);
  const [period, setPeriod] = useState<'day' | 'week'>('week');
  const [revision, setRevision] = useState(0);
  const [board, setBoard] = useState<{ key: string; rows: BoardRow[]; error?: string } | null>(null);
  const [optIn, setOptIn] = useState<boolean | null>(null);
  const [optErr, setOptErr] = useState('');
  const [saving, setSaving] = useState(false);
  const active = useRef(false);
  const key = `${subject}:${year}:${period}:${revision}`;
  const loading = board?.key !== key;
  const rows = loading ? [] : board.rows;
  const boardError = loading ? '' : board.error;

  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);
  useEffect(() => {
    let current = true;
    getSubjectLeaderboard(sb, subject, year, period).then((value) => {
      if (current) setBoard({ key, rows: value });
    }, () => { if (current) setBoard({ key, rows: [], error: 'Could not load leaderboard.' }); });
    return () => { current = false; };
  }, [sb, subject, year, period, key]);
  useEffect(() => {
    if (!user) return;
    let current = true;
    sb.from('user_profiles').select('leaderboard_opt_in').eq('user_id', user.id).single()
      .then(({ data, error }) => {
        if (!current) return;
        if (error || !data || typeof data.leaderboard_opt_in !== 'boolean') setOptErr('Could not load leaderboard setting.');
        else setOptIn(data.leaderboard_opt_in);
      }, () => { if (current) setOptErr('Could not load leaderboard setting.'); });
    return () => { current = false; };
  }, [user, sb]);

  async function toggle() {
    if (optIn === null || saving) return;
    const next = !optIn;
    setSaving(true); setOptErr('');
    try {
      await setLeaderboardOptIn(sb, next);
      if (!active.current) return;
      setOptIn(next); setRevision((value) => value + 1);
    } catch { if (active.current) setOptErr('Could not save leaderboard setting.'); }
    finally { if (active.current) setSaving(false); }
  }

  const label = SUBJECTS.find((s) => s.id === subject)?.label ?? subject;

  return (
    <main className="flex flex-1 flex-col px-6 pt-12 pb-10 max-w-md md:max-w-3xl w-full mx-auto">
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
        ) : boardError ? (
          <p className="text-brick" role="alert">{boardError}</p>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center text-center mt-4">
            <PodiumSpot className="w-52 h-auto" />
            <p className="text-muted text-sm mt-3">No scores yet — do this {period === 'day' ? "subject's daily quiz" : 'week’s quizzes'} and claim #1.</p>
          </div>
        ) : (
          <ol className="space-y-2">
            {rows.map((r) => (
              <li key={r.rank}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${r.is_me ? 'bg-gold/25 border border-gold/60' : 'bg-panel'}`}>
                <span className="text-muted tabular-nums w-5 text-center font-semibold">{r.rank}</span>
                <Avatar seed={r.avatar_seed || r.name} style={r.avatar_style || 'adventurer'} size={34} className="rounded-full shrink-0" />
                <span className="font-medium flex-1 truncate">{r.name}{r.is_me ? ' (you)' : ''}</span>
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
            <button onClick={toggle} type="button" role="switch" aria-checked={optIn === true} aria-label="Show me on leaderboards" disabled={saving || optIn === null}
              className={`relative h-6 w-11 rounded-full transition ${optIn ? 'bg-plum' : 'bg-rule'}`}>
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${optIn ? 'left-[22px]' : 'left-0.5'}`} />
            </button>
          </label>
        )}
        {optErr && <p className="mt-2 text-sm text-brick" role="alert">{optErr}</p>}
      </div>
    </main>
  );
}
