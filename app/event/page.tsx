'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/lib/use-user';
import Avatar from '@/components/avatar';
import { celebrate } from '@/lib/confetti';
import { getEvent, getEventBoard, claimEventReward, type EventInfo, type EventRow } from '@/lib/events';

function daysLeft(ends: string) {
  const ms = new Date(ends).getTime() - Date.now();
  if (ms <= 0) return 'ended';
  const d = Math.floor(ms / 86400000);
  return d >= 1 ? `${d} day${d === 1 ? '' : 's'} left` : 'ends today';
}

export default function EventPage() {
  const sb = useMemo(() => createClient(), []);
  const { user, loading } = useUser();
  const [info, setInfo] = useState<EventInfo | null>(null);
  const [rows, setRows] = useState<EventRow[]>([]);
  const [claiming, setClaiming] = useState(false);
  const [flash, setFlash] = useState('');
  const [err, setErr] = useState('');

  async function load() {
    try {
      const [i, b] = await Promise.all([getEvent(sb), getEventBoard(sb)]);
      setInfo(i ? { ...i, my_points: Number(i.my_points) } : null);
      setRows(b);
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not load.'); }
  }
  useEffect(() => { if (!loading && user) load(); /* eslint-disable-next-line */ }, [loading, user]);

  async function claim() {
    setClaiming(true); setErr('');
    try {
      const reward = await claimEventReward(sb);
      celebrate(true);
      setFlash(`Claimed: ${reward} 🎉`);
      await load();
    } catch (e) {
      const m = e instanceof Error ? e.message : 'Could not claim.';
      setErr(m === 'locked' ? 'Reach the target first!' : m === 'already_claimed' ? 'Already claimed.' : m);
    } finally { setClaiming(false); }
  }

  if (!loading && !user) {
    return (
      <Shell>
        <H>🏆 Championship</H>
        <p className="mt-2 text-inksoft">A live event with a leaderboard and a reward for hitting the target. Sign in to join.</p>
        <Link href="/login?next=/event" className="lg-btn lg-btn-primary mt-6 px-5 py-3 text-center">Sign in</Link>
        <HomeLink />
      </Shell>
    );
  }

  if (!info && !err) return <Shell><H>🏆 Championship</H><p className="mt-6 text-muted text-sm">Loading…</p><HomeLink /></Shell>;
  if (!info) return <Shell><H>🏆 Championship</H><p className="mt-4 text-inksoft">No live event right now — check back soon!</p><HomeLink /></Shell>;

  const pct = Math.min(100, Math.round((info.my_points / info.target) * 100));
  const canClaim = info.my_points >= info.target && !info.claimed;

  return (
    <Shell>
      <H>🏆 {info.name}</H>
      <p className="mt-1 text-sm text-inksoft">
        Every correct answer counts{info.subject ? ` (${info.subject.replace('-', ' ')})` : ' (all subjects)'} · {daysLeft(info.ends_at)} · {info.player_count} competing
      </p>

      {/* My progress */}
      <div className="lg-card mt-4 px-4 py-4">
        <div className="flex items-baseline justify-between">
          <span className="font-display font-extrabold text-2xl text-ink">{info.my_points} <span className="text-sm text-muted font-normal">/ {info.target}</span></span>
          <span className="font-display font-bold text-plum">#{info.my_rank}</span>
        </div>
        <div className="mt-2 h-2.5 rounded-full bg-parchment-deep overflow-hidden">
          <div className="h-full bg-gold" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-3">
          {info.claimed ? (
            <p className="text-sm font-display font-bold text-leaf">✓ Reward claimed — keep climbing the board!</p>
          ) : canClaim ? (
            <button onClick={claim} disabled={claiming} className="lg-btn lg-btn-berry w-full px-4 py-3 disabled:opacity-40">
              {claiming ? '…' : `🎁 Claim ${info.reward_coins} Sparks${info.reward_card ? ' + a card' : ''}`}
            </button>
          ) : (
            <p className="text-sm text-inksoft">Hit <b>{info.target}</b> correct to claim <b>{info.reward_coins} Sparks{info.reward_card ? ' + a card' : ''}</b>.</p>
          )}
        </div>
        {flash && <p className="mt-2 text-sm font-display font-bold text-golddeep">{flash}</p>}
      </div>

      {/* Leaderboard */}
      <h2 className="mt-6 font-display font-extrabold text-ink">Leaderboard</h2>
      <div className="mt-2 space-y-1.5">
        {rows.map((r) => (
          <div key={r.rank} className={`flex items-center gap-3 rounded-xl px-3 py-2 ${r.is_me ? 'bg-plum/10 border border-plum/30' : 'bg-panel border border-rule'}`}>
            <span className="w-6 text-center font-display font-extrabold text-muted">{r.rank}</span>
            <Avatar seed={r.avatar_seed || r.name} style={r.avatar_style || 'adventurer'} size={32} className="rounded-full shrink-0" />
            <span className="flex-1 truncate font-medium text-ink">{r.name}{r.is_me ? ' (you)' : ''}</span>
            <span className="font-display font-bold text-ink tabular-nums">{r.points}</span>
          </div>
        ))}
        {rows.length === 0 && <p className="text-muted text-sm">Be the first to score — answer some questions!</p>}
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
