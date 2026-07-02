// The player's fighter character (toon sprites, idle/attack/hurt/special frames).
// Pick one = "design your character". Sprites live in /public/fighters/<id>/.

export const FIGHTERS = ['male-adventurer', 'female-adventurer', 'robot', 'zombie'] as const;
export type FighterId = (typeof FIGHTERS)[number];
export const FIGHTER_LABEL: Record<FighterId, string> = {
  'male-adventurer': 'Adventurer',
  'female-adventurer': 'Explorer',
  robot: 'Robot',
  zombie: 'Zombie',
};

export default function PlayerFighter({
  char = 'male-adventurer', pose = 'idle', className,
}: {
  char?: FighterId;
  pose?: 'idle' | 'attack' | 'hurt' | 'special';
  className?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/fighters/${char}/${pose}.png`}
      alt=""
      aria-hidden
      className={className}
      style={{ objectFit: 'contain', filter: 'drop-shadow(0 8px 10px rgba(0,0,0,0.35))' }}
    />
  );
}
