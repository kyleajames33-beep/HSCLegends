'use client';

import { useEffect, useState } from 'react';

// Ticks every 250ms and reports time left for the current live question, based on
// the server's question_started_at + per-question seconds.
export function useCountdown(startedAtIso: string | null, seconds: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  if (!startedAtIso) return { remaining: seconds, frac: 1, expired: false };
  const elapsed = (now - new Date(startedAtIso).getTime()) / 1000;
  const left = Math.max(0, seconds - elapsed);
  return { remaining: Math.ceil(left), frac: Math.max(0, Math.min(1, left / seconds)), expired: left <= 0 };
}
