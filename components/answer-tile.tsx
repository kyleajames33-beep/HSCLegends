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
  const dim = reveal === 'dim';
  const badge = reveal === 'correct' ? '✓' : reveal === 'wrong' ? '✗' : s.icon;

  return (
    <button
      onClick={onClick}
      disabled={disabled || !onClick}
      className="group flex w-full items-center gap-3 rounded-2xl px-4 py-4 text-left font-display font-bold transition active:translate-y-[3px] disabled:cursor-default"
      style={{
        background: s.bg,
        color: s.fg,
        boxShadow: `0 4px 0 ${s.deep}`,
        opacity: dim ? 0.4 : 1,
        outline: reveal === 'correct' ? '3px solid #2d3142' : 'none',
        outlineOffset: 2,
      }}
    >
      <span
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-sm"
        style={{ background: 'rgba(255,255,255,0.25)', color: s.fg }}
      >
        {badge}
      </span>
      <span className="leading-snug">{children}</span>
    </button>
  );
}
