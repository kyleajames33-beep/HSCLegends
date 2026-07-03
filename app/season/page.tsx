'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/lib/use-user';
import { celebrate } from '@/lib/confetti';
import { getSeason, claimSeasonTier, rewardIcon, type SeasonTier } from '@/lib/season';

export default function SeasonPage() {
  const sb = useMemo(() => createClient(), []);
  const { user, loading } = useUser();
  const [tiers, setTiers] = useState<SeasonTier[]>([]);
  const [claiming, setClaiming] = useState<number | null>(null);
  const [flash, setFlash] = useState('');
  const [err, setErr] = useState('');

  async function load() {
    try { setTiers(await getSeason(sb)); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not load.'); }
  }
  useEffect(() => { if (!loading && user) load(); /* eslint-disable-next-line */ }, [loading, user]);

  async function claim(tier: number) {
    setClaiming(tier); setErr('');
    try {
      const reward = await claimSeasonTier(sb, tier);
      celebrate(true);
      setFlash(`Claimed: ${reward} 🎉`);
      await load();
    } catch (e) {
      const m = e instanceof Error ? e.message : 'Could not claim.';
      setErr(m === 'locked' ? 'Not enough season XP yet.' : m);
    } finally { setClaiming(null); }
  }

  if (!loading && !user) {
    return (
      <Shell>
        <H>🎟️ Term Pass</H>
        <p className="mt-2 text-inksoft">Earn XP all term to unlock free rewards. Sign in to start your track.</p>
        <Link href="/login?next=/season" className="lg-btn lg-btn-primary mt-6 px-5 py-3 text-center">Sign in</Link>
        <HomeLink />
      </Shell>
    );
  }

  const head = tiers[0];
  const seasonXp = head?.season_xp ?? 0;
  const nextLocked = tiers.find((t) => !t.unlocked);
  const claimable = tiers.filter((t) => t.unlocked && !t.claimed).length;

  return (
    <Shell>
      <div className="flex items-center justify-between">
        <H>🎟️ Term Pass</H>
        {head && <span className="rounded-full bg-gold/30 border border-gold/60 px-3 py-1 text-sm font-bold text-ink">⚡ {seasonXp} XP</span>}
      </div>
      {head && (
        <p className="mt-1 text-sm text-inksoft">
          <b>{head.name}</b> — free rewards, earn XP any way you like. Ends {head.ends_on}.
        </p>
      )}
      {nextLocked && (
        <div className="mt-4 lg-card px-4 py-3">
          <div className="flex justify-between text-xs text-muted"><span>Next: {nextLocked.label}</span><span>{seasonXp} / {nextLocked.xp_required} XP</span></div>
          <div className="mt-1.5 h-2 rounded-full bg-parchment-deep overflow-hidden">
            <div className="h-full bg-plum" style={{ width: `${Math.min(100, Math.round((seasonXp / nextLocked.xp_required) * 100))}%` }} />
          </div>
        </div>
      )}
      {claimable > 0 && <p className="mt-3 text-sm font-display font-bold text-leaf">🎁 {claimable} reward{claimable === 1 ? '' : 's'} ready to claim!</p>}
      {flash && <p className="mt-2 text-sm font-display font-bold text-golddeep">{flash}</p>}

      <div className="mt-4 space-y-2">
        {tiers.map((t) => (
          <div key={t.tier}
            className={`flex items-center gap-3 rounded-2xl px-4 py-3 border ${t.claimed ? 'bg-leaf/10 border-leaf/40' : t.unlocked ? 'bg-panel border-gold' : 'bg-panel border-rule opacity-70'}`}>
            <div className="grid h-9 w-9 place-items-center rounded-full bg-parchment-deep font-display font-extrabold text-ink shrink-0">{t.tier}</div>
            <div className="flex-1 min-w-0">
              <div className="font-display font-bold text-ink">{rewardIcon(t.reward_kind)} {t.label}</div>
              <div className="text-xs text-muted">{t.xp_required} XP</div>
            </div>
            {t.claimed ? (
              <span className="text-xs font-display font-bold text-leaf">✓ Claimed</span>
            ) : t.unlocked ? (
              <button onClick={() => claim(t.tier)} disabled={claiming === t.tier}
                className="lg-btn lg-btn-primary px-3 py-2 text-sm disabled:opacity-40">
                {claiming === t.tier ? '…' : 'Claim'}
              </button>
            ) : (
              <span className="text-xs text-muted">🔒</span>
            )}
          </div>
        ))}
        {tiers.length === 0 && !err && <p className="text-muted text-sm">Loading…</p>}
      </div>

      {err && <p className="mt-4 text-brick text-sm">{err}</p>}
      <HomeLink />
    </Shell>
  );
}

const Shell = ({ children }: { children: React.ReactNode }) => (
  <main className="flex flex-1 flex-col px-6 pt-14 pb-10 max-w-md w-full mx-auto">{children}</main>
);
const H = ({ children }: { children: React.ReactNode }) => <h1 className="text-2xl font-extrabold text-ink">{children}</h1>;
const HomeLink = () => <Link href="/" className="mt-8 text-center text-sm text-muted underline">Home</Link>;
