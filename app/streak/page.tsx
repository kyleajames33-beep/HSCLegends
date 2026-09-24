'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/lib/use-user';
import { getStreakOverview, repairStreak, type StreakOverview } from '@/lib/rewards';
import { streakLine, sydneyToday } from '@/components/streak-card';
import { celebrate } from '@/lib/confetti';

const FREEZE_CAP = 5;

// The last 7 Sydney days ending today, as YYYY-MM-DD + weekday letter.
function lastWeek(today: string) {
  const base = new Date(`${today}T12:00:00Z`);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(base);
    d.setUTCDate(base.getUTCDate() - (6 - i));
    const dow = d.getUTCDay();
    return { date: d.toISOString().slice(0, 10), letter: 'SMTWTFS'[dow], weekend: dow === 0 || dow === 6 };
  });
}

export default function StreakPage() {
  const sb = useMemo(() => createClient(), []);
  const { user, loading } = useUser();
  const [o, setO] = useState<StreakOverview | null>(null);
  const [today] = useState(sydneyToday);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [restored, setRestored] = useState<number | null>(null);

  const load = useCallback(() => {
    getStreakOverview(sb).then(setO).catch((e) => setErr(e instanceof Error ? e.message : 'Could not load your streak.'));
  }, [sb]);

  useEffect(() => { if (user) load(); }, [user, load]);

  async function handleRepair() {
    setBusy(true); setErr('');
    try {
      const n = await repairStreak(sb);
      setRestored(n);
      celebrate();
      load();
    } catch (e) {
      const m = e instanceof Error ? e.message : '';
      setErr(m.includes('repair_not_ready') ? 'Answer 20 questions today first.'
        : m.includes('repair_cooldown') ? 'You can repair once every 2 weeks.'
        : m.includes('repair_closed') ? 'The repair window has closed.' : 'Could not repair right now. Try again.');
    } finally { setBusy(false); }
  }

  if (!loading && !user) {
    return (
      <Shell>
        <p className="mt-6 text-inksoft">Sign in to start a streak.</p>
        <Link href="/login" className="lg-btn lg-btn-primary mt-4 px-4 py-3 text-center">Sign in</Link>
      </Shell>
    );
  }
  if (!o) {
    return <Shell>{err ? <p className="mt-6 text-brick text-sm">{err}</p> : <div className="mt-6 h-40 rounded-3xl bg-parchment-deep animate-pulse" />}</Shell>;
  }

  const week = lastWeek(today);
  const active = new Set(o.active_days);
  const frozen = new Set(o.frozen_days);
  const broken = o.repair_open && !!o.broken_streak;
  const left = Math.max(0, o.repair_target - o.repair_progress);

  return (
    <Shell>
      {/* Count */}
      <div className="mt-4 flex items-center gap-4">
        <span className={`text-6xl leading-none ${broken || o.current === 0 ? 'grayscale opacity-60' : ''}`}>🔥</span>
        <div>
          <p className="text-5xl font-display font-extrabold text-coraldeep leading-none tabular-nums">{broken ? o.broken_streak : o.current}</p>
          <p className="mt-1 font-display font-bold text-ink">{broken ? 'day streak, broken today' : 'day streak'}</p>
        </div>
      </div>
      <p className="mt-3 text-sm text-inksoft">{streakLine(o, today)}</p>

      {restored !== null && (
        <div className="lg-pop mt-4 rounded-2xl bg-leaf/15 border border-leaf px-4 py-3 font-display font-bold text-[#3e6b4e]">
          Streak repaired: back to {restored} days 🔥
        </div>
      )}

      {/* Repair */}
      {broken && (
        <section className="mt-5 lg-card px-4 py-4" style={{ borderColor: '#e89b8b', boxShadow: '0 4px 0 #c47165' }}>
          <h2 className="font-display font-extrabold text-ink">Win it back today</h2>
          <p className="mt-1 text-sm text-inksoft">
            Answer {o.repair_target} questions before midnight and your {o.broken_streak}-day streak comes back. Free, once every 2 weeks.
          </p>
          <div className="mt-3 flex items-center justify-between text-sm">
            <span className="font-semibold text-ink">Questions today</span>
            <span className="font-display font-bold tabular-nums">{Math.min(o.repair_progress, o.repair_target)} / {o.repair_target}</span>
          </div>
          <div className="mt-1.5 h-3 rounded-full bg-parchment-deep overflow-hidden">
            <div className="h-full bg-coraldeep" style={{ width: `${Math.min(100, (o.repair_progress / o.repair_target) * 100)}%` }} />
          </div>
          {left > 0 ? (
            <Link href="/play" className="lg-btn lg-btn-primary mt-4 block px-4 py-3 text-center">Answer {left} more ▶</Link>
          ) : (
            <button onClick={handleRepair} disabled={busy} className="lg-btn lg-btn-berry mt-4 w-full px-4 py-3 disabled:opacity-40">
              {busy ? 'Repairing…' : 'Repair my streak'}
            </button>
          )}
        </section>
      )}
      {err && <p className="mt-3 text-brick text-sm">{err}</p>}

      {/* This week */}
      <section className="mt-5 lg-card px-4 py-4">
        <h2 className="font-display font-extrabold text-ink">This week</h2>
        <ol className="mt-3 grid grid-cols-7 gap-1">
          {week.map((d) => {
            const isToday = d.date === today;
            const state = active.has(d.date) ? 'done' : frozen.has(d.date) ? 'frozen' : isToday ? 'today' : d.weekend ? 'rest' : 'none';
            const cls = {
              done: 'bg-coraldeep text-white border-coraldeep',
              frozen: 'bg-[#3f7ea8] text-white border-[#3f7ea8]',
              today: 'border-dashed border-coraldeep text-inksoft',
              rest: 'border-rule-soft text-inksoft',
              none: 'border-rule text-inksoft',
            }[state];
            const label = { done: 'played', frozen: 'covered by a freeze', today: 'today', rest: 'weekend', none: '' }[state];
            return (
              <li key={d.date} className="flex flex-col items-center gap-1" aria-label={`${d.date}${label ? `: ${label}` : ''}`}>
                <span className="text-xs font-semibold text-inksoft">{d.letter}</span>
                <span className={`flex h-9 w-9 items-center justify-center rounded-full border-2 text-sm font-bold ${cls}`}>
                  {state === 'done' ? '✓' : state === 'frozen' ? '❄' : state === 'rest' ? '–' : ''}
                </span>
              </li>
            );
          })}
        </ol>
        {o.frozen_days.some((d) => week.some((w) => w.date === d)) && (
          <p className="mt-3 text-sm font-semibold text-[#2b5d80]">❄️ A freeze saved your streak this week.</p>
        )}
      </section>

      {/* Freezes */}
      <section className="mt-5 lg-card px-4 py-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display font-extrabold text-ink">Streak Freezes</h2>
          <span className="text-sm font-bold text-ink">❄️ {o.freezes + (o.weekly_freeze_ready ? 1 : 0)}</span>
        </div>
        <div className="mt-3 flex items-center justify-between rounded-xl bg-parchment px-3 py-2.5 text-sm">
          <span className="font-semibold text-ink">Free weekly freeze</span>
          <span className={o.weekly_freeze_ready ? 'font-bold text-[#3e6b4e]' : 'text-inksoft'}>
            {o.weekly_freeze_ready ? 'Ready' : 'Used, back Monday'}
          </span>
        </div>
        <div className="mt-2 flex items-center justify-between rounded-xl bg-parchment px-3 py-2.5 text-sm">
          <span className="font-semibold text-ink">Bought freezes</span>
          <span className="font-bold tabular-nums text-ink">{o.freezes} / {FREEZE_CAP}</span>
        </div>
        <p className="mt-3 text-sm text-inksoft">
          Weekends never break your streak. Miss a weekday and your free weekly freeze covers it first, then a bought one.
        </p>
        <Link href="/rewards" className="mt-3 inline-block text-sm font-semibold text-plumdeep underline">Get more freezes in Rewards</Link>
      </section>

      {o.next_repair_on && !broken && (
        <p className="mt-4 text-xs text-inksoft">Next streak repair available from {o.next_repair_on}.</p>
      )}

      <Link href="/play" className="lg-btn lg-btn-primary mt-6 mb-10 block px-4 py-3.5 text-center text-lg">Play now ▶</Link>
    </Shell>
  );
}

const Shell = ({ children }: { children: React.ReactNode }) => (
  <main className="flex flex-1 flex-col px-5 pt-6 w-full max-w-md mx-auto">
    <Link href="/" className="-ml-2 inline-flex min-h-11 items-center gap-1 self-start px-2 text-sm font-semibold text-inksoft">
      <ChevronLeft className="h-5 w-5" /> Today
    </Link>
    <h1 className="mt-1 text-3xl font-extrabold text-ink">Your streak</h1>
    {children}
  </main>
);
