'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/lib/use-user';
import { SUBJECTS, type Subject } from '@/lib/questions';
import { getWeeklyLeaderboard, setLeaderboardOptIn, type LeaderRow } from '@/lib/progress';

export default function LeaderboardPage() {
  const sb = useMemo(() => createClient(), []);
  const { user } = useUser();
  const [subject, setSubject] = useState<Subject | null>(null);
  const [rows, setRows] = useState<LeaderRow[]>([]);
  const [optIn, setOptIn] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setRows(await getWeeklyLeaderboard(sb, subject));
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [subject]);

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

  return (
    <main className="flex flex-1 flex-col px-6 pt-12 pb-10 max-w-md w-full mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">This week 🔥</h1>
        <Link href="/" className="text-sm text-zinc-500 underline">Home</Link>
      </div>

      <div className="mt-4 flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        <Chip active={subject === null} onClick={() => setSubject(null)}>All</Chip>
        {SUBJECTS.map((s) => (
          <Chip key={s.id} active={subject === s.id} onClick={() => setSubject(s.id)}>{s.label}</Chip>
        ))}
      </div>

      <div className="mt-5 flex-1">
        {loading ? (
          <p className="text-zinc-500">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-zinc-500 text-sm">No one on the board yet this week. Play a Quick Game to get on it.</p>
        ) : (
          <ol className="space-y-2">
            {rows.map((r) => (
              <li key={r.rank}
                className={`flex items-center justify-between rounded-xl px-4 py-3 ${r.is_me ? 'bg-indigo-600/20 border border-indigo-500/40' : 'bg-zinc-900'}`}>
                <span className="font-medium"><span className="text-zinc-500 tabular-nums mr-2">{r.rank}</span>{r.name}{r.is_me ? ' (you)' : ''}</span>
                <span className="tabular-nums font-bold">{r.xp}</span>
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="mt-6 border-t border-zinc-800 pt-4">
        {!user ? (
          <Link href="/login?next=/leaderboard" className="block w-full rounded-xl bg-indigo-600 px-4 py-3 text-center font-semibold">
            Sign in to compete
          </Link>
        ) : (
          <label className="flex items-center justify-between text-sm">
            <span className="text-zinc-300">Show me on the leaderboard</span>
            <button onClick={toggle}
              className={`relative h-6 w-11 rounded-full transition ${optIn ? 'bg-indigo-600' : 'bg-zinc-700'}`}>
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${optIn ? 'left-[22px]' : 'left-0.5'}`} />
            </button>
          </label>
        )}
      </div>
    </main>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition ${active ? 'bg-indigo-600' : 'bg-zinc-800 text-zinc-300'}`}>
      {children}
    </button>
  );
}
