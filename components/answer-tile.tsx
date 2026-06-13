'use client';

// Blooket/Kahoot-style answer tile: 4 fixed colours + shapes, chunky shadow.
const SHAPES = [
  { bg: '#c47b8a', deep: '#9c5c6e', fg: '#fff', icon: '▲' }, // A rose
  { bg: '#6d5b8a', deep: '#4e4068', fg: '#fff', icon: '◆' }, // B plum
  { bg: '#d6a85f', deep: '#a87f3f', fg: '#3d2700', icon: '●' }, // C gold
  { bg: '#6b9b7c', deep: '#4a7a5b', fg: '#fff', icon: '■' }, // D green
];

type Reveal = 'correct' | 'wrong' | 'dim' | null;

export default function AnswerTile({
  index,
  children,
  onClick,
  disabled,
  reveal = null,
}: {
  index: number;
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  reveal?: Reveal;
}) {
  const s = SHAPES[index % 4];
  // On reveal, recolor to the universal green/red so "right" is unmistakable.
  let bg = s.bg, deep = s.deep, fg = s.fg, badge: string = s.icon, opacity = 1, glow = '';
  if (reveal === 'correct') {
    bg = '#4fa56f'; deep = '#3a7d54'; fg = '#fff'; badge = '✓';
    glow = '0 0 0 4px rgba(79,165,111,0.35), ';
  } else if (reveal === 'wrong') {
    bg = '#c4646b'; deep = '#9c4a50'; fg = '#fff'; badge = '✗';
  } else if (reveal === 'dim') {
    opacity = 0.4;
  }

  return (
    <button
      onClick={onClick}
      disabled={disabled || !onClick}
      className="group flex w-full items-center gap-3 md:gap-4 rounded-2xl px-4 py-4 md:px-5 md:py-6 text-left text-base md:text-xl font-display font-bold transition active:translate-y-[3px] disabled:cursor-default"
      style={{
        background: bg,
        color: fg,
        boxShadow: `${glow}0 4px 0 ${deep}`,
        opacity,
        transform: reveal === 'correct' ? 'scale(1.02)' : 'none',
      }}
    >
      <span
        className="flex h-8 w-8 md:h-11 md:w-11 shrink-0 items-center justify-center rounded-lg md:rounded-xl text-lg md:text-2xl font-extrabold"
        style={{ background: 'rgba(255,255,255,0.28)', color: fg }}
      >
        {badge}
      </span>
      <span className="leading-snug">{children}</span>
    </button>
  );
}
