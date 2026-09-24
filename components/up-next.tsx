'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/lib/use-user';
import { getDueReviews } from '@/lib/learning';
import { getBase } from '@/lib/base';
import { Band } from '@/components/hub';

// "Up next" — the three quick follow-ups after the mission: due reviews, the
// daily spin/quests, and Sparks waiting at the HQ. Always three tiles, so the
// row keeps its shape; each shows its live count when there is one.
export default function UpNext() {
  const sb = useMemo(() => createClient(), []);
  const { user } = useUser();
  const [due, setDue] = useState<number | null>(null);
  const [spin, setSpin] = useState(false);
  const [hq, setHq] = useState(0);

  useEffect(() => {
    if (!user) return;
    getDueReviews(sb, 20).then((qs) => setDue(qs.length)).catch(() => {});
    sb.rpc('get_spin_status').then(({ data }) => {
      const s = Array.isArray(data) ? data[0] : data;
      if (s) setSpin(!!s.can_spin);
    }, () => {});
    getBase(sb).then((b) => setHq(Math.min(b.cap, b.pending))).catch(() => {});
  }, [user, sb]);

  if (!user) return null;
  const tiles = [
    { href: '/review', emoji: '🧠', title: 'Review', sub: due ? `${due >= 20 ? '20+' : due} due` : 'all clear', hot: !!due },
    { href: '/rewards', emoji: '🎁', title: 'Rewards', sub: spin ? 'spin ready' : 'quests', hot: spin },
    { href: '/hq', emoji: '🏛️', title: 'HQ', sub: hq > 0 ? `${hq} ✨ ready` : 'building', hot: hq > 0 },
  ];

  return (
    <>
      <Band>UP NEXT</Band>
      <div className="grid grid-cols-3 gap-3">
        {tiles.map((t) => (
          <Link key={t.href} href={t.href} className="lg-card relative px-3 py-3 transition active:translate-y-0.5">
            {t.hot && <span className="absolute right-2.5 top-2.5 h-2.5 w-2.5 rounded-full bg-coral" aria-hidden />}
            <div className="text-2xl">{t.emoji}</div>
            <div className="mt-1 font-display font-bold text-ink">{t.title}</div>
            <div className="text-xs text-inksoft">{t.sub}</div>
          </Link>
        ))}
      </div>
    </>
  );
}
