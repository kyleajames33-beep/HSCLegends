import type { Subject } from '@/lib/questions';

// Hand-built SVG boss creatures — one cohesive monster family, themed per subject,
// with expressions that react to HP (ok → hurt → critical → knocked out).
type Kind = 'cilia' | 'bubbles' | 'orbit' | 'angular' | 'curve' | 'spiral';
const CONFIG: Record<Subject, { body: [string, string]; accent: string; kind: Kind }> = {
  biology: { body: ['#8fd3a6', '#3f8f63'], accent: '#2c6e49', kind: 'cilia' },
  chemistry: { body: ['#8ea2d6', '#4257a0'], accent: '#2c3e80', kind: 'bubbles' },
  physics: { body: ['#9a86c4', '#4e4068'], accent: '#d6a85f', kind: 'orbit' },
  'maths-standard': { body: ['#7fc6c2', '#2f8f88'], accent: '#1f6b66', kind: 'angular' },
  'maths-advanced': { body: ['#86a8d6', '#3a5e9c', ], accent: '#d6a85f', kind: 'curve' },
  'maths-ext1': { body: ['#c79ad6', '#7d4e9c'], accent: '#5a3578', kind: 'spiral' },
};

type Mood = 'ok' | 'hurt' | 'crit' | 'ko';
function moodFrom(frac: number, defeated: boolean): Mood {
  if (defeated) return 'ko';
  if (frac > 0.6) return 'ok';
  if (frac > 0.25) return 'hurt';
  return 'crit';
}

export default function BossArt({
  subject, frac, defeated, className,
}: { subject: Subject; frac: number; defeated?: boolean; className?: string }) {
  const c = CONFIG[subject];
  const mood = moodFrom(frac, defeated ?? false);
  const gid = `bg-${subject}`;

  return (
    <svg viewBox="0 0 140 150" className={className} role="img" aria-label={`${subject} boss`}>
      <defs>
        <radialGradient id={gid} cx="40%" cy="32%" r="75%">
          <stop offset="0%" stopColor={c.body[0]} />
          <stop offset="100%" stopColor={c.body[1]} />
        </radialGradient>
      </defs>

      {/* behind-body accents */}
      {c.kind === 'orbit' && (
        <g stroke={c.accent} strokeWidth="3" fill="none" opacity="0.9">
          <ellipse cx="70" cy="78" rx="62" ry="22" transform="rotate(-18 70 78)" />
          <circle cx="14" cy="64" r="2.5" fill="#fff" stroke="none" />
          <circle cx="126" cy="92" r="2" fill="#fff" stroke="none" />
        </g>
      )}
      {c.kind === 'cilia' &&
        Array.from({ length: 12 }).map((_, i) => {
          const a = (i / 12) * Math.PI * 2;
          return (
            <line key={i} x1={70 + Math.cos(a) * 52} y1={78 + Math.sin(a) * 56}
              x2={70 + Math.cos(a) * 64} y2={78 + Math.sin(a) * 70}
              stroke={c.accent} strokeWidth="4" strokeLinecap="round" />
          );
        })}
      {c.kind === 'angular' && (
        <g fill={c.accent}>
          <path d="M70 6 L84 26 L56 26 Z" />
          <path d="M30 20 L42 36 L18 36 Z" opacity="0.8" />
          <path d="M110 20 L122 36 L98 36 Z" opacity="0.8" />
        </g>
      )}

      {/* body */}
      <path
        d="M70 16 C104 16 126 40 126 76 C126 112 102 134 70 134 C38 134 14 112 14 76 C14 40 36 16 70 16 Z"
        fill={`url(#${gid})`} stroke={c.body[1]} strokeWidth="2" />

      {/* on-body accents */}
      {c.kind === 'bubbles' && (
        <g fill="#fff" opacity="0.55">
          <circle cx="48" cy="104" r="6" /><circle cx="64" cy="116" r="4" /><circle cx="58" cy="94" r="3" />
        </g>
      )}
      {c.kind === 'curve' && (
        <path d="M30 112 C 52 70, 92 118, 112 60" fill="none" stroke={c.accent} strokeWidth="5" strokeLinecap="round" />
      )}
      {c.kind === 'spiral' && (
        <path d="M52 104 a10 10 0 1 1 18 0 a14 14 0 1 0 -18 8" fill="none" stroke={c.accent} strokeWidth="5" strokeLinecap="round" opacity="0.85" />
      )}

      <Face mood={mood} />
    </svg>
  );
}

function Face({ mood }: { mood: Mood }) {
  const koOrCrit = mood === 'ko' || mood === 'crit';
  return (
    <g>
      {/* brows — menacing when healthy, raised when hurt */}
      {mood === 'ok' && (
        <g stroke="#1f2233" strokeWidth="5" strokeLinecap="round">
          <line x1="40" y1="58" x2="60" y2="64" />
          <line x1="100" y1="58" x2="80" y2="64" />
        </g>
      )}
      {mood === 'hurt' && (
        <g stroke="#1f2233" strokeWidth="5" strokeLinecap="round">
          <line x1="40" y1="62" x2="60" y2="58" />
          <line x1="100" y1="62" x2="80" y2="58" />
        </g>
      )}

      {/* eyes */}
      {koOrCrit ? (
        <g stroke="#1f2233" strokeWidth="5" strokeLinecap="round">
          <line x1="44" y1="68" x2="56" y2="80" /><line x1="56" y1="68" x2="44" y2="80" />
          <line x1="84" y1="68" x2="96" y2="80" /><line x1="96" y1="68" x2="84" y2="80" />
        </g>
      ) : (
        <g>
          <circle cx="50" cy="74" r="11" fill="#fff" />
          <circle cx="90" cy="74" r="11" fill="#fff" />
          <circle cx={mood === 'hurt' ? 49 : 52} cy="76" r="5" fill="#1f2233" />
          <circle cx={mood === 'hurt' ? 89 : 92} cy="76" r="5" fill="#1f2233" />
        </g>
      )}

      {/* mouth */}
      {mood === 'ok' && <path d="M52 100 Q70 114 88 100" fill="none" stroke="#1f2233" strokeWidth="5" strokeLinecap="round" />}
      {mood === 'hurt' && <path d="M52 106 Q70 98 88 106" fill="none" stroke="#1f2233" strokeWidth="5" strokeLinecap="round" />}
      {koOrCrit && <ellipse cx="70" cy="104" rx="9" ry="11" fill="#1f2233" />}
    </g>
  );
}
