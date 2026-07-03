'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/lib/use-user';
import Avatar from '@/components/avatar';
import { division } from '@/lib/league';
import {
  addFriend, removeFriend, getMyHandle, getFriends, getFriendsBoard,
  type FriendRow, type FriendsBoardRow,
} from '@/lib/friends';

export default function FriendsPage() {
  const sb = useMemo(() => createClient(), []);
  const { user, loading } = useUser();
  const [handle, setHandle] = useState<string | null>(null);
  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [board, setBoard] = useState<FriendsBoardRow[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  async function refresh() {
    try {
      const [f, b] = await Promise.all([getFriends(sb), getFriendsBoard(sb)]);
      setFriends(f); setBoard(b);
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not load.'); }
  }

  useEffect(() => {
    if (loading || !user) return;
    getMyHandle(sb).then(setHandle, () => {});
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sb, user, loading]);

  async function onAdd() {
    const h = input.trim();
    if (!h || busy) return;
    setBusy(true); setMsg(''); setErr('');
    try {
      const { name } = await addFriend(sb, h);
      setMsg(`Added ${name}! 🎉`);
      setInput('');
      await refresh();
    } catch (e) {
      const m = e instanceof Error ? e.message : '';
      if (m.includes('no_such_handle')) setErr('No Legend found with that handle. Check the spelling.');
      else if (m.includes('cannot_add_self')) setErr("That's your own handle!");
      else setErr('Could not add that friend.');
    } finally { setBusy(false); }
  }

  async function onRemove(id: string) {
    setFriends((prev) => prev.filter((f) => f.friend_id !== id));
    try { await removeFriend(sb, id); } catch { /* ignore */ }
    refresh();
  }

  if (!loading && !user) {
    return (
      <Shell>
        <H>🤝 Friends</H>
        <p className="mt-2 text-inksoft">Add your friends and cheer each other on. Sign in to start.</p>
        <Link href="/login?next=/friends" className="lg-btn lg-btn-primary mt-6 px-5 py-3 text-center">Sign in</Link>
        <HomeLink />
      </Shell>
    );
  }

  return (
    <Shell>
      <H>🤝 Friends</H>

      {/* Your handle */}
      <div className="lg-card mt-4 px-5 py-4">
        {handle ? (
          <p className="text-sm text-inksoft">
            Add friends with your handle:{' '}
            <b className="font-display text-ink">{handle}</b>
          </p>
        ) : (
          <p className="text-sm text-inksoft">Set a codename to get a handle friends can add you by.</p>
        )}
      </div>

      {/* Add a friend */}
      <div className="lg-card mt-3 px-5 py-4">
        <label className="text-xs font-display font-bold text-muted">Add a friend by handle</label>
        <div className="mt-2 flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') onAdd(); }}
            placeholder="Otter#0007"
            className="flex-1 rounded-xl border border-rule bg-panel px-3 py-2 text-ink placeholder:text-muted focus:outline-none focus:border-plum"
          />
          <button onClick={onAdd} disabled={busy || !input.trim()}
            className="lg-btn lg-btn-primary px-4 py-2 text-sm disabled:opacity-50">Add</button>
        </div>
        {msg && <p className="mt-2 text-sm text-leaf font-medium">{msg}</p>}
        {err && <p className="mt-2 text-sm text-brick">{err}</p>}
      </div>

      {/* Friends board */}
      <h2 className="mt-6 font-display font-extrabold text-ink">This week</h2>
      <div className="mt-2 space-y-1.5">
        {board.map((r) => (
          <div key={r.rank}
            className={`flex items-center gap-3 rounded-xl px-3 py-2 ${r.is_me ? 'bg-plum/10 border border-plum/30' : 'bg-panel border border-rule'}`}>
            <span className="w-6 text-center font-display font-extrabold text-muted">{r.rank}</span>
            <Avatar seed={r.avatar_seed || r.name} style={r.avatar_style || 'adventurer'} size={32} className="rounded-full shrink-0" />
            <span className="flex-1 truncate font-medium text-ink">{r.name}{r.is_me ? ' (you)' : ''}</span>
            <span className="font-display font-bold text-golddeep tabular-nums">⚡ {r.week_xp}</span>
          </div>
        ))}
        {board.length === 0 && <p className="text-muted text-sm">Loading…</p>}
      </div>

      {/* Your friends */}
      <h2 className="mt-6 font-display font-extrabold text-ink">Your friends</h2>
      {friends.length === 0 ? (
        <p className="mt-2 rounded-2xl bg-panel border border-rule px-4 py-6 text-center text-sm text-inksoft">
          No friends yet. Share your handle above and add a friend&apos;s to get started! 👋
        </p>
      ) : (
        <div className="mt-2 space-y-1.5">
          {friends.map((f) => {
            const d = division(f.division);
            return (
              <div key={f.friend_id} className="flex items-center gap-3 rounded-xl bg-panel border border-rule px-3 py-2">
                <Avatar seed={f.avatar_seed || f.name} style={f.avatar_style || 'adventurer'} size={36} className="rounded-full shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="truncate font-medium text-ink">{f.name}</div>
                  <div className="text-xs text-muted">
                    {d.emoji} · 🔥 {f.streak} · Lv {f.level}
                  </div>
                </div>
                <button onClick={() => onRemove(f.friend_id)} aria-label={`Remove ${f.name}`}
                  className="shrink-0 rounded-full px-2 py-1 text-muted hover:text-brick">✕</button>
              </div>
            );
          })}
        </div>
      )}

      <HomeLink />
    </Shell>
  );
}

const Shell = ({ children }: { children: React.ReactNode }) => (
  <main className="flex flex-1 flex-col px-6 pt-14 pb-10 max-w-md w-full mx-auto">{children}</main>
);
const H = ({ children }: { children: React.ReactNode }) => <h1 className="text-2xl font-extrabold text-ink">{children}</h1>;
const HomeLink = () => <Link href="/" className="mt-8 text-center text-sm text-muted underline">Home</Link>;
