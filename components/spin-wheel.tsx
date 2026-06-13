'use client';

import { useState } from 'react';

// Tap-to-spin wheel. The visible segments are illustrative Spark amounts; the
// actual reward comes from the server (onSpin). We spin to a segment that shows
// the won amount when possible, otherwise to a sensible nearby segment.
const SEGMENTS = [10, 20, 30, 50, 10, 75, 20, 150];
const SEG_COLORS = ['#6d5b8a', '#c47b8a', '#d6a85f', '#6b9b7c', '#9c5c6e', '#d6a85f', '#6d5b8a', '#c47b8a'];

export default function SpinWheel({
  onSpin,
  disabled,
}: {
  onSpin: () => Promise<number>;
  disabled?: boolean;
}) {
  const [angle, setAngle] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [err, setErr] = useState('');

  const seg = 360 / SEGMENTS.length;

  async function spin() {
    if (spinning || disabled) return;
    setSpinning(true);
    setErr('');
    try {
      const reward = await onSpin();
      // Land on a segment matching the reward if one exists, else the closest.
      let target = SEGMENTS.indexOf(reward);
      if (target < 0) {
        let best = 0;
        SEGMENTS.forEach((v, i) => {
          if (Math.abs(v - reward) < Math.abs(SEGMENTS[best] - reward)) best = i;
        });
        target = best;
      }
      // Pointer sits at top (12 o'clock). Rotate so the target segment centre is up.
      const targetCentre = target * seg + seg / 2;
      const spins = 5; // full turns for drama
      const next = angle - (angle % 360) + spins * 360 + (360 - targetCentre);
      setAngle(next);
      // Let the CSS transition play out before re-enabling.
      await new Promise((r) => setTimeout(r, 3300));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Spin failed');
    } finally {
      setSpinning(false);
    }
  }

  const gradient = SEGMENTS.map((_, i) => `${SEG_COLORS[i]} ${i * seg}deg ${(i + 1) * seg}deg`).join(', ');

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: 240, height: 240 }}>
        {/* Pointer */}
        <div className="absolute left-1/2 -top-1 z-10 -translate-x-1/2 text-2xl leading-none drop-shadow">▼</div>
        {/* Wheel */}
        <div
          className="absolute inset-0 rounded-full border-4 border-gold shadow-lg"
          style={{
            background: `conic-gradient(${gradient})`,
            transform: `rotate(${angle}deg)`,
            transition: spinning ? 'transform 3.2s cubic-bezier(.17,.67,.2,1)' : 'none',
          }}
        >
          {SEGMENTS.map((v, i) => (
            <span
              key={i}
              className="absolute left-1/2 top-1/2 font-display font-extrabold text-white text-sm"
              style={{
                transform: `rotate(${i * seg + seg / 2}deg) translateY(-92px)`,
                transformOrigin: '0 0',
              }}
            >
              {v}
            </span>
          ))}
        </div>
        {/* Hub */}
        <div className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 grid h-12 w-12 place-items-center rounded-full bg-panel border-2 border-gold text-xl">
          ✨
        </div>
      </div>

      <button
        onClick={spin}
        disabled={spinning || disabled}
        className="lg-btn lg-btn-primary mt-5 w-full px-6 py-4 text-lg disabled:opacity-40"
      >
        {disabled ? 'Come back tomorrow ✨' : spinning ? 'Spinning…' : 'Spin! ✨'}
      </button>
      {err && <p className="mt-2 text-brick text-sm">{err}</p>}
    </div>
  );
}
