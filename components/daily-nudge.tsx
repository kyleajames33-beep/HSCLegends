'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/lib/use-user';
import { getDueReviews } from '@/lib/learning';

// Local calendar date as YYYY-MM-DD. Module-level (only called inside the effect,
// never during render) so the react-compiler purity check stays happy.
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// The session-open hook: surfaces the single most urgent thing to do today —
// protect a streak that's about to lapse, else clear any due reviews. Renders
// nothing when there's nothing pressing (studied today + nothing due).
export default function DailyNudge() {
  const sb = useMemo(() => createClient(), []);
  const { user } = useUser();
  const [streak, setStreak] = useState<{ current: number; atRisk: boolean } | null>(null);
  const [due, setDue] = useState(0);

  useEffect(() => {
    // No synchronous reset on sign-out: the render guard below returns null when !user.
    if (!user) return;
    let live = true;
    const today = todayStr();
    sb.from('streaks').select('current,last_date').eq('user_id', user.id).maybeSingle()
      .then(({ data }) => {
        if (!live) return;
        const cur = data?.current ?? 0;
        setStreak({ current: cur, atRisk: cur > 0 && data?.last_date !== today });
      });
    getDueReviews(sb, 20).then((qs) => { if (live) setDue(qs.length); }).catch(() => {});
    return () => { live = false; };
  }, [user, sb]);

  if (!user || !streak) return null;
  const dueLabel = due >= 20 ? '20+' : String(due);

  // 1) Streak about to lapse — loss aversion is the strongest pull.
  if (streak.atRisk) {
    return (
      <Link href="/play" className="block rounded-2xl px-4 py-3.5 text-white active:translate-y-0.5 transition"
        style={{ background: 'linear-gradient(135deg,#c47b5a,#9c5c6e)', boxShadow: '0 4px 0 #7a4452' }}>
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="font-display font-extrabold">🔥 Keep your {streak.current}-day streak!</div>
            <div className="text-xs opacity-85">
              Play one quick game today so it doesn’t reset{due > 0 ? ` · ${dueLabel} reviews ready too` : ''}
            </div>
          </div>
          <span className="shrink-0 rounded-full bg-white/25 px-3 py-1 text-sm font-extrabold">Play</span>
        </div>
      </Link>
    );
  }

  // 2) Reviews are due — tie back to the (now rewarded) spaced-repetition loop.
  if (due > 0) {
    return (
      <Link href="/review" className="block lg-card px-4 py-3.5 active:translate-y-0.5 transition">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="font-display font-extrabold text-ink">🧠 {dueLabel} review{due === 1 ? '' : 's'} ready</div>
            <div className="text-xs text-muted">Lock them in — +3 ✨ each</div>
          </div>
          <span className="shrink-0 rounded-full bg-plum text-white px-3 py-1 text-sm font-extrabold">Review</span>
        </div>
      </Link>
    );
  }

  return null;
}
