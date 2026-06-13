// Flat unDraw-style spot illustrations (hand-authored SVG, on-brand palette).

export function PodiumSpot({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 220 165" className={className} role="img" aria-label="Empty podium">
      {/* sparkles */}
      <g fill="#d6a85f">
        <circle cx="40" cy="40" r="3" /><circle cx="184" cy="54" r="2.5" /><circle cx="150" cy="24" r="2" />
      </g>
      {/* trophy */}
      <g transform="translate(110,40)">
        <path d="M-16 -22 h32 v12 a16 16 0 0 1 -32 0 z" fill="#d6a85f" />
        <path d="M-16 -20 q-9 0 -9 9 q0 7 9 7" stroke="#a87f3f" strokeWidth="3.5" fill="none" />
        <path d="M16 -20 q9 0 9 9 q0 7 -9 7" stroke="#a87f3f" strokeWidth="3.5" fill="none" />
        <rect x="-4" y="-2" width="8" height="9" fill="#a87f3f" />
        <rect x="-13" y="7" width="26" height="6" rx="3" fill="#a87f3f" />
        <path d="M-7 -16 l3 6 l6 1 l-4 4 l1 6 l-6 -3 l-6 3 l1 -6 l-4 -4 l6 -1 z" fill="#fff" opacity="0.9" />
      </g>
      {/* podium blocks */}
      <rect x="18" y="100" width="58" height="50" rx="7" fill="#c47b8a" />
      <rect x="81" y="76" width="58" height="74" rx="7" fill="#d6a85f" />
      <rect x="144" y="114" width="58" height="36" rx="7" fill="#6d5b8a" />
      <g fill="#fff" fontFamily="sans-serif" fontWeight="800" fontSize="22" textAnchor="middle">
        <text x="47" y="133">2</text><text x="110" y="120">1</text><text x="173" y="139">3</text>
      </g>
    </svg>
  );
}

export function ClassSpot({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 220 165" className={className} role="img" aria-label="Empty classroom">
      {/* chalkboard */}
      <rect x="40" y="26" width="140" height="84" rx="8" fill="#2d3142" />
      <rect x="40" y="26" width="140" height="84" rx="8" fill="none" stroke="#a87f3f" strokeWidth="4" />
      <path d="M88 68 h44 M110 46 v44" stroke="#f4e2cb" strokeWidth="6" strokeLinecap="round" />
      {/* three students */}
      {[[70, '#c47b8a'], [110, '#6b9b7c'], [150, '#6d5b8a']].map(([x, col], i) => (
        <g key={i} transform={`translate(${x},128)`}>
          <circle cx="0" cy="0" r="11" fill={col as string} />
          <path d="M-15 30 a15 17 0 0 1 30 0 z" fill={col as string} />
        </g>
      ))}
    </svg>
  );
}
