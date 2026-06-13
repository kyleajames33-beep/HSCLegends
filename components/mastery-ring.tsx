'use client';

// Reusable SVG progress ring (the "mastery dial"). Stroke fills clockwise to
// `pct`. Optional center text (e.g. a band range) and a caption label below.
export default function MasteryRing({
  pct,
  label,
  center,
  band,
  size = 92,
  stroke = 9,
  color = '#6b9b7c', // leaf
}: {
  pct: number;            // 0..100
  label?: string;         // caption under the ring
  center?: string;        // big text in the middle (defaults to "NN%")
  band?: string;          // small text under the center number (e.g. "Band 3–4")
  size?: number;
  stroke?: number;
  color?: string;
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(pct)));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - clamped / 100);

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="#f4e2cb" /* parchment-deep track */
            strokeWidth={stroke}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 0.6s ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display font-extrabold leading-none text-ink" style={{ fontSize: size * 0.26 }}>
            {center ?? `${clamped}%`}
          </span>
          {band && <span className="mt-0.5 text-[10px] font-semibold text-inksoft leading-none">{band}</span>}
        </div>
      </div>
      {label && <span className="mt-2 text-center text-xs font-semibold text-inksoft leading-tight">{label}</span>}
    </div>
  );
}
