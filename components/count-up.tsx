'use client';

import { useEffect, useState } from 'react';

// Animates a number from 0 → `to` once on mount (easeOutCubic). Used for reward
// payoffs (XP, Sparks) so they feel earned rather than just appearing.
export default function CountUp({
  to,
  duration = 700,
  className,
  prefix = '',
  suffix = '',
}: {
  to: number;
  duration?: number;
  className?: string;
  prefix?: string;
  suffix?: string;
}) {
  const [n, setN] = useState(0);
  useEffect(() => {
    let raf = 0;
    let start = 0;
    const tick = (now: number) => {
      if (!start) start = now;
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setN(Math.round(to * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, duration]);
  return (
    <span className={className}>
      {prefix}
      {n}
      {suffix}
    </span>
  );
}
