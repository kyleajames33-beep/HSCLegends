'use client';

import { useEffect, useEffectEvent, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/lib/use-user';

type Wallet = { owner: string; coins: number; streak: number; welcomed: number } | { owner: string; error: true };
const validBalance = (value: unknown) => (typeof value === 'number' || (typeof value === 'string' && value.trim() !== '')) && Number.isFinite(Number(value)) && Number(value) >= 0;

// Compact Sparks + streak chip for the home header. Hidden until signed in.
export default function WalletChip({ compact = false }: { compact?: boolean }) {
  const { user, loading } = useUser();
  const userId = user?.id;
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const account = loading ? undefined : userId;
  const [walletAccount, setWalletAccount] = useState(account);
  // Effect events see the latest committed account even before old effects clean up.
  const isCurrentAccount = useEffectEvent((owner: string) => !loading && userId === owner);

  useEffect(() => {
    if (loading || !userId) return;
    let active = true;
    const owner = userId;
    const current = () => active && isCurrentAccount(owner);
    async function load() {
      try {
        const sb = createClient();
        // Preserve the idempotent welcome grant; a failure must not be displayed as a bonus.
        let welcomed = 0;
        try {
          const grant = await sb.rpc('grant_welcome_bonus');
          if (!current()) return;
          if (!grant.error && typeof grant.data === 'number' && Number.isFinite(grant.data) && grant.data > 0) welcomed = grant.data;
        } catch { if (!current()) return; }
        const { data, error } = await sb.rpc('get_wallet');
        if (!current()) return;
        const row = Array.isArray(data) ? data[0] : data;
        const coins = Number(row?.coins), streak = Number(row?.streak);
        if (error || !row || !validBalance(row.coins) || !validBalance(row.streak)) {
          setWallet({ owner, error: true });
          return;
        }
        setWallet({ owner, coins, streak, welcomed });
      } catch {
        if (current()) setWallet({ owner, error: true });
      }
    }
    void load();
    return () => { active = false; };
  }, [userId, loading]);

  // Forget the old result on every account transition, including a later return
  // to the same account, before React displays this render.
  if (walletAccount !== account) {
    setWalletAccount(account);
    setWallet(null);
    return null;
  }
  // Keying the rendered value to the account also hides old balances immediately.
  if (loading || !userId || wallet?.owner !== userId) return null;
  if ('error' in wallet) return <span className="text-xs font-semibold text-[#c5cde0]" role="status">Wallet unavailable</span>;
  return (
    <div className={`${compact ? 'items-end' : 'mt-3 items-center'} inline-flex flex-col gap-1`}>
      <div className="inline-flex items-center gap-3 rounded-full bg-panel border border-rule px-4 py-1.5 text-sm font-display font-bold">
        <span className="text-golddeep">✨ {wallet.coins.toLocaleString()}</span>
        <span className="text-rule">·</span>
        <span className="text-coraldeep">🔥 {wallet.streak}</span>
      </div>
      {wallet.welcomed > 0 && (
        <span className="text-xs font-display font-bold text-leaf">🎉 Welcome bonus +{wallet.welcomed} ✨ — open a pack!</span>
      )}
    </div>
  );
}
