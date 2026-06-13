'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/lib/use-user';

// Compact Sparks + streak chip for the home header. Hidden until signed in.
export default function WalletChip() {
  const { user } = useUser();
  const [coins, setCoins] = useState<number | null>(null);
  const [streak, setStreak] = useState(0);

  useEffect(() => {
    if (!user) return;
    const sb = createClient();
    sb.rpc('get_wallet').then(({ data }) => {
      const w = Array.isArray(data) ? data[0] : data;
      if (w) { setCoins(Number(w.coins ?? 0)); setStreak(Number(w.streak ?? 0)); }
    });
  }, [user]);

  if (!user || coins === null) return null;
  return (
    <div className="mt-3 inline-flex items-center gap-3 rounded-full bg-panel border border-rule px-4 py-1.5 text-sm font-display font-bold">
      <span className="text-golddeep">✨ {coins.toLocaleString()}</span>
      <span className="text-rule">·</span>
      <span className="text-coraldeep">🔥 {streak}</span>
    </div>
  );
}
