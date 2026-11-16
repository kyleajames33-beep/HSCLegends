'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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
  const [snapshot, setSnapshot] = useState<{ owner: string; info: EventInfo | null; rows: EventRow[]; ends: string; err: string } | null>(null);
  const [claimingOwner, setClaimingOwner] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ owner: string; text: string } | null>(null);
  const requestRef = useRef(0);
  const activeOwner = useRef<string | null>(null);
  const claimLock = useRef(false);
  const visible = snapshot?.owner === user?.id ? snapshot : null;
  const info = visible?.info ?? null;
  const rows = visible?.rows ?? [];
  const err = visible?.err ?? '';
  const flash = notice && notice.owner === user?.id ? notice.text : '';
  const claiming = claimingOwner === user?.id;

  useEffect(() => {
    const request = ++requestRef.current;
    activeOwner.current = user?.id ?? null;
    claimLock.current = false;
    if (!loading && user) {
      const owner = user.id;
      Promise.all([getEvent(sb), getEventBoard(sb)]).then(([i, rows]) => {
        if (requestRef.current === request) setSnapshot({ owner, info: i ? { ...i, my_points: Number(i.my_points) } : null, rows, ends: i ? daysLeft(i.ends_at) : '', err: '' });
      }, (e) => {
        if (requestRef.current === request) setSnapshot({ owner, info: null, rows: [], ends: '', err: e instanceof Error ? e.message : 'Could not load.' });
      });
    }
    return () => { activeOwner.current = null; requestRef.current += 1; claimLock.current = false; };
  }, [sb, loading, user]);

  async function claim() {
    if (!user || activeOwner.current !== user.id || !info || claimLock.current || info.claimed || info.my_points < info.target) return;
    const owner = user.id, request = requestRef.current;
    claimLock.current = true; setClaimingOwner(owner); setNotice(null);
    try {
      const reward = await claimEventReward(sb);
      if (requestRef.current !== request) return;
      if (typeof reward !== 'string' || !reward.trim()) throw new Error('Reward could not be confirmed. Check your event status before trying again.');
      celebrate(true);
      setNotice({ owner, text: `Claimed: ${reward} 🎉` });
      // Mark confirmed completion immediately so a failed refresh cannot offer a duplicate claim.
      setSnapshot(current => current?.owner === owner ? { ...current, info: current.info ? { ...current.info, claimed: true } : null, err: '' } : current);
      try {
        const [i, rows] = await Promise.all([getEvent(sb), getEventBoard(sb)]);
        if (requestRef.current === request) setSnapshot({ owner, info: i ? { ...i, my_points: Number(i.my_points), claimed: i.id === info.id ? true : i.claimed } : null, rows, ends: i ? daysLeft(i.ends_at) : '', err: '' });
      } catch {
        if (requestRef.current === request) setNotice({ owner, text: `Claimed: ${reward}. The leaderboard could not be refreshed.` });
      }
    } catch (e) {
      if (requestRef.current !== request) return;
      const m = e instanceof Error ? e.message : 'Could not claim.';
      setSnapshot(current => current?.owner === owner ? { ...current, err: m === 'locked' ? 'Reach the target first!' : m === 'already_claimed' ? 'Already claimed.' : m } : current);
    } finally {
      if (requestRef.current === request) { claimLock.current = false; setClaimingOwner(null); }
    }
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

  if (!visible) return <Shell><H>🏆 Championship</H><p className="mt-6 text-muted text-sm">Loading…</p><HomeLink /></Shell>;
  if (!info) return <Shell><H>🏆 Championship</H><p className={err ? 'mt-4 text-brick' : 'mt-4 text-inksoft'}>{err || 'No live event right now — check back soon!'}</p><HomeLink /></Shell>;

  const pct = Math.min(100, Math.round((info.my_points / info.target) * 100));
  const canClaim = info.my_points >= info.target && !info.claimed;

  return (
    <Shell>
      <H>🏆 {info.name}</H>
      <p className="mt-1 text-sm text-inksoft">
        Every correct answer counts{info.subject ? ` (${info.subject.replace('-', ' ')})` : ' (all subjects)'} · {visible?.ends} · {info.player_count} competing
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
