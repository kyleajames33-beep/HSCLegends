import { createAvatar } from '@dicebear/core';
import { adventurer } from '@dicebear/collection';

// Deterministic character avatar from a seed (name / id). Same person = same face.
export default function Avatar({ seed, size = 48, className }: { seed: string; size?: number; className?: string }) {
  const uri = createAvatar(adventurer, {
    seed: seed || 'legend',
    size,
    radius: 50,
    backgroundColor: ['f4e2cb', 'f5e4c3', 'f4d8de', 'e3dbef', 'd8e9dc', 'fbe1d8'],
    backgroundType: ['solid'],
  }).toDataUri();
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={uri} width={size} height={size} className={className} alt="" aria-hidden />;
}
