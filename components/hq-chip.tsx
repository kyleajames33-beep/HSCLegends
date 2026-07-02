'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/lib/use-user';
import { getBase } from '@/lib/base';

// Home nudge: surfaces Sparks waiting at the Research HQ so the idle base actually
// pulls you back (the Clash-of-Clans "come collect" hook). Hidden when nothing's ready.
export default function HqChip() {
  const sb = useMemo(() => createClient(), []);
  const { user } = useUser();
  const [pending, setPending] = useState(0);

  useEffect(() => {
    if (!user) return;
    getBase(sb).then((b) => setPending(Math.min(b.cap, b.pending))).catch(() => {});
  }, [sb, user]);

  if (pending <= 0) return null;
  return (
    <Link href="/hq"
      className="lg-card flex items-center justify-between px-4 py-3 transition active:translate-y-0.5"
      style={{ boxShadow: '0 4px 0 #a87f3f' }}>
      <span className="font-display font-bold text-ink">🏛️ {pending} ✨ ready at your HQ</span>
      <span className="text-sm font-bold text-golddeep">Collect →</span>
    </Link>
  );
}
