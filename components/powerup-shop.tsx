'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/lib/use-user';
import { getPowerups, buyPowerup, type Powerup } from '@/lib/powerups';

// Power-up shop: spend Sparks on consumable boosts. A strategic sink for the economy.
export default function PowerupShop() {
  const sb = useMemo(() => createClient(), []);
  const { user } = useUser();
  const [items, setItems] = useState<Powerup[]>([]);
  const [coins, setCoins] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState('');

  async function refresh() {
    const [pus, w] = await Promise.all([
      getPowerups(sb),
      sb.rpc('get_wallet').then(({ data }) => (Array.isArray(data) ? data[0] : data)),
    ]);
    setItems(pus);
    if (w) setCoins(Number(w.coins ?? 0));
  }

  useEffect(() => { if (user) refresh().catch((e) => setErr(String(e.message ?? e))); /* eslint-disable-next-line */ }, [user]);

  async function buy(p: Powerup) {
    setBusy(p.id); setErr('');
    try { await buyPowerup(sb, p.id); await refresh(); }
    catch (e) { setErr(e instanceof Error ? (e.message === 'insufficient_coins' ? 'Not enough Sparks yet.' : e.message) : 'Could not buy.'); }
    finally { setBusy(null); }
  }

  if (!user) return null;
  return (
    <section>
      <p className="px-1 pb-2 text-xs font-display font-bold tracking-wide text-muted">POWER-UP SHOP</p>
      <div className="space-y-2.5">
        {items.map((p) => {
          const afford = coins >= p.price;
          return (
            <div key={p.id} className="lg-card flex items-center gap-3 px-4 py-3">
              <span className="text-2xl">{p.emoji}</span>
              <div className="flex-1 min-w-0">
                <div className="font-display font-bold text-ink">{p.name} <span className="text-muted font-normal text-xs">×{p.count}</span></div>
                <div className="text-xs text-inksoft truncate">{p.description}</div>
              </div>
              <button
                onClick={() => buy(p)}
                disabled={busy === p.id || !afford}
                className="lg-btn lg-btn-primary px-3 py-2 text-sm whitespace-nowrap disabled:opacity-40"
              >
                {busy === p.id ? '…' : `${p.price} ✨`}
              </button>
            </div>
          );
        })}
      </div>
      {err && <p className="mt-2 text-brick text-sm">{err}</p>}
    </section>
  );
}
