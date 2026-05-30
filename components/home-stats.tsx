'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/lib/use-user';

// Signed-in hub stats: current streak + total XP. Hidden when logged out.
export default function HomeStats() {
  const sb = useMemo(() => createClient(), []);
  const { user } = useUser();
  const [streak, setStreak] = useState<number | null>(null);
  const [xp, setXp] = useState<number | null>(null);

  useEffect(() => {
    if (!user) {
      setStreak(null);
      setXp(null);
      return;
    }
    sb.from('streaks').select('current').eq('user_id', user.id).maybeSingle()
      .then(({ data }) => setStreak(data?.current ?? 0));
    sb.from('user_stats').select('total_xp').eq('user_id', user.id).maybeSingle()
      .then(({ data }) => setXp(data?.total_xp ?? 0));
  }, [user, sb]);

  if (!user) return null;

  return (
    <div className="mt-4 grid grid-cols-2 gap-3">
      <div className="rounded-2xl bg-zinc-900 px-4 py-3 text-center">
        <div className="text-2xl font-bold">🔥 {streak ?? '–'}</div>
        <div className="text-xs text-zinc-500">day streak</div>
      </div>
      <div className="rounded-2xl bg-zinc-900 px-4 py-3 text-center">
        <div className="text-2xl font-bold">{xp ?? '–'}</div>
        <div className="text-xs text-zinc-500">total XP</div>
      </div>
    </div>
  );
}
