'use client';

import { useCallback, useRef, useState } from 'react';

// ── Juice Kit — shared game-feel FX for every mode ──
// Extracted from Campaign's battle FX. Campaign keeps its own inline copy
// (app/campaign/page.tsx) — do NOT refactor it onto this kit without a
// playtest. New/updated modes should import from here. See docs/JUICE_KIT.md.
//
//   const juice = useJuice();
//   return <>{juice.overlay}<main>…</main></>;   // overlay once, outside any
//                                                // transformed (shaken) element
//   juice.correct(`+${points}`, atEvent(e));     // burst + float + buzz
//   juice.wrong('✗', atEvent(e));                // red flash + shake + float + buzz
//
// Standalone visuals: <TimerBar/> (urgency colour shift), <StreakFlame/>.

export type JuiceTone = 'gold' | 'red' | 'green' | 'blue';
export type JuiceAt = { x: number; y: number }; // viewport %, e.g. { x: 50, y: 42 }

const FLOAT_STYLE: Record<JuiceTone, { color: string; shadow: string }> = {
  gold:  { color: '#ffd34d', shadow: '0 3px 0 #7a4a00, 0 0 12px rgba(0,0,0,0.45)' },
  red:   { color: '#ff5555', shadow: '0 3px 0 #5a0000, 0 0 12px rgba(0,0,0,0.45)' },
  green: { color: '#7fe0a0', shadow: '0 3px 0 #1d5a35, 0 0 12px rgba(0,0,0,0.45)' },
  blue:  { color: '#8fb0ff', shadow: '0 3px 0 #1c2f7a, 0 0 12px rgba(0,0,0,0.45)' },
};
const FLASH_BG: Record<JuiceTone, string> = {
  red:   'rgba(220,38,38,0.55)',
  gold:  'rgba(255,200,60,0.5)',
  blue:  'rgba(96,120,220,0.45)',
  green: 'rgba(60,190,110,0.4)',
};
const PARTICLES: Record<JuiceTone, string[]> = {
  gold:  ['#ffd34d', '#ffb347', '#fff3b0', '#e89b8b'],
  red:   ['#ff5555', '#ff8a5c', '#ffd1d1'],
  green: ['#7fe0a0', '#b8f0c8', '#4fa56f'],
  blue:  ['#8fb0ff', '#c7d6ff', '#6d5b8a'],
};

// Anchor FX to where the user tapped (viewport %). Works with any pointer/mouse event.
export function atEvent(e: { clientX: number; clientY: number }): JuiceAt {
  return { x: (e.clientX / window.innerWidth) * 100, y: (e.clientY / window.innerHeight) * 100 };
}

// Haptics on mobile (no-op elsewhere).
export function buzz(pattern: number | number[]) {
  if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(pattern);
}

type Float = { id: number; text: string; tone: JuiceTone; at: JuiceAt; big: boolean };
type Particle = { id: number; color: string; size: number; dx: number; dy: number; at: JuiceAt };

export type Juice = ReturnType<typeof useJuice>;

export function useJuice() {
  const [floats, setFloats] = useState<Float[]>([]);
  const [particles, setParticles] = useState<Particle[]>([]);
  const [flashTone, setFlashTone] = useState<JuiceTone | null>(null);
  const [shaking, setShaking] = useState(false);
  const id = useRef(0);
  const flashT = useRef(0);
  const shakeT = useRef(0);

  // Floating damage/score number that rises and fades (Campaign's fx-float).
  const float = useCallback((text: string, opts: { tone?: JuiceTone; at?: JuiceAt; big?: boolean } = {}) => {
    const f: Float = { id: ++id.current, text, tone: opts.tone ?? 'gold', at: opts.at ?? { x: 50, y: 40 }, big: !!opts.big };
    setFloats((fs) => [...fs, f]);
    window.setTimeout(() => setFloats((fs) => fs.filter((x) => x.id !== f.id)), 950);
  }, []);

  // Particle burst at a point — the "correct answer" pop.
  const burst = useCallback((opts: { tone?: JuiceTone; at?: JuiceAt; count?: number } = {}) => {
    const tone = opts.tone ?? 'gold';
    const at = opts.at ?? { x: 50, y: 42 };
    const n = opts.count ?? 14;
    const palette = PARTICLES[tone];
    const ps: Particle[] = Array.from({ length: n }, (_, i) => {
      const angle = (i / n) * Math.PI * 2 + Math.random() * 0.5;
      const dist = 40 + Math.random() * 70;
      return {
        id: ++id.current,
        color: palette[i % palette.length],
        size: 5 + Math.random() * 7,
        dx: Math.cos(angle) * dist,
        dy: Math.sin(angle) * dist - 18, // slight upward drift
        at,
      };
    });
    setParticles((cur) => [...cur, ...ps]);
    const ids = new Set(ps.map((p) => p.id));
    window.setTimeout(() => setParticles((cur) => cur.filter((p) => !ids.has(p.id))), 700);
  }, []);

  // Full-screen colour flash (gold = you scored, red = you got hit, blue = block).
  const flash = useCallback((tone: JuiceTone) => {
    window.clearTimeout(flashT.current);
    setFlashTone(null);
    requestAnimationFrame(() => setFlashTone(tone)); // restart even mid-flash
    flashT.current = window.setTimeout(() => setFlashTone(null), 520);
  }, []);

  // Screen shake — apply juice.shakeClass to the container that should shake.
  const shake = useCallback(() => {
    window.clearTimeout(shakeT.current);
    setShaking(true);
    shakeT.current = window.setTimeout(() => setShaking(false), 480);
  }, []);

  // Convenience combos — one call per game moment.
  const correct = useCallback((text?: string, at?: JuiceAt) => {
    burst({ tone: 'gold', at });
    if (text) float(text, { tone: 'gold', at: at ? { x: at.x, y: at.y - 4 } : undefined });
    buzz(30);
  }, [burst, float]);

  const wrong = useCallback((text?: string, at?: JuiceAt) => {
    flash('red');
    shake();
    if (text) float(text, { tone: 'red', at });
    buzz(60);
  }, [flash, shake, float]);

  // Render once per page, OUTSIDE any element that gets shakeClass — position:fixed
  // breaks inside a transformed ancestor.
  const overlay = (
    <>
      {flashTone && <div className="fx-flash" style={{ background: FLASH_BG[flashTone] }} />}
      {particles.map((p) => (
        <span
          key={p.id}
          className="fx-particle"
          style={{
            left: `${p.at.x}vw`, top: `${p.at.y}vh`,
            width: p.size, height: p.size, background: p.color,
            ['--dx' as string]: `${p.dx}px`, ['--dy' as string]: `${p.dy}px`,
          }}
        />
      ))}
      {floats.map((f) => (
        <span
          key={f.id}
          className={`fx-float-fixed font-display ${f.big ? 'text-5xl' : 'text-4xl'}`}
          style={{ left: `${f.at.x}vw`, top: `${f.at.y}vh`, color: FLOAT_STYLE[f.tone].color, textShadow: FLOAT_STYLE[f.tone].shadow }}
        >
          {f.text}
        </span>
      ))}
    </>
  );

  return { float, burst, flash, shake, buzz, correct, wrong, overlay, shakeClass: shaking ? 'fx-screen-shake' : '' };
}

// Campaign's timer palette: green → gold → red as time runs out.
export function timerTone(frac: number) {
  return frac > 0.5 ? '#6b9b7c' : frac > 0.25 ? '#d6a85f' : '#c4646b';
}

// Timer-urgency bar + countdown number. trackClass sets the empty-track colour
// ('bg-parchment-deep' on light pages, 'bg-black/30' on dark arenas).
export function TimerBar({ secondsLeft, totalSeconds, trackClass = 'bg-parchment-deep' }: {
  secondsLeft: number;
  totalSeconds: number;
  trackClass?: string;
}) {
  const frac = totalSeconds > 0 ? Math.max(0, Math.min(1, secondsLeft / totalSeconds)) : 0;
  const tone = timerTone(frac);
  const urgent = frac <= 0.25 && secondsLeft > 0;
  return (
    <div className="flex items-center gap-2">
      <div className={`h-2 flex-1 rounded-full overflow-hidden ${trackClass}`}>
        <div className="h-full transition-[width] duration-500 ease-linear" style={{ width: `${frac * 100}%`, background: tone }} />
      </div>
      <span className={`text-xs font-mono font-bold tabular-nums ${urgent ? 'fx-urgent' : ''}`} style={{ color: tone }}>
        {Math.max(0, Math.ceil(secondsLeft))}s
      </span>
    </div>
  );
}

// Streak-flame pill — escalates as the combo climbs: static → flicker → inferno.
// Colours are inline so it reads on both parchment and dark-arena backgrounds.
export function StreakFlame({ combo, label = 'streak', className = '' }: {
  combo: number;
  label?: string;
  className?: string;
}) {
  if (combo < 2) return null;
  const tier = combo >= 8 ? 3 : combo >= 5 ? 2 : 1;
  const { fire, color, bg, anim } = [
    { fire: '🔥', color: '#e8833a', bg: 'rgba(232,131,58,0.16)', anim: '' },
    { fire: '🔥', color: '#f97316', bg: 'rgba(249,115,22,0.2)', anim: 'fx-flame-slow' },
    { fire: '🔥🔥', color: '#ef4444', bg: 'rgba(239,68,68,0.2)', anim: 'fx-flame-fast' },
  ][tier - 1];
  return (
    <span
      key={combo} // re-pop on every combo change
      className={`lg-pop inline-block rounded-full px-3 py-1 font-display font-extrabold ${anim} ${className}`}
      style={{ color, background: bg }}
    >
      {fire} {combo} {label}
    </span>
  );
}
