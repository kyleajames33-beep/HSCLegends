import type { Subject } from '@/lib/questions';

// Existing subject art remains the default; the campaign opts into Catalyst v1.
export default function BossArt({
  subject, frac, defeated, className, pose, campaign = false,
}: {
  subject: Subject; frac: number; defeated?: boolean; className?: string;
  campaign?: boolean;
  // Optional transient pose override (combat): force 'attack'/'hurt' for a beat
  // so the boss visibly reacts, regardless of its HP-based resting frame.
  pose?: 'idle' | 'attack' | 'hurt' | 'defeat';
}) {
  const state = defeated ? 'defeat' : pose ?? (frac <= 0.3 ? 'hurt' : frac <= 0.6 ? 'attack' : 'idle');
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={campaign && subject === 'chemistry' ? `/campaign-art/catalyst-v1/boss/${state}.webp` : `/bosses/${subject}/${state}.png`}
      alt={`${subject} boss`}
      className={`boss-idle-bob ${className ?? ''}`}
      style={{ objectFit: 'contain', filter: 'drop-shadow(0 10px 14px rgba(0,0,0,0.5))' }}
    />
  );
}
