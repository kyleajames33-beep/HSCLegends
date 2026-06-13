// SVG shield badges for the weekly League tiers.
const TIERS: Record<string, { a: string; b: string; stroke: string; stars: number }> = {
  Bronze: { a: '#d99a5b', b: '#a0632d', stroke: '#7a4a20', stars: 1 },
  Silver: { a: '#dfe6ee', b: '#9aa6b6', stroke: '#6f7b8a', stars: 2 },
  Gold: { a: '#f1d27a', b: '#cf9f3e', stroke: '#9a7320', stars: 3 },
  Platinum: { a: '#cfe0f5', b: '#8ea2d6', stroke: '#5a6ea8', stars: 4 },
  Diamond: { a: '#bff0f5', b: '#5cc6d8', stroke: '#2f93a6', stars: 5 },
};

function Star({ x, y, r = 4 }: { x: number; y: number; r?: number }) {
  const pts = Array.from({ length: 10 }, (_, i) => {
    const ang = (Math.PI / 5) * i - Math.PI / 2;
    const rad = i % 2 === 0 ? r : r / 2.4;
    return `${(x + Math.cos(ang) * rad).toFixed(1)},${(y + Math.sin(ang) * rad).toFixed(1)}`;
  }).join(' ');
  return <polygon points={pts} fill="#fff" opacity="0.95" />;
}

export default function LeagueBadge({ tier, className }: { tier: string; className?: string }) {
  const t = TIERS[tier] ?? TIERS.Bronze;
  const gid = `lg-${tier}`;
  const starY = 26;
  const spread = (t.stars - 1) * 7;
  return (
    <svg viewBox="0 0 48 52" className={className} role="img" aria-label={`${tier} league`}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={t.a} />
          <stop offset="100%" stopColor={t.b} />
        </linearGradient>
      </defs>
      <path d="M24 2 L44 9 L44 27 C44 40 34 47 24 50 C14 47 4 40 4 27 L4 9 Z"
        fill={`url(#${gid})`} stroke={t.stroke} strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M24 2 L44 9 L44 27 C44 33 41 38 36 41 L24 6 Z" fill="#fff" opacity="0.18" />
      {Array.from({ length: t.stars }).map((_, i) => (
        <Star key={i} x={24 - spread / 2 + i * 7} y={starY} r={t.stars > 3 ? 3.4 : 4.2} />
      ))}
    </svg>
  );
}
