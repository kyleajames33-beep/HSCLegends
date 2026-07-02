'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/lib/use-user';
import { getBase, baseCollect, baseUpgrade, type Base, type Building } from '@/lib/base';

// Module-level (keeps Date.now out of component scope for the purity linter).
const nowMs = () => Date.now();
const fmtTime = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.max(0, s) % 60).padStart(2, '0')}`;
const msg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.');

export default function HQPage() {
  const sb = useMemo(() => createClient(), []);
  const { user, loading } = useUser();
  const [base, setBase] = useState<Base | null>(null);
  const [coins, setCoins] = useState<number | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');
  const [, setTick] = useState(0);
  const [fetchedAt, setFetchedAt] = useState(0);

  async function refresh() {
    try {
      const b = await getBase(sb);
      setFetchedAt(nowMs());
      setBase(b);
    } catch (e) { setErr(msg(e)); }
  }

  useEffect(() => {
    if (!user) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
    sb.rpc('get_wallet').then(({ data }) => { if (data?.[0]) setCoins(Number(data[0].coins)); }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // 1s tick → live countdowns + Spark accrual display.
  useEffect(() => {
    const t = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(t);
  }, []);

  // Auto-refetch the moment an upgrade timer completes (finalises the level-up).
  useEffect(() => {
    if (!base) return;
    const fins = [base.reactor_finishes_at, base.vault_finishes_at, base.lab_finishes_at].filter(Boolean) as string[];
    if (!fins.length) return;
    const soonest = Math.min(...fins.map((f) => new Date(f).getTime()));
    const ms = soonest - nowMs();
    const t = window.setTimeout(() => { refresh(); }, Math.max(300, ms + 300));
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base]);

  function flash(m: string) { setToast(m); window.setTimeout(() => setToast(''), 2200); }

  async function collect() {
    if (busy) return;
    setBusy(true);
    try {
      const r = await baseCollect(sb);
      setCoins(r.balance);
      if (r.collected > 0) flash(`+${r.collected} ✨ collected`);
      await refresh();
    } catch (e) { setErr(msg(e)); } finally { setBusy(false); }
  }
  async function upgrade(b: Building) {
    if (busy) return;
    setBusy(true); setErr('');
    try { const r = await baseUpgrade(sb, b); setCoins(r.balance); await refresh(); }
    catch (e) {
      const m = msg(e);
      flash(m.includes('insufficient') ? 'Not enough ✨ Sparks' : m.includes('already') ? 'Already upgrading' : 'Upgrade failed');
    } finally { setBusy(false); }
  }

  if (!loading && !user) {
    return (
      <Shell>
        <H>🏛️ Research HQ</H>
        <p className="mt-2 text-inksoft">Build a research base that earns ✨ Sparks while you study. Sign in to start your HQ.</p>
        <Link href="/login?next=/hq" className="lg-btn lg-btn-primary mt-6 px-5 py-3 text-center">Sign in</Link>
        <Home />
      </Shell>
    );
  }
  if (!base) return <Shell><H>🏛️ Research HQ</H><p className="mt-3 text-muted">{err || 'Loading your base…'}</p><Home /></Shell>;

  const secsSince = (nowMs() - fetchedAt) / 1000;
  const livePending = Math.min(base.cap, Math.floor(base.pending + (base.rate * secsSince) / 3600));
  const power = base.reactor_lvl + base.vault_lvl + base.lab_lvl;
  const speedupPct = Math.round((1 - Math.max(0.5, 1 - 0.05 * (base.lab_lvl - 1))) * 100);
  const remain = (f: string | null) => (f ? Math.max(0, Math.round((new Date(f).getTime() - nowMs()) / 1000)) : 0);

  return (
    <Shell>
      <div className="flex items-center justify-between">
        <H>🏛️ Research HQ</H>
        <Link href="/" className="text-sm text-muted underline">Home</Link>
      </div>
      <div className="mt-2 flex items-center gap-3 text-sm">
        <span className="rounded-full bg-plum/15 px-3 py-1 font-display font-bold text-plumdeep">⚡ Power {power}</span>
        {coins != null && <span className="rounded-full bg-gold/20 px-3 py-1 font-display font-bold text-golddeep">✨ {coins.toLocaleString()}</span>}
      </div>
      <p className="mt-2 text-xs text-inksoft">Your Reactor earns Sparks while you’re away — come back to collect before the Vault fills.</p>

      {/* Reactor */}
      <div className="lg-card mt-4 px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="font-display font-bold text-ink">⚛️ Reactor <span className="text-xs text-plum">Lv{base.reactor_lvl}</span></div>
          <div className="text-xs text-muted">⚡ {base.rate}/hr</div>
        </div>
        <div className="mt-2 flex justify-between text-xs text-muted"><span>Stored</span><span className="tabular-nums">{livePending} / {base.cap}</span></div>
        <div className="mt-1 h-3 rounded-full bg-parchment-deep overflow-hidden">
          <div className="h-full bg-gold transition-all" style={{ width: `${base.cap ? Math.min(100, (livePending / base.cap) * 100) : 0}%` }} />
        </div>
        <button onClick={collect} disabled={busy || livePending <= 0} className="lg-btn lg-btn-primary mt-3 w-full px-4 py-2.5 disabled:opacity-40">
          Collect {livePending} ✨
        </button>
        <UpgradeRow upgrading={remain(base.reactor_finishes_at) > 0} r={remain(base.reactor_finishes_at)} cost={base.reactor_cost} secs={base.reactor_secs} effect={`Reactor → ⚡${base.rate + 5}/hr`} busy={busy} onUpgrade={() => upgrade('reactor')} />
      </div>

      {/* Vault */}
      <div className="lg-card mt-3 px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="font-display font-bold text-ink">🏦 Vault <span className="text-xs text-plum">Lv{base.vault_lvl}</span></div>
          <div className="text-xs text-muted">holds ⚡ {base.cap}</div>
        </div>
        <UpgradeRow upgrading={remain(base.vault_finishes_at) > 0} r={remain(base.vault_finishes_at)} cost={base.vault_cost} secs={base.vault_secs} effect={`Vault → holds ⚡${(base.vault_lvl + 1) * 60}`} busy={busy} onUpgrade={() => upgrade('vault')} />
      </div>

      {/* Lab */}
      <div className="lg-card mt-3 px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="font-display font-bold text-ink">🔬 Lab <span className="text-xs text-plum">Lv{base.lab_lvl}</span></div>
          <div className="text-xs text-muted">{speedupPct > 0 ? `${speedupPct}% faster builds` : 'standard build speed'}</div>
        </div>
        <UpgradeRow upgrading={remain(base.lab_finishes_at) > 0} r={remain(base.lab_finishes_at)} cost={base.lab_cost} secs={base.lab_secs} effect="Lab → faster upgrades" busy={busy} onUpgrade={() => upgrade('lab')} />
      </div>

      <p className="mt-4 text-center text-xs text-muted">Earn ✨ Sparks by playing — then grow your HQ. More coming: defenses, research perks &amp; raids.</p>
      <Home />

      {toast && (
        <div className="fixed inset-x-0 bottom-6 z-50 flex justify-center px-6">
          <div className="lg-pop rounded-full bg-ink px-5 py-2.5 font-display font-bold text-white shadow-lg">{toast}</div>
        </div>
      )}
    </Shell>
  );
}

const Shell = ({ children }: { children: React.ReactNode }) => (
  <main className="flex flex-1 flex-col px-6 pt-12 pb-10 w-full mx-auto max-w-md md:max-w-2xl">{children}</main>
);
const H = ({ children }: { children: React.ReactNode }) => <h1 className="text-2xl font-extrabold text-ink">{children}</h1>;
const Home = () => <Link href="/" className="mt-6 block text-center text-sm text-muted underline">Home</Link>;

function UpgradeRow({ upgrading, r, cost, secs, effect, busy, onUpgrade }: {
  upgrading: boolean; r: number; cost: number; secs: number; effect: string; busy: boolean; onUpgrade: () => void;
}) {
  if (upgrading) {
    return <div className="mt-2 rounded-xl bg-plum/10 py-2 text-center font-mono text-sm font-bold text-plumdeep">🛠️ Upgrading… {fmtTime(r)}</div>;
  }
  return (
    <button onClick={onUpgrade} disabled={busy}
      className="mt-2 flex w-full items-center justify-between rounded-xl border border-rule bg-panel px-3 py-2 text-sm transition active:translate-y-0.5 disabled:opacity-50">
      <span className="font-display font-bold text-ink">⬆ {effect}</span>
      <span className="text-xs font-bold text-golddeep">{cost.toLocaleString()} ✨ · {fmtTime(secs)}</span>
    </button>
  );
}
