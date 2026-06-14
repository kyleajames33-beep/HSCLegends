'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/lib/use-user';
import Avatar from '@/components/avatar';
import { division } from '@/lib/league';
import { getProfileSummary, type ProfileSummary } from '@/lib/profile';

export default function ProfilePage() {
  const sb = useMemo(() => createClient(), []);
  const { user, loading } = useUser();

  const [profile, setProfile] = useState<ProfileSummary | null>(null);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    setErr('');
    try {
      setProfile(await getProfileSummary(sb));
    } catch (e) { setErr(msg(e)); }
  }, [sb]);

  useEffect(() => {
    if (!loading && user) load();
  }, [loading, user, load]);

  // ---------- gates ----------
  if (loading) {
    return (
      <Shell>
        <H>👤 Profile</H>
        <p className="mt-2 text-inksoft">Loading…</p>
      </Shell>
    );
  }
  if (!user) {
    return (
      <Shell>
        <H>👤 Profile</H>
        <p className="mt-2 text-inksoft">Your Legend identity, stats and progress — all in one place. Sign in to see it.</p>
        <Link href="/login?next=/profile" className="lg-btn lg-btn-primary mt-6 px-5 py-3 text-center">Sign in</Link>
        <Home />
      </Shell>
    );
  }

  if (err) {
    return (
      <Shell>
        <H>👤 Profile</H>
        <Err>{err}</Err>
        <Home />
      </Shell>
    );
  }

  const p = profile;
  const xp = p?.total_xp ?? 0;
  const level = Math.floor(Math.sqrt(xp / 50)) + 1;
  const curBase = (level - 1) * (level - 1) * 50;     // XP at the start of this level
  const nextBase = level * level * 50;                 // XP needed for the next level
  const span = Math.max(1, nextBase - curBase);
  const into = Math.max(0, xp - curBase);
  const pct = Math.min(100, Math.round((into / span) * 100));

  const div = division(p?.division ?? 0);
  const accuracy = p && p.answered > 0 ? Math.round((p.correct / p.answered) * 100) : 0;

  return (
    <Shell>
      <H>👤 Profile</H>

      {/* ---------- Header card ---------- */}
      <section className="lg-card mt-5 px-5 py-5">
        <div className="flex items-center gap-4">
          <Avatar
            seed={p?.avatar_seed || p?.name || 'legend'}
            style={p?.avatar_style || 'adventurer'}
            size={84}
          />
          <div className="min-w-0 flex-1">
            <div className="truncate text-xl font-display font-extrabold text-ink">{p?.name ?? 'Legend'}</div>
            <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-plum/10 border border-rule px-2.5 py-0.5 text-xs font-bold text-ink">
              {div.emoji} {div.name} League
            </div>
          </div>
        </div>

        {/* Level + XP bar */}
        <div className="mt-4">
          <div className="flex items-end justify-between">
            <span className="font-display font-extrabold text-ink">Level {level}</span>
            <span className="text-xs text-muted">{into} / {span} XP</span>
          </div>
          <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-panel border border-rule">
            <div className="h-full bg-leaf" style={{ width: `${pct}%` }} />
          </div>
        </div>

        {/* Streak + Sparks chips */}
        <div className="mt-4 flex gap-2">
          <span className="rounded-full bg-coraldeep/15 border border-rule px-3 py-1 text-sm font-bold text-coraldeep">
            🔥 {p?.streak ?? 0}
          </span>
          <span className="rounded-full bg-gold/30 border border-gold/60 px-3 py-1 text-sm font-bold text-ink">
            ✨ {p?.coins ?? 0}
          </span>
        </div>
      </section>

      {/* ---------- Stat grid ---------- */}
      <div className="mt-5 grid grid-cols-2 gap-3">
        <Stat label="Questions answered" value={`${p?.answered ?? 0}`} />
        <Stat label="Accuracy" value={`${accuracy}%`} />
        <Stat label="Duels (W–L)" value={`${p?.duels_won ?? 0}–${p?.duels_lost ?? 0}`} />
        <Stat label="Cards" value={`${p?.cards_owned ?? 0}/${p?.cards_total ?? 0}`} />
        <Stat label="Achievements" value={`${p?.ach_unlocked ?? 0}/${p?.ach_total ?? 0}`} />
        <Stat label="Streak freezes" value={`❄️ ${p?.freezes ?? 0}`} />
      </div>

      {/* ---------- Quick links ---------- */}
      <div className="mt-6 grid grid-cols-2 gap-3">
        <QuickLink href="/achievements">🏅 Achievements</QuickLink>
        <QuickLink href="/collection">🃏 Collection</QuickLink>
        <QuickLink href="/league">🏆 League</QuickLink>
        <QuickLink href="/avatar">🎨 Edit avatar</QuickLink>
      </div>

      <Home />
    </Shell>
  );
}

const msg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.');

const Stat = ({ label, value }: { label: string; value: string }) => (
  <div className="lg-card px-4 py-3">
    <div className="text-xl font-display font-extrabold text-ink">{value}</div>
    <div className="mt-0.5 text-xs text-muted">{label}</div>
  </div>
);

const QuickLink = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <Link href={href} className="lg-card px-4 py-3 text-center text-sm font-bold text-ink">
    {children}
  </Link>
);

const Shell = ({ children }: { children: React.ReactNode }) => (
  <main className="flex flex-1 flex-col px-6 pt-14 pb-10 max-w-md w-full mx-auto">{children}</main>
);
const H = ({ children }: { children: React.ReactNode }) => <h1 className="text-2xl font-extrabold text-ink">{children}</h1>;
const Err = ({ children }: { children: React.ReactNode }) => <p className="mt-4 text-brick text-sm">{children}</p>;
const Home = () => <Link href="/" className="mt-8 text-center text-sm text-muted underline">Home</Link>;
