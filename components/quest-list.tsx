'use client';

import type { Quest } from '@/lib/quests';

// Renders quests with a progress bar, a Sparks reward chip, and a Claim button
// (enabled only when complete and unclaimed).
export default function QuestList({
  quests,
  onClaim,
  claiming,
}: {
  quests: Quest[];
  onClaim: (questId: string) => void;
  claiming?: string | null;
}) {
  if (!quests.length) {
    return <p className="text-muted text-sm">No quests right now — check back soon.</p>;
  }
  return (
    <ul className="space-y-3">
      {quests.map((q) => {
        const done = q.progress >= q.target;
        const pct = Math.min(100, Math.round((q.progress / q.target) * 100));
        const busy = claiming === q.id;
        return (
          <li key={q.id} className="lg-card px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <span className="font-display font-bold text-ink">{q.title}</span>
              <span className="shrink-0 rounded-full bg-gold/30 border border-gold/60 px-2 py-0.5 text-xs font-bold text-ink">
                +{q.reward_coins} ✨
              </span>
            </div>
            <div className="mt-2 h-2 rounded-full bg-parchment-deep overflow-hidden">
              <div className={`h-full ${q.claimed ? 'bg-leaf' : 'bg-gold'}`} style={{ width: `${pct}%` }} />
            </div>
            <div className="mt-1.5 flex items-center justify-between">
              <span className="text-xs text-muted tabular-nums">
                {Math.min(q.progress, q.target)} / {q.target}
              </span>
              {q.claimed ? (
                <span className="text-xs font-semibold text-leaf">Claimed ✓</span>
              ) : (
                <button
                  onClick={() => onClaim(q.id)}
                  disabled={!done || busy}
                  className="lg-btn lg-btn-primary px-3 py-1.5 text-sm disabled:opacity-40"
                >
                  {busy ? 'Claiming…' : done ? 'Claim' : 'In progress'}
                </button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
