'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/lib/use-user';
import { getMyWeek, leagueTier, type MyWeek } from '@/lib/progress';
import ShareButton from '@/components/share-button';

// Signed-in hub: streak + total XP (one-directional) and weekly League + rank
// (reversible — resets each week).
export default function HomeStats() {
  const sb = useMemo(() => createClient(), []);
  const { user } = useUser();
  const [streak, setStreak] = useState<number | null>(null);
  const [xp, setXp] = useState<number | null>(null);
  const [week, setWeek] = useState<MyWeek | null>(null);

  useEffect(() => {
    if (!user) { setStreak(null); setXp(null); setWeek(null); return; }
    sb.from('streaks').select('current').eq('user_id', user.id).maybeSingle()
      .then(({ data }) => setStreak(data?.current ?? 0));
    sb.from('user_stats').select('total_xp').eq('user_id', user.id).maybeSingle()
      .then(({ data }) => setXp(data?.total_xp ?? 0));
    getMyWeek(sb).then(setWeek).catch(() => {});
  }, [user, sb]);

  if (!user) return null;
  const tier = leagueTier(week?.weekly_xp ?? 0);
  const progress = tier.next ? Math.min(1, (week?.weekly_xp ?? 0) / tier.next) : 1;

  return (
    <div className="mt-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="lg-card px-4 py-3 text-center">
          <div className="text-2xl font-display font-extrabold text-coraldeep">🔥 {streak ?? '–'}</div>
          <div className="text-xs text-muted">day streak</div>
        </div>
        <div className="lg-card px-4 py-3 text-center">
          <div className="text-2xl font-display font-extrabold text-ink">{xp ?? '–'}</div>
          <div className="text-xs text-muted">total XP</div>
        </div>
      </div>
      <div className="lg-card px-4 py-3">
        <div className="flex items-center justify-between">
          <span className="font-display font-bold text-ink">{tier.emoji} {tier.name} League</span>
          {week && week.rank > 0 && <span className="text-sm text-inksoft">#{week.rank} this week</span>}
        </div>
        <div className="mt-2 h-2 rounded-full bg-parchment-deep overflow-hidden">
          <div className="h-full bg-gold" style={{ width: `${progress * 100}%` }} />
        </div>
        <div className="mt-1 text-xs text-muted">
          {tier.next ? `${week?.weekly_xp ?? 0} / ${tier.next} XP to next league` : `${week?.weekly_xp ?? 0} XP this week · top tier`}
        </div>
      </div>
      {!!streak && (
        <div className="text-center">
          <ShareButton streak={streak} className="text-sm text-berrydeep font-semibold underline" />
        </div>
      )}
    </div>
  );
}
