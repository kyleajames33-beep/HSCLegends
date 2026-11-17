import Image from 'next/image';

export type IconName = 'correct-tick' | 'wrong-cross' | 'crown' | 'trophy' | 'streak-flame' | 'spark' | 'timer' | 'lock' | 'player' | 'players-group' | 'star' | 'shield' | 'play' | 'sound-on' | 'sound-off' | 'reconnect' | 'connection' | 'heart' | 'gem' | 'scan';

/** Locked-style UI icon from public/art/icons (96px source). Decorative unless `label` is given. */
export function Icon({ name, size = 24, label, className }: { name: IconName; size?: number; label?: string; className?: string }) {
  return <Image src={`/art/icons/${name}.webp`} width={size} height={size} alt={label ?? ''} aria-hidden={label ? undefined : true} className={className} />;
}
