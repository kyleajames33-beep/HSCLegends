'use client';

// Compact mm:ss countdown display. Turns text-brick (and pulses) under 60s.
// Pass a `remaining` value in whole seconds (e.g. from useCountdown).
export default function ExamTimer({ remaining }: { remaining: number }) {
  const safe = Math.max(0, Math.floor(remaining));
  const mm = Math.floor(safe / 60);
  const ss = safe % 60;
  const low = safe < 60;
  return (
    <span
      className={`font-display font-extrabold tabular-nums tracking-wide ${
        low ? 'text-brick animate-pulse' : 'text-ink'
      }`}
      aria-label={`${mm} minutes ${ss} seconds remaining`}
    >
      {mm}:{ss.toString().padStart(2, '0')}
    </span>
  );
}
