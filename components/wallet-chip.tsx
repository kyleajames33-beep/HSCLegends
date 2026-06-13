'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/lib/use-user';

// Compact Sparks + streak chip for the home header. Hidden until signed in.
export default function WalletChip() {
  const { user } = useUser();
  const [coins, setCoins] = useState<number | null>(null);
  const [streak, setStreak] = useState(0);
  const [welcomed, setWelcomed] = useState(0);

  useEffect(() => {
    if (!user) return;
    const sb = createClient();
    // Grant the one-time welcome bonus (idempotent) before reading the wallet.
    sb.rpc('grant_welcome_bonus').then(({ data }) => {
      if (typeof data === 'number' && data > 0) setWelcomed(data);
      sb.rpc('get_wallet').then(({ data: w }) => {
        const row = Array.isArray(w) ? w[0] : w;
        if (row) { setCoins(Number(row.coins ?? 0)); setStreak(Number(row.streak ?? 0)); }
      });
    }, () => {});
  }, [user]);

  if (!user || coins === null) return null;
  return (
    <div className="mt-3 inline-flex flex-col items-center gap-1">
      <div className="inline-flex items-center gap-3 rounded-full bg-panel border border-rule px-4 py-1.5 text-sm font-display font-bold">
        <span className="text-golddeep">✨ {coins.toLocaleString()}</span>
        <span className="text-rule">·</span>
        <span className="text-coraldeep">🔥 {streak}</span>
      </div>
      {welcomed > 0 && (
        <span className="text-xs font-display font-bold text-leaf">🎉 Welcome bonus +{welcomed} ✨ — open a pack!</span>
      )}
    </div>
  );
}
