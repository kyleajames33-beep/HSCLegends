import { createAvatar } from '@dicebear/core';
import { adventurer, bigSmile, funEmoji, bottts, miniavs, notionists, openPeeps, pixelArt } from '@dicebear/collection';

const STYLES = { adventurer, bigSmile, funEmoji, bottts, miniavs, notionists, openPeeps, pixelArt };
export type AvatarStyle = keyof typeof STYLES;
export const AVATAR_STYLES = Object.keys(STYLES) as AvatarStyle[];
export const STYLE_LABEL: Record<AvatarStyle, string> = {
  adventurer: 'Hero', bigSmile: 'Smiley', funEmoji: 'Emoji', bottts: 'Robot',
  miniavs: 'Mini', notionists: 'Doodle', openPeeps: 'Peeps', pixelArt: 'Pixel',
};

// Deterministic character avatar. Same (style, seed) = same face everywhere.
export default function Avatar({
  seed, style = 'adventurer', size = 48, className,
}: { seed: string; style?: string; size?: number; className?: string }) {
  const key = (style as AvatarStyle) in STYLES ? (style as AvatarStyle) : 'adventurer';
  const s = STYLES[key] as typeof adventurer;
  const uri = createAvatar(s, {
    seed: seed || 'legend',
    size,
    radius: 50,
    backgroundColor: ['f4e2cb', 'f5e4c3', 'f4d8de', 'e3dbef', 'd8e9dc', 'fbe1d8'],
    backgroundType: ['solid'],
  }).toDataUri();
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={uri} width={size} height={size} className={className} alt="" aria-hidden />;
}
