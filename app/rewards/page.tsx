'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/lib/use-user';
import { celebrate } from '@/lib/confetti';
import SpinWheel from '@/components/spin-wheel';
import QuestList from '@/components/quest-list';
import PowerupShop from '@/components/powerup-shop';
import {
  getSpinStatus, spinDaily, getStreakStatus, buyStreakFreeze,
  type SpinStatus, type StreakStatus,
} from '@/lib/rewards';
import { getQuests, claimQuest, type Quest } from '@/lib/quests';

const FREEZE_COST = 150;
const FREEZE_CAP = 5;

function walletBalance(data: unknown): number {
  const row = Array.isArray(data) ? data[0] : data;
  const value = row && typeof row === 'object' ? (row as { coins?: unknown }).coins : undefined;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error('Wallet balance is unavailable.');
  return value;
}

export default function RewardsPage() {
  const { user, loading } = useUser();
  if (loading) return <Shell><H>🎁 Daily rewards</H><p>Loading…</p><Home /></Shell>;
  if (!user) return <Shell><H>🎁 Daily rewards</H><p className="mt-2 text-inksoft">Spin for free Sparks every day, keep your streak, and finish quests. Sign in to start.</p><Link href="/login?next=/rewards" className="lg-btn lg-btn-primary mt-6 px-5 py-3 text-center">Sign in</Link><Home /></Shell>;
  return <AccountRewards key={user.id} />;
}

function AccountRewards() {
  const sb = useMemo(() => createClient(), []);
  const active = useRef(false);
  const generation = useRef(0);

  const [coins, setCoins] = useState<number | null>(null);
  const [spin, setSpin] = useState<SpinStatus | null>(null);
  const [lastReward, setLastReward] = useState<number | null>(null);
  const [streak, setStreak] = useState<StreakStatus | null>(null);
  const [quests, setQuests] = useState<Quest[]>([]);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [buyingFreeze, setBuyingFreeze] = useState(false);
  const [err, setErr] = useState('');

  const refreshWallet = useCallback(async () => {
    try {
      const { data, error } = await sb.rpc('get_wallet');
      if (error) throw error;
      const balance = walletBalance(data);
      if (active.current) setCoins(balance);
    } catch (e) { if (active.current) setCoins(null); throw e; }
  }, [sb]);

  useEffect(() => {
    active.current = true;
    const guard = generation;
    const request = ++guard.current;
    void Promise.all([getSpinStatus(sb), getStreakStatus(sb), getQuests(sb), sb.rpc('get_wallet')]).then(([sp, st, qs, wallet]) => {
      if (!active.current || generation.current !== request) return;
      if (wallet.error) throw wallet.error;
      setSpin(sp); setStreak(st); setQuests(qs);
      setCoins(walletBalance(wallet.data));
    }).catch(e => { if (active.current && generation.current === request) setErr(msg(e)); });
    return () => { active.current = false; guard.current++; };
  }, [sb]);

  async function handleSpin(): Promise<number> {
    const r = await spinDaily(sb);
    if (!active.current) return r.reward;
    setSpin({ can_spin: false, ladder_day: r.ladder_day });
    setLastReward(r.reward);
    void refreshWallet().catch(e => { if (active.current) setErr(msg(e)); });
    celebrate(r.reward >= 100);
    return r.reward;
  }

  async function handleClaim(questId: string) {
    setClaiming(questId); setErr('');
    try {
      const bal = await claimQuest(sb, questId);
      if (!active.current) return;
      setCoins(bal);
      celebrate(false);
      const updated = await getQuests(sb);
      if (active.current) setQuests(updated);
    } catch (e) { if (active.current) setErr(msg(e)); } finally { if (active.current) setClaiming(null); }
  }

  async function handleBuyFreeze() {
    setBuyingFreeze(true); setErr('');
    try {
      const n = await buyStreakFreeze(sb);
      if (!active.current) return;
      setStreak((s) => (s ? { ...s, freezes: n } : s));
      await refreshWallet();
    } catch (e) {
      if (active.current) setErr(msg(e) === 'insufficient_coins' ? 'Not enough Sparks yet — keep earning!' : msg(e));
    } finally { if (active.current) setBuyingFreeze(false); }
  }

  const ladderDay = spin?.ladder_day ?? 0;
  const dailyQuests = quests.filter((q) => q.scope === 'daily');
  const weeklyQuests = quests.filter((q) => q.scope === 'weekly');

  return (
    <Shell>
      <div className="flex items-center justify-between">
        <H>🎁 Daily rewards</H>
        <span className="rounded-full bg-gold/30 border border-gold/60 px-3 py-1 text-sm font-bold text-ink">
          {coins ?? '–'} ✨
        </span>
      </div>

      {/* ---------- Daily Spin ---------- */}
      <section className="mt-6">
        <h2 className="font-display font-extrabold text-ink">Daily Spin</h2>
        <p className="text-sm text-inksoft">One free spin a day — pure bonus Sparks.</p>
        <div className="mt-4">
          <SpinWheel onSpin={handleSpin} disabled={spin ? !spin.can_spin : true} />
        </div>
        {lastReward != null && (
          <p className="mt-3 text-center font-display font-extrabold text-leaf text-lg">+{lastReward} ✨</p>
        )}
      </section>

      {/* ---------- Login ladder ---------- */}
      <section className="mt-7">
        <h2 className="font-display font-extrabold text-ink">Login ladder</h2>
        <p className="text-sm text-inksoft">Spin 7 days running for a big day-7 bonus.</p>
        <div className="mt-3 flex items-center justify-between gap-1.5">
          {Array.from({ length: 7 }, (_, i) => {
            const day = i + 1;
            const reached = ladderDay >= day;
            const isBonus = day === 7;
            return (
              <div key={day} className="flex flex-col items-center gap-1">
                <div
                  className={`grid h-9 w-9 place-items-center rounded-full text-sm font-bold ${
                    isBonus
                      ? reached ? 'bg-gold text-ink border-2 border-golddeep' : 'bg-parchment-deep text-muted border-2 border-gold'
                      : reached ? 'bg-plum text-white' : 'bg-parchment-deep text-muted'
                  }`}
                >
                  {isBonus ? '★' : day}
                </div>
                <span className="text-[10px] text-muted">{isBonus ? 'bonus' : `d${day}`}</span>
              </div>
            );
          })}
        </div>
      </section>

      {/* ---------- Streak ---------- */}
      <section className="mt-7 lg-card px-4 py-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-2xl font-display font-extrabold text-coraldeep">🔥 {streak?.current ?? 0}</div>
            <div className="text-xs text-muted">day streak</div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-display font-extrabold text-ink">❄️ {streak?.freezes ?? 0}</div>
            <div className="text-xs text-muted">freezes (max {FREEZE_CAP})</div>
          </div>
        </div>
        <p className="mt-3 text-sm text-inksoft">Weekends never count. A bought freeze covers a missed weekday once your free weekly one is used. <Link href="/streak" className="font-semibold text-plumdeep underline">See your streak</Link></p>
        <button
          onClick={handleBuyFreeze}
          disabled={buyingFreeze || !streak || streak.freezes >= FREEZE_CAP}
          className="lg-btn lg-btn-berry mt-3 w-full px-4 py-3 disabled:opacity-40"
        >
          {(streak?.freezes ?? 0) >= FREEZE_CAP
            ? 'Freezes maxed out ❄️'
            : buyingFreeze ? 'Buying…' : `Buy Streak Freeze — ${FREEZE_COST} ✨`}
        </button>
      </section>

      {/* ---------- Power-up shop ---------- */}
      <div className="mt-7">
        <PowerupShop />
      </div>

      {/* ---------- Quests ---------- */}
      <section className="mt-7">
        <h2 className="font-display font-extrabold text-ink">Daily quests</h2>
        <p className="text-sm text-inksoft">Reset each day — easy Sparks for playing.</p>
        <div className="mt-3">
          <QuestList quests={dailyQuests} onClaim={handleClaim} claiming={claiming} />
        </div>
      </section>

      <section className="mt-6">
        <h2 className="font-display font-extrabold text-ink">Weekly quests</h2>
        <p className="text-sm text-inksoft">Bigger goals, bigger rewards.</p>
        <div className="mt-3">
          <QuestList quests={weeklyQuests} onClaim={handleClaim} claiming={claiming} />
        </div>
      </section>

      {err && <Err>{err}</Err>}
      <Home />
    </Shell>
  );
}

const msg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.');
const Shell = ({ children }: { children: React.ReactNode }) => (
  <main className="flex flex-1 flex-col px-6 pt-14 pb-10 max-w-md md:max-w-3xl w-full mx-auto">{children}</main>
);
const H = ({ children }: { children: React.ReactNode }) => <h1 className="text-2xl font-extrabold text-ink">{children}</h1>;
const Err = ({ children }: { children: React.ReactNode }) => <p className="mt-4 text-brick text-sm">{children}</p>;
const Home = () => <Link href="/" className="mt-8 text-center text-sm text-muted underline">Home</Link>;
