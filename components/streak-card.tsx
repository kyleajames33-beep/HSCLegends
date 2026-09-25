'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/lib/use-user';
import { getStreakOverview, type StreakOverview } from '@/lib/rewards';

// What today means for the streak, in one line. Shared with the /streak screen.
export function streakLine(o: StreakOverview, today: string): string {
  if (o.repair_open && o.broken_streak) return `Your ${o.broken_streak}-day streak broke. Win it back today.`;
  if (o.last_date === today) return 'Done for today. See you tomorrow!';
  if (o.current === 0) return 'Finish a quiz to start a streak.';
  if (o.will_reset) return 'Play today to start a fresh streak.';
  if (o.missed_days > 0) return `A freeze will cover ${o.missed_days === 1 ? 'the day' : `${o.missed_days} days`} you missed. Play today to keep it.`;
  return `Play today to make it ${o.current + 1}.`;
}

// Sydney calendar date as YYYY-MM-DD — matches the server's streak day.
export const sydneyToday = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney' }).format(new Date());

// Home streak row: count, today's status, and freeze stock. Opens /streak.
export default function StreakCard() {
  const sb = useMemo(() => createClient(), []);
  const { user } = useUser();
  const [o, setO] = useState<StreakOverview | null>(null);
  const [today] = useState(sydneyToday);

  useEffect(() => {
    if (!user) return;
    getStreakOverview(sb).then(setO).catch(() => {});
  }, [user, sb]);

  if (!user || !o) return null;
  const freezes = o.freezes + (o.weekly_freeze_ready ? 1 : 0);
  const hot = o.repair_open;

  return (
    <Link href="/streak"
      className="lg-card flex items-center gap-3 px-4 py-3.5 transition active:translate-y-0.5"
      style={hot ? { boxShadow: '0 4px 0 #c47165', borderColor: '#e89b8b' } : undefined}>
      <span className={`text-3xl leading-none ${o.current === 0 || hot ? 'grayscale' : ''}`}>🔥</span>
      <div className="min-w-0 flex-1">
        <p className="font-display font-extrabold text-ink">{hot ? 'Streak broken' : `${o.current}-day streak`}</p>
        <p className="text-xs text-inksoft">{streakLine(o, today)}</p>
      </div>
      <span className="shrink-0 inline-flex items-center gap-1 text-sm font-bold text-ink" aria-label={`${freezes} freezes available`}>
        ❄️ {freezes}
        <ChevronRight className="h-4 w-4 text-inksoft" />
      </span>
    </Link>
  );
}
