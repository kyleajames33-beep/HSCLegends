import type { Subject } from '@/lib/questions';

// Subject boss art (locked style, /public/art/bosses/), with the pose chosen by
// HP: healthy -> attacking -> hurt -> defeated. Same bosses as the live Boss Battle.
const ART: Record<Subject, string> = {
  'biology': 'biology', 'chemistry': 'chemistry', 'physics': 'physics',
  'maths-standard': 'maths-standard', 'maths-advanced': 'maths-advanced', 'maths-ext1': 'maths-extension-1',
};
const FILE = { idle: 'idle', attack: 'attack', hurt: 'hurt', defeat: 'defeated' } as const;
export default function BossArt({
  subject, frac, defeated, className, pose,
}: {
  subject: Subject; frac: number; defeated?: boolean; className?: string;
  // Optional transient pose override (combat): force 'attack'/'hurt' for a beat
  // so the boss visibly reacts, regardless of its HP-based resting frame.
  pose?: 'idle' | 'attack' | 'hurt' | 'defeat';
}) {
  const state = pose ?? (defeated ? 'defeat' : frac <= 0.3 ? 'hurt' : frac <= 0.6 ? 'attack' : 'idle');
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/art/bosses/${ART[subject]}-boss-${FILE[state]}.webp`}
      alt={`${subject} boss`}
      className={className}
      style={{ objectFit: 'contain', filter: 'drop-shadow(0 10px 14px rgba(0,0,0,0.5))', animation: 'bob 2.4s ease-in-out infinite' }}
    />
  );
}
