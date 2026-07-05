# Juice Kit — shared game-feel FX

> Foundation A of [`games-to-gimkit-plan.md`](./games-to-gimkit-plan.md). One module of
> combat/game FX primitives, extracted from Campaign mode, importable by every mode.
> Built + browser-verified 2026-07-04.

## Files

| File | Role |
|---|---|
| [`components/juice.tsx`](../components/juice.tsx) | The kit: `useJuice()` hook + `TimerBar` + `StreakFlame` + helpers |
| [`app/globals.css`](../app/globals.css) | CSS under `── Juice Kit additions ──` (particles, fixed floats, flame flicker, urgent thump). Reuses Campaign's existing global `fx-flash` / `fx-float-up` / `fx-screen-shake` keyframes. |

**Campaign is NOT on the kit.** Its battle FX stays inline in `app/campaign/page.tsx`
(per the extraction brief: additive only — the proven mode was not touched). The kit is
the source of truth for every *other* mode; don't refactor Campaign onto it without a
playtest. The CSS keyframes are shared already, so visual language stays consistent.

## API

```tsx
import { useJuice, atEvent, TimerBar, StreakFlame, buzz, timerTone } from '@/components/juice';

const juice = useJuice();

// 1) Render the overlay ONCE per page — OUTSIDE any element that receives
//    juice.shakeClass (position:fixed breaks inside a transformed ancestor).
return (
  <Shell>
    {juice.overlay}
    <div className={juice.shakeClass}>…game UI…</div>
  </Shell>
);

// 2) Anchor FX to the tapped element by capturing pointer coords on a wrapper:
<div onPointerDownCapture={(e) => { lastTap.current = atEvent(e); }}>…tiles…</div>

// 3) Fire moments:
juice.correct('+142', lastTap.current);   // gold particle burst + rising float + light buzz
juice.wrong('✗', lastTap.current);        // red full-screen flash + screen shake + red float + buzz
juice.flash('blue');                      // one-off flash: 'gold'|'red'|'blue'|'green'
juice.float('🛡️ SAVED', { tone: 'blue', big: true });
juice.burst({ tone: 'green', at: { x: 50, y: 40 } }); // at = viewport %
juice.shake();
juice.buzz([60, 40, 120]);                // navigator.vibrate passthrough
```

### Standalone visuals

```tsx
// Timer-urgency bar: green → gold → red (Campaign palette), number thumps ≤25%.
<TimerBar secondsLeft={tLeft} totalSeconds={perQSeconds} trackClass="bg-black/30" />
// trackClass: 'bg-parchment-deep' (light pages, default) or 'bg-black/30' (dark arenas).

// Streak flame pill — hidden under 2; escalates: 2–4 static, 5–7 flicker, 8+ inferno+glow.
<StreakFlame combo={combo} label="streak" />
```

`timerTone(frac)` exposes the colour ramp for custom timer UIs.

## Design notes

- **Positioning** is viewport-% (`JuiceAt = {x, y}`), so FX work on any layout. `atEvent(e)`
  converts a pointer event; omit `at` and FX default to centre-screen.
- **Reduced motion**: every animation class is in the `prefers-reduced-motion` block in
  `globals.css` — the kit degrades to no-animation automatically.
- **Cleanup** is timeout-based (floats 950ms, particles 700ms, flash 520ms, shake 480ms),
  matching Campaign's timings.
- Particle vectors are computed in JS (`--dx`/`--dy` custom props), no CSS trig needed.

## Where it's wired (2026-07-04)

- **Quick Game `/play`**: burst + `+1 · xN` float on correct (tile-anchored), red flash on
  wrong, `StreakFlame` replaces the old static combo badge. (No timer in Quick Game yet, so
  no `TimerBar` — add it if P2-1's 60s timer ever lands.)
- **Knockout `/knockout`**: `TimerBar` (replaces ad-hoc gold bar), `+points` burst/float on
  correct, red flash+shake on wrong, blue `🛡️ SAVED` when a shield absorbs, `💀 OUT`
  flash+shake+float the moment you're eliminated, survival `StreakFlame` in the header.
- **Everywhere already**: `AnswerTile` keeps its built-in wrong-answer shake (predates the kit).

Still to wire: Heist, Duel, Live Class (host/join), Match — see the per-mode plans in
[`games-to-gimkit-plan.md`](./games-to-gimkit-plan.md).

## Gotchas

- **Overlay vs shake**: if the overlay is rendered inside the shaken container, floats/flash
  jump with the shake (fixed-position containing block). Keep `{juice.overlay}` a sibling.
- **Knockout 2-player edge**: elimination of the second-last player finishes the game
  instantly, so the eliminated player goes straight to the podium — the 💀 OUT flash renders
  only in the active (spectate) view. With ≥3 players it shows as designed.
- **Dev-server CSS cache**: Turbopack once served stale CSS missing new `globals.css` rules
  (classes computed `position: static`). If new fx classes don't apply in dev, `rm -rf .next/dev`
  and restart. Production builds were never affected.
