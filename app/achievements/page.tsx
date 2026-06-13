'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/lib/use-user';
import { getAchievements, type Achievement } from '@/lib/achievements';

export default function AchievementsPage() {
  const sb = useMemo(() => createClient(), []);
  const { user, loading } = useUser();
  const [items, setItems] = useState<Achievement[]>([]);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (loading || !user) return;
    getAchievements(sb).then(setItems, (e) => setErr(e instanceof Error ? e.message : 'Could not load.'));
  }, [sb, user, loading]);

  if (!loading && !user) {
    return (
      <Shell>
        <H>🏅 Achievements</H>
        <p className="mt-2 text-inksoft">Earn badges for streaks, mastery, duels and more. Sign in to start unlocking.</p>
        <Link href="/login?next=/achievements" className="lg-btn lg-btn-primary mt-6 px-5 py-3 text-center">Sign in</Link>
        <HomeLink />
      </Shell>
    );
  }

  const unlocked = items.filter((a) => a.unlocked).length;

  return (
    <Shell>
      <div className="flex items-center justify-between">
        <H>🏅 Achievements</H>
        {items.length > 0 && (
          <span className="rounded-full bg-gold/30 border border-gold/60 px-3 py-1 text-sm font-bold text-ink">
            {unlocked}/{items.length}
          </span>
        )}
      </div>
      <p className="mt-2 text-inksoft text-sm">Badges unlock automatically as you play. Chase them all.</p>

      <div className="mt-6 grid grid-cols-2 gap-3">
        {items.map((a) => {
          const pct = Math.min(100, Math.round((a.progress / a.threshold) * 100));
          return (
            <div key={a.id} className={`lg-card px-4 py-4 ${a.unlocked ? '' : 'opacity-90'}`}
              style={a.unlocked ? { boxShadow: '0 4px 0 #a87f3f' } : undefined}>
              <div className={`text-3xl ${a.unlocked ? '' : 'grayscale opacity-40'}`}>{a.emoji}</div>
              <div className="font-display font-bold text-ink mt-1 leading-tight">{a.name}</div>
              <div className="text-xs text-muted mt-0.5">{a.description}</div>
              {a.unlocked ? (
                <div className="mt-2 text-xs font-display font-bold text-golddeep">✓ Unlocked</div>
              ) : (
                <div className="mt-2">
                  <div className="h-1.5 rounded-full bg-parchment-deep overflow-hidden">
                    <div className="h-full bg-plum" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="text-[10px] text-muted mt-1">{a.progress.toLocaleString()} / {a.threshold.toLocaleString()}</div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {err && <p className="mt-4 text-brick text-sm">{err}</p>}
      {!err && items.length === 0 && <p className="mt-6 text-muted text-sm">Loading…</p>}
      <HomeLink />
    </Shell>
  );
}

const Shell = ({ children }: { children: React.ReactNode }) => (
  <main className="flex flex-1 flex-col px-6 pt-14 pb-10 max-w-md w-full mx-auto">{children}</main>
);
const H = ({ children }: { children: React.ReactNode }) => <h1 className="text-2xl font-extrabold text-ink">{children}</h1>;
const HomeLink = () => <Link href="/" className="mt-8 text-center text-sm text-muted underline">Home</Link>;
