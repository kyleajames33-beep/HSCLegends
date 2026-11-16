'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/lib/use-user';
import { getPowerups, buyPowerup, type Powerup } from '@/lib/powerups';

async function readShop(sb: ReturnType<typeof createClient>) {
  const [pus, wallet] = await Promise.all([getPowerups(sb), sb.rpc('get_wallet')]);
  if (wallet.error) throw wallet.error;
  return { pus, wallet: Array.isArray(wallet.data) ? wallet.data[0] : wallet.data };
}

// Power-up shop: spend Sparks on consumable boosts. A strategic sink for the economy.
export default function PowerupShop() {
  const { user } = useUser();
  return user ? <AccountPowerupShop key={user.id} /> : null;
}

function AccountPowerupShop() {
  const sb = useMemo(() => createClient(), []);
  const active = useRef(false);
  const [items, setItems] = useState<Powerup[]>([]);
  const [coins, setCoins] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState('');

  const refresh = useCallback(async () => {
    const result = await readShop(sb);
    if (active.current) { setItems(result.pus); if (result.wallet) setCoins(Number(result.wallet.coins ?? 0)); }
  }, [sb]);

  useEffect(() => {
    let current = true;
    active.current = true;
    void readShop(sb).then(result => {
      if (current) { setItems(result.pus); if (result.wallet) setCoins(Number(result.wallet.coins ?? 0)); }
    }, e => { if (current) setErr(e instanceof Error ? e.message : 'Could not load shop.'); });
    return () => { current = false; active.current = false; };
  }, [sb]);

  async function buy(p: Powerup) {
    if (busy) return;
    setBusy(p.id); setErr('');
    try { await buyPowerup(sb, p.id); if (active.current) await refresh(); }
    catch (e) { if (active.current) setErr(e instanceof Error ? (e.message === 'insufficient_coins' ? 'Not enough Sparks yet.' : e.message) : 'Could not buy.'); }
    finally { if (active.current) setBusy(null); }
  }

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
                disabled={!!busy || !afford}
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
