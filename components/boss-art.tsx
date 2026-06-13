import type { Subject } from '@/lib/questions';

// Hand-built SVG boss monsters — distinct menacing silhouette per subject, with
// expressions that react to HP (ok → hurt → critical → knocked out).
const THEME: Record<Subject, { a: string; b: string; dark: string; accent: string }> = {
  biology: { a: '#7fd39b', b: '#2c6e49', dark: '#1f4e34', accent: '#1f5236' },
  chemistry: { a: '#9a8fe0', b: '#463f8c', dark: '#2e2960', accent: '#6be0a0' },
  physics: { a: '#6f5ca0', b: '#241d3e', dark: '#120f22', accent: '#d6a85f' },
  'maths-standard': { a: '#67d6cd', b: '#1f6b66', dark: '#134a46', accent: '#0e4a45' },
  'maths-advanced': { a: '#6f97cf', b: '#243d5e', dark: '#162840', accent: '#d6a85f' },
  'maths-ext1': { a: '#bd8fdc', b: '#5a3578', dark: '#3c2152', accent: '#e0b3ff' },
};

type Mood = 'ok' | 'hurt' | 'crit' | 'ko';
const moodFrom = (frac: number, defeated: boolean): Mood =>
  defeated ? 'ko' : frac > 0.6 ? 'ok' : frac > 0.25 ? 'hurt' : 'crit';

export default function BossArt({
  subject, frac, defeated, className,
}: { subject: Subject; frac: number; defeated?: boolean; className?: string }) {
  const t = THEME[subject];
  const mood = moodFrom(frac, defeated ?? false);
  const gid = `bb-${subject}`;
  return (
    <svg viewBox="0 0 150 160" className={className} role="img" aria-label={`${subject} boss`}>
      <defs>
        <radialGradient id={gid} cx="42%" cy="34%" r="75%">
          <stop offset="0%" stopColor={t.a} />
          <stop offset="100%" stopColor={t.b} />
        </radialGradient>
        <radialGradient id={`${gid}-eye`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fff" />
          <stop offset="100%" stopColor="#ffe9b0" />
        </radialGradient>
      </defs>
      <Body subject={subject} t={t} gid={gid} />
      <Face mood={mood} eyeGid={`${gid}-eye`} accent={t.accent} dark={t.dark} />
    </svg>
  );
}

function Body({ subject, t, gid }: { subject: Subject; t: { a: string; b: string; dark: string; accent: string }; gid: string }) {
  const fill = `url(#${gid})`;
  const stroke = t.dark;
  switch (subject) {
    case 'biology': // spiky pathogen
      return (
        <g>
          {Array.from({ length: 12 }).map((_, i) => {
            const ang = (i / 12) * Math.PI * 2;
            const x = 75 + Math.cos(ang) * 54, y = 82 + Math.sin(ang) * 54;
            const tx = 75 + Math.cos(ang) * 72, ty = 82 + Math.sin(ang) * 72;
            return (
              <g key={i}>
                <line x1={x} y1={y} x2={tx} y2={ty} stroke={t.accent} strokeWidth="5" strokeLinecap="round" />
                <circle cx={tx} cy={ty} r="5.5" fill={t.accent} />
              </g>
            );
          })}
          <circle cx="75" cy="82" r="55" fill={fill} stroke={stroke} strokeWidth="3" />
          {[[52, 60], [98, 64], [60, 104], [96, 100]].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="6" fill={t.accent} opacity="0.55" />
          ))}
        </g>
      );
    case 'chemistry': // melting ooze
      return (
        <g>
          <path d="M30 70 C30 36 120 36 120 70 C120 96 124 108 116 124 C112 132 104 120 98 130 C92 140 86 126 78 132 C70 138 64 124 56 130 C48 136 42 124 36 122 C28 110 30 96 30 70 Z"
            fill={fill} stroke={stroke} strokeWidth="3" />
          <circle cx="58" cy="116" r="6" fill="#fff" opacity="0.5" />
          <circle cx="92" cy="120" r="4" fill="#fff" opacity="0.5" />
          <ellipse cx="60" cy="58" rx="13" ry="9" fill="#fff" opacity="0.25" />
        </g>
      );
    case 'physics': // singularity orb + ring
      return (
        <g>
          <ellipse cx="75" cy="84" rx="66" ry="24" transform="rotate(-20 75 84)" fill="none" stroke={t.accent} strokeWidth="4" opacity="0.9" />
          <circle cx="75" cy="82" r="50" fill={fill} stroke={stroke} strokeWidth="3" />
          <circle cx="75" cy="82" r="50" fill="#000" opacity="0.25" />
          <g fill="#fff"><circle cx="40" cy="50" r="2" /><circle cx="116" cy="70" r="1.6" /><circle cx="60" cy="124" r="1.6" /></g>
        </g>
      );
    case 'maths-standard': // crystal
      return (
        <g>
          <path d="M75 24 L122 64 L104 132 L46 132 L28 64 Z" fill={fill} stroke={stroke} strokeWidth="3" strokeLinejoin="round" />
          <path d="M75 24 L75 132 M28 64 L75 78 L122 64 M46 132 L75 78 L104 132" stroke="#fff" strokeWidth="2" opacity="0.3" fill="none" />
        </g>
      );
    case 'maths-advanced': // horned beast
      return (
        <g>
          <path d="M40 40 Q30 18 50 22 Q46 34 58 40 Z" fill={t.b} />
          <path d="M110 40 Q120 18 100 22 Q104 34 92 40 Z" fill={t.b} />
          <path d="M28 84 C28 44 122 44 122 84 C122 120 100 138 75 138 C50 138 28 120 28 84 Z" fill={fill} stroke={stroke} strokeWidth="3" />
          <path d="M44 116 C58 96 92 134 106 104" fill="none" stroke={t.accent} strokeWidth="5" strokeLinecap="round" />
        </g>
      );
    case 'maths-ext1': // spiral horns
      return (
        <g>
          <path d="M46 44 a12 12 0 1 0 -16 -4 a16 16 0 1 1 22 -2" fill="none" stroke={t.accent} strokeWidth="5" strokeLinecap="round" />
          <path d="M104 44 a12 12 0 1 1 16 -4 a16 16 0 1 0 -22 -2" fill="none" stroke={t.accent} strokeWidth="5" strokeLinecap="round" />
          <circle cx="75" cy="86" r="52" fill={fill} stroke={stroke} strokeWidth="3" />
          <path d="M58 92 a9 9 0 1 1 16 0 a13 13 0 1 0 -16 7" fill="none" stroke="#fff" strokeWidth="4" opacity="0.4" strokeLinecap="round" />
        </g>
      );
  }
}

function Face({ mood, eyeGid, accent, dark }: { mood: Mood; eyeGid: string; accent: string; dark: string }) {
  const out = mood === 'ko' || mood === 'crit';
  return (
    <g>
      {/* angry brows */}
      {mood !== 'ko' && mood !== 'crit' && (
        <g stroke={dark} strokeWidth="6" strokeLinecap="round">
          {mood === 'ok' ? (
            <><line x1="42" y1="60" x2="64" y2="70" /><line x1="108" y1="60" x2="86" y2="70" /></>
          ) : (
            <><line x1="44" y1="66" x2="64" y2="62" /><line x1="106" y1="66" x2="86" y2="62" /></>
          )}
        </g>
      )}
      {/* eyes */}
      {out ? (
        <g stroke={dark} strokeWidth="6" strokeLinecap="round">
          <line x1="46" y1="74" x2="60" y2="88" /><line x1="60" y1="74" x2="46" y2="88" />
          <line x1="90" y1="74" x2="104" y2="88" /><line x1="104" y1="74" x2="90" y2="88" />
        </g>
      ) : (
        <g>
          <ellipse cx="55" cy="80" rx="13" ry={mood === 'ok' ? 11 : 9} fill={`url(#${eyeGid})`} stroke={dark} strokeWidth="2" />
          <ellipse cx="95" cy="80" rx="13" ry={mood === 'ok' ? 11 : 9} fill={`url(#${eyeGid})`} stroke={dark} strokeWidth="2" />
          <circle cx={mood === 'hurt' ? 53 : 57} cy="82" r="5.5" fill={dark} />
          <circle cx={mood === 'hurt' ? 93 : 97} cy="82" r="5.5" fill={dark} />
        </g>
      )}
      {/* mouth */}
      {mood === 'ok' && (
        <g>
          <path d="M52 104 Q75 124 98 104 Z" fill={dark} />
          <path d="M58 108 l5 8 l5 -8 M70 110 l5 9 l5 -9 M82 108 l5 8 l5 -8" fill="#fff" />
        </g>
      )}
      {mood === 'hurt' && (
        <g>
          <path d="M54 112 H96" stroke={dark} strokeWidth="6" strokeLinecap="round" />
          <path d="M62 112 l4 -7 l4 7 M78 112 l4 -7 l4 7" fill="#fff" stroke={dark} strokeWidth="1" />
        </g>
      )}
      {out && <ellipse cx="75" cy="110" rx="10" ry="12" fill={dark} />}
    </g>
  );
}
