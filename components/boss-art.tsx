import type { Subject } from '@/lib/questions';

// Boss art using Kenney CC0 toon-character sprites (in /public/bosses/<subject>/),
// with the frame chosen by HP: healthy → enraged → hurt → defeated.
export default function BossArt({
  subject, frac, defeated, className,
}: { subject: Subject; frac: number; defeated?: boolean; className?: string }) {
  const state = defeated ? 'defeat' : frac <= 0.3 ? 'hurt' : frac <= 0.6 ? 'attack' : 'idle';
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/bosses/${subject}/${state}.png`}
      alt={`${subject} boss`}
      className={className}
      style={{ objectFit: 'contain', filter: 'drop-shadow(0 10px 14px rgba(0,0,0,0.5))', animation: 'bob 2.4s ease-in-out infinite' }}
    />
  );
}
