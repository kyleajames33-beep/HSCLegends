'use client';

// Synthesized sound effects for the live game. No audio files: short note
// sequences rendered with Web Audio. Optional; any failure is ignored.

import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';

export type Cue = 'join' | 'start' | 'tick' | 'lock' | 'reveal' | 'correct' | 'wrong' | 'fanfare';

type Note = { f: number; t: number; d: number; type?: OscillatorType; v?: number; slide?: number };
const C5 = 523.25, E5 = 659.25, G5 = 783.99, A5 = 880, C6 = 1046.5, E6 = 1318.5, G4 = 392, C4 = 261.63, A3 = 220, F3 = 174.61;

const CUES: Record<Cue, Note[]> = {
  join: [{ f: G5, t: 0, d: .07, v: .05 }, { f: C6, t: .06, d: .09, v: .05 }],
  start: [{ f: C5, t: 0, d: .1 }, { f: E5, t: .1, d: .1 }, { f: G5, t: .2, d: .18 }],
  tick: [{ f: 1200, t: 0, d: .03, type: 'square', v: .025 }],
  lock: [{ f: A5, t: 0, d: .08, type: 'triangle', v: .06 }],
  reveal: [{ f: G4, t: 0, d: .25, type: 'triangle', v: .05, slide: C6 }],
  correct: [{ f: C5, t: 0, d: .09 }, { f: E5, t: .08, d: .09 }, { f: G5, t: .16, d: .09 }, { f: C6, t: .24, d: .22 }],
  wrong: [{ f: C4, t: 0, d: .16, type: 'sawtooth', v: .04 }, { f: A3, t: .15, d: .28, type: 'sawtooth', v: .04 }],
  fanfare: [
    { f: C5, t: 0, d: .12 }, { f: C5, t: .13, d: .12 }, { f: C5, t: .26, d: .12 }, { f: G5, t: .4, d: .3 },
    { f: E5, t: .72, d: .14 }, { f: G5, t: .88, d: .14 }, { f: C6, t: 1.04, d: .5 }, { f: E6, t: 1.04, d: .5, v: .03 },
    { f: F3, t: .4, d: .3, type: 'triangle', v: .04 }, { f: C4, t: 1.04, d: .5, type: 'triangle', v: .04 },
  ],
};

let ctx: AudioContext | null = null;
function play(cue: Cue) {
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    ctx ??= new Ctor();
    if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
    const start = ctx.currentTime + .01;
    for (const n of CUES[cue]) {
      const osc = ctx.createOscillator(), gain = ctx.createGain(), at = start + n.t, peak = n.v ?? .07;
      osc.type = n.type ?? 'sine';
      osc.frequency.setValueAtTime(n.f, at);
      if (n.slide) osc.frequency.exponentialRampToValueAtTime(n.slide, at + n.d);
      gain.gain.setValueAtTime(.0001, at);
      gain.gain.exponentialRampToValueAtTime(peak, at + .012);
      gain.gain.exponentialRampToValueAtTime(.0001, at + n.d);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(at); osc.stop(at + n.d + .02);
    }
  } catch { /* sound is optional */ }
}

const listeners = new Set<() => void>();
function readPref(key: string): '1' | '0' | null {
  try { const v = window.localStorage.getItem(`hsc-live-sound-${key}`); return v === '1' || v === '0' ? v : null; } catch { return null; }
}

/** Sound preference per screen, remembered in this browser. */
export function useSound(key: string, defaultOn: boolean) {
  const subscribe = useCallback((cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, []);
  const pref = useSyncExternalStore(subscribe, () => readPref(key), () => null);
  const on = pref === null ? defaultOn : pref === '1';
  const onRef = useRef(on);
  useEffect(() => { onRef.current = on; }, [on]);
  const toggle = useCallback(() => {
    const next = !onRef.current;
    onRef.current = next;
    try { window.localStorage.setItem(`hsc-live-sound-${key}`, next ? '1' : '0'); } catch { /* ignore */ }
    listeners.forEach(cb => cb());
    if (next) play('lock');
  }, [key]);
  const cue = useCallback((c: Cue) => { if (onRef.current) play(c); }, []);
  // Stable object: effects that list `sound` as a dependency must not restart every render.
  return useMemo(() => ({ on, toggle, cue }), [on, toggle, cue]);
}

/** Fires `effect` once each time `key` changes to a new non-null value. */
export function useOnChange(key: string | null, effect: () => void) {
  const prev = useRef<string | null>(null);
  const fn = useRef(effect);
  useEffect(() => { fn.current = effect; });
  useEffect(() => {
    if (key !== null && prev.current !== null && key !== prev.current) fn.current();
    prev.current = key;
  }, [key]);
}
