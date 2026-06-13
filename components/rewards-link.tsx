'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/lib/use-user';

// Prominent daily-habit entry: shows a "spin ready" pulse when today's spin is available.
export default function RewardsLink() {
  const { user } = useUser();
  const [spinReady, setSpinReady] = useState(false);

  useEffect(() => {
    if (!user) return;
    const sb = createClient();
    sb.rpc('get_spin_status').then(({ data }) => {
      const s = Array.isArray(data) ? data[0] : data;
      if (s) setSpinReady(!!s.can_spin);
    }, () => {});
  }, [user]);

  return (
    <Link href="/rewards" className="lg-card flex items-center justify-between px-4 py-3.5 active:translate-y-0.5 transition">
      <span className="font-display font-bold text-ink inline-flex items-center gap-2">
        🎁 Daily rewards
        {spinReady && <span className="inline-block h-2.5 w-2.5 rounded-full bg-coral animate-pulse" aria-label="spin ready" />}
      </span>
      <span className="text-sm text-muted inline-flex items-center gap-1">
        {spinReady ? 'spin ready!' : 'spin · quests'} <ChevronRight className="h-4 w-4" />
      </span>
    </Link>
  );
}
