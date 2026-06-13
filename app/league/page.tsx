'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/lib/use-user';
import Avatar from '@/components/avatar';
import { getMyLeague, getLeagueBoard, division, DIVISIONS, type MyLeague, type LeagueRow } from '@/lib/league';

export default function LeaguePage() {
  const sb = useMemo(() => createClient(), []);
  const { user, loading } = useUser();
  const [me, setMe] = useState<MyLeague | null>(null);
  const [rows, setRows] = useState<LeagueRow[]>([]);
  const [optIn, setOptIn] = useState<boolean | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (loading || !user) return;
    (async () => {
      try {
        const [m, b] = await Promise.all([getMyLeague(sb), getLeagueBoard(sb)]);
        setMe(m); setRows(b);
      } catch (e) { setErr(e instanceof Error ? e.message : 'Could not load.'); }
    })();
    sb.from('user_profiles').select('leaderboard_opt_in').eq('user_id', user.id).single()
      .then(({ data }) => setOptIn(Boolean(data?.leaderboard_opt_in)));
  }, [sb, user, loading]);

  async function toggleOptIn() {
    const next = !optIn;
    setOptIn(next);
    await sb.rpc('set_leaderboard_optin', { p_on: next });
    try { setRows(await getLeagueBoard(sb)); } catch { /* ignore */ }
  }

  if (!loading && !user) {
    return (
      <Shell>
        <H>🏆 League</H>
        <p className="mt-2 text-inksoft">Climb the divisions — earn XP each week to promote. Sign in to join.</p>
        <Link href="/login?next=/league" className="lg-btn lg-btn-primary mt-6 px-5 py-3 text-center">Sign in</Link>
        <HomeLink />
      </Shell>
    );
  }

  const d = division(me?.division ?? 0);
  const next = me && me.division < DIVISIONS.length - 1 ? DIVISIONS[me.division + 1] : null;

  return (
    <Shell>
      <H>🏆 League</H>

      {/* Division badge */}
      <div className="lg-card mt-4 px-5 py-5 text-center" style={{ boxShadow: `0 4px 0 ${d.color}` }}>
        <div className="text-5xl">{d.emoji}</div>
        <div className="mt-1 font-display font-extrabold text-2xl text-ink">{d.name} League</div>
        <div className="text-xs text-muted">Division {(me?.division ?? 0) + 1} of {DIVISIONS.length}</div>
        {me && (
          <div className="mt-3 flex items-center justify-center gap-4 text-sm">
            <span className="font-display font-bold text-golddeep">⚡ {me.week_xp} XP this week</span>
            <span className="text-rule">·</span>
            <span className="font-display font-bold text-ink">#{me.rank} of {me.member_count}</span>
          </div>
        )}
      </div>

      {/* Last-week result */}
      {me?.last_result === 'promoted' && (
        <p className="mt-3 rounded-2xl bg-leaf/20 border border-leaf/50 px-4 py-2.5 text-center font-display font-bold text-ink">
          🎉 You were promoted to {d.name}!
        </p>
      )}
      {me?.last_result === 'relegated' && (
        <p className="mt-3 rounded-2xl bg-brick/15 border border-brick/40 px-4 py-2.5 text-center font-display font-bold text-ink">
          You dropped to {d.name} — climb back up! 💪
        </p>
      )}

      {next && (
        <p className="mt-3 text-center text-sm text-inksoft">
          Top <b>{me?.promote_cutoff}</b> this week promote to <b>{next.emoji} {next.name}</b>. Resets Monday.
        </p>
      )}

      {/* Board */}
      <div className="mt-4 space-y-1.5">
        {rows.map((r) => {
          const promoting = me ? r.rank <= me.promote_cutoff : false;
          return (
            <div key={r.rank}
              className={`flex items-center gap-3 rounded-xl px-3 py-2 ${r.is_me ? 'bg-plum/10 border border-plum/30' : 'bg-panel border border-rule'}`}>
              <span className={`w-6 text-center font-display font-extrabold ${promoting ? 'text-leaf' : 'text-muted'}`}>{r.rank}</span>
              <Avatar seed={r.avatar_seed || r.name} style={r.avatar_style || 'adventurer'} size={32} className="rounded-full shrink-0" />
              <span className="flex-1 truncate font-medium text-ink">{r.name}{r.is_me ? ' (you)' : ''}</span>
              {promoting && <span className="text-xs">⬆️</span>}
              <span className="font-display font-bold text-ink tabular-nums">{r.week_xp}</span>
            </div>
          );
        })}
        {rows.length === 0 && !err && <p className="text-muted text-sm">Loading…</p>}
      </div>

      {/* Opt-in */}
      {optIn === false && (
        <button onClick={toggleOptIn} className="lg-btn lg-btn-berry mt-5 w-full px-4 py-3 text-sm">
          You&apos;re hidden from others — tap to appear on the league board
        </button>
      )}

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
