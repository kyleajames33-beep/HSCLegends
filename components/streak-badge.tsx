'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/lib/use-user';

// Shows the signed-in user's current streak, if any.
export default function StreakBadge() {
  const sb = useMemo(() => createClient(), []);
  const { user } = useUser();
  const [streak, setStreak] = useState<number | null>(null);

  useEffect(() => {
    if (!user) { setStreak(null); return; }
    sb.from('streaks').select('current').eq('user_id', user.id).maybeSingle()
      .then(({ data }) => setStreak(data?.current ?? 0));
  }, [user, sb]);

  if (!streak) return null;
  return (
    <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-zinc-900 border border-zinc-800 px-3 py-1.5 text-sm">
      🔥 <span className="font-bold">{streak}</span>
      <span className="text-zinc-500">day{streak === 1 ? '' : 's'}</span>
    </div>
  );
}
