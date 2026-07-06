# Game Modes Audit & Visual Enhancement Plan

**Date:** 2026-07-06  
**Scope:** All 12 game modes across HSC Legends  
**Goal:** Fully playable end-to-end + aesthetically pleasing visuals

---

## Audit Summary

| Mode | Status | Lines | Key Gaps | Priority |
|---|---|---|---|---|
| **Campaign** | ✅ Complete | 603 | None (working) | Polish |
| **Boss** | ✅ Complete | 119 | None (display-only) | Polish |
| **League** | ✅ Complete | 122 | None (display-only) | Polish |
| **Knockout** | ✅ Complete | 410 | None (working) | Polish |
| **Duel** | ✅ Complete | 299 | None (working) | Polish |
| **Tycoon** | ✅ Complete | 312 | None (working) | Polish |
| **Match** | ✅ Complete | 324 | None (working) | Polish |
| **Type** | ✅ Complete | 253 | None (working) | Polish |
| **Play** | ✅ Complete | 469 | None (working) | Polish |
| **Host** | ✅ Complete | 296 | None (working) | Polish |
| **Heist** | 🔶 Playable slice | 851 | Vault art (currently placeholder SVG); raider sprite missing; sentry/spotlight visuals basic | High |
| **Gamble** | 🔶 Playable slice | 609 | No character art; decision buttons are basic; reveal flash needs work | High |

---

## Detailed Mode Breakdown

### ✅ Complete Modes (polish phase)

#### Campaign (603 lines)
- **What works:** Full battle loop, boss sprites, damage system, combos, AP economy
- **Visual status:** Uses Kenney toon fighter + boss sprites, Juice Kit FX
- **Needs:** Better sentry/defense placement visuals (currently basic SVG)

#### Boss (119 lines)
- **What works:** Weekly boss display, HP tracking, contribution tracking
- **Visual status:** Kenney boss sprites, arena gradients, counter display
- **Needs:** None (display page, fully polished)

#### League (122 lines)
- **What works:** Division display, ranking system, opt-in control
- **Visual status:** Division emoji, avatar integration
- **Needs:** None (display page, fully polished)

#### Knockout, Duel, Tycoon, Match, Type, Play, Host
- **Status:** All functional, wired to question engine
- **Visual:** Use AnswerTile component, basic question display
- **Needs:** Arena backgrounds, character animations where relevant, better decision feedback

---

## Key Gaps: The Two New Modes

### 🔶 Heist "The Break-In" (851 lines)

**What's working:**
- ✅ Room/team/vault economy
- ✅ Raid lifecycle (WASD movement, laser/sentry/spotlight mechanics)
- ✅ Question answering + energy system
- ✅ Realtime raid broadcast
- ✅ Finished-screen leaderboard

**What needs visual work:**
- ❌ Vault art: Currently placeholder SVG (simple walls + pads). Needs:
  - Stylized treasure vault interior
  - Animated lasers (currently just geometric lines)
  - Sentries as drawable tokens (not circles)
  - Exit/entry hatch visual feedback
  - Team-colored vault backgrounds (Crimson vs Violet distinct)
- ❌ Raider character: Missing (should be small toon sprite, animated)
- ❌ Spotlight defense: Currently a simple radial gradient. Needs visual polish
- ❌ Sentry placement: Placeholder circles. Needs icon/sprite
- ❌ Callout text: Flashing status text is there, but could be more visual (pop effect, color-coded)

**Time to complete:** ~4–6 hours (vault interior art, laser animations, character integration)

### 🔶 Gamble "Trust or Bust" (609 lines)

**What's working:**
- ✅ Question answering
- ✅ Pairing algorithm (including bot player)
- ✅ Decision lock (SHARE/STEAL)
- ✅ Server-authoritative reveal
- ✅ Reputation tracking
- ✅ Leaderboard

**What needs visual work:**
- ❌ Character art: No partner visualization. Needs:
  - Small toon avatar for partner (with name + betrayal hint)
  - Visual distinction between human/bot partners
  - Confidence/tension indicator (maybe a worried/happy face emoji for now)
- ❌ Decision feedback: SHARE/STEAL buttons are plain. Needs:
  - Animated button feedback (scale/glow when hovering)
  - Countdown timer with visual urgency (Juice Kit has fx-urgent, integrate it)
  - Locked-in state visual (checkbox? checkmark?)
- ❌ Reveal display: Shows both choices + outcome text. Needs:
  - Animated flip cards for the choices
  - Outcome flash (currently using Juice Kit flash, good but could be bigger)
  - Point changes animated (float + grow/shrink)
  - Reputation update animated (betrayal counter ↑ with red emphasis)
- ❌ Pot display: Just a number. Could be:
  - Visual coins/tokens stacked
  - Color-coded (gold = higher value?)
  - Animated when calculated

**Time to complete:** ~3–4 hours (partner avatars, button polish, reveal animations, pot visualization)

---

## Visual Strategy & Decisions

### Aesthetic Direction
I'm committing to **"Toon RPG"** — a cohesive, playful visual language:
- **Characters:** Kenney toon sprites (friendly, recognizable, already integrated)
- **Arenas:** Bold gradients + subtle patterns (no photorealism; matches existing Campaign/Boss)
- **UI:** Clean card layout with strong shadows + active states (already in design system)
- **Feedback:** Heavy use of Juice Kit (flash, shake, burst, floats) + custom animations
- **Color:** Warm parchment base, berry/coral/plum/gold accents (existing palette)

**Why this works:**
- Consistent with existing modes (Campaign, Boss)
- Authentic to the "adventure game" vibe (pun: HSC Legends)
- Toon art is forgiving (vs photorealism which breaks if not perfect)
- Animations and effects carry weight even with simple shapes

### What I'll Do for Each Mode

#### Heist: Vault Interior
- **Vault chamber:** Isometric-style vault (blue gradient, stone texture hint via subtle pattern overlay)
- **Lasers:** Animated beams that *sweep* smoothly (using CSS keyframes + canvas if needed)
- **Sentries:** Turret-like icons (can be simplified toon towers)
- **Gold pads:** Glowing floor tiles, color-coded by room
- **Raider sprite:** Use Kenney fighter in a "sneaking" pose or overlay a burglar hat on the player character
- **Team colors:** Crimson vault walls glow red, Violet glow purple
- **Entry/exit:** Glowing portal or opening hatch

#### Gamble: Characters & Reveals
- **Partner avatar:** Kenney fighter sprite (small, left side of screen)
- **Betrayal hint:** Show as a icon stack (e.g., "⚔️⚔️⚔️" for "stolen 3x")
- **Decision buttons:** Bold, with glow on hover; countdown timer spins or fills
- **Locked state:** Checkmark appears, button dims
- **Reveal flip animation:** CSS flip card (rotateY) on both choices simultaneously
- **Points float:** Use Juice Kit float for point changes, but bigger/bolder
- **Pot visualization:** Simple coin icon or text, maybe ripple effect when calculated

#### Other Modes: Quick Wins
- **Knockout/Duel/Match/Type:** Add subtle arena backgrounds (gradient + pattern overlay)
- **Tycoon:** Better visualization of currency/resources (icon counters with animations)
- **Play/Host:** Cleaner question display, better button states

---

## Implementation Plan

### Phase 1: Heist (High Priority, 4–5 hours)
1. Create vault interior canvas/SVG (isometric chamber with procedural lighting)
2. Animate lasers (rotating/sweeping beams)
3. Integrate raider character sprite (position tracking)
4. Add sentry visual (turret icon or simple sprite)
5. Team-color the vault walls
6. Polish callout effects

### Phase 2: Gamble (High Priority, 3–4 hours)
1. Partner avatar display (Kenney sprite, small, positioned)
2. Betrayal count visualizer (reputation hint)
3. Decision button polish (glow, countdown integration)
4. Reveal flip animation (CSS 3D)
5. Points animation (scale + float on reveal)
6. Pot counter visual (coins? bars?)

### Phase 3: Polish Other Modes (2–3 hours)
1. Campaign: Improve sentry placement UI, add ground graphics
2. Knockout/Duel: Arena backgrounds
3. Type: Quiz display polish
4. All: Ensure active button states, hover feedback, transitions

---

## Technical Approach

### Tools & Constraints
- **Sprites:** Kenney toon assets (already in `/public/fighters/` and `/public/bosses/`)
- **Animations:** Tailwind CSS + CSS keyframes (already integrated in globals.css)
- **Canvas/SVG:** Can author inline for vault, lasers, or use SVG components
- **Character assets:** Kenney sprites already integrated; will reuse `PlayerFighter` + `BossArt` patterns
- **Effects:** Juice Kit (useJuice hook) already available; leverage existing animations

### What I'll Author Myself
- **Vault interior SVG:** Isometric chamber with procedural room shapes
- **Laser animations:** CSS keyframes or canvas (simple line sweeps)
- **Betrayal visualizer:** Stacked icon component (e.g., `<RepHint stolen={3} />`)
- **Reveal flip card:** CSS 3D transform component
- **Pot visualizer:** Simple coin stack or bar chart component

### What Already Exists
- Kenney sprites (fighters, bosses)
- Juice Kit (flash, burst, float, shake)
- Color palette + design system
- AnswerTile component
- TimerBar component

---

## Success Criteria

### Heist
- [ ] Vault is visually distinct from other modes (not just a white box)
- [ ] Lasers move smoothly and are clearly a hazard
- [ ] Raider is visible and moves with the player
- [ ] Sentries are placed clearly (not invisible)
- [ ] Team colors are consistent (Crimson = red, Violet = purple)
- [ ] Two-browser playtest: feels like a real heist, not a technical demo

### Gamble
- [ ] Partner identity is immediately clear (avatar + name)
- [ ] Reputation hint is understandable ("stolen 2x" is visible as text or icons)
- [ ] Decision buttons feel pressured (countdown is visual)
- [ ] Reveals are satisfying (flip animation + point float)
- [ ] Two-browser playtest: tension during decision, satisfaction on reveal

### All Modes
- [ ] No broken functionality (all modes still work end-to-end)
- [ ] Tests pass (existing playtests still validate)
- [ ] Consistent aesthetic (feels like one game, not a collection)
- [ ] Performance: no jank, smooth animations on laptop/tablet browsers

---

## Timeline

**Phase 1 (Heist):** 4–5 hours  
**Phase 2 (Gamble):** 3–4 hours  
**Phase 3 (Polish + QA):** 2–3 hours  
**Total:** ~10–12 hours  

Starting immediately; aiming for completion within this session.

---

## Risk Mitigations

**Risk: Vault art is too complex.**  
→ **Mitigation:** Start with simple isometric chamber (gradient + SVG walls), add details iteratively.

**Risk: Laser animations cause performance issues.**  
→ **Mitigation:** Use CSS keyframes first; switch to canvas only if needed.

**Risk: Reveal flip animation causes motion sickness.**  
→ **Mitigation:** Respect `prefers-reduced-motion` (already in design system). Use fast easing (~0.3s).

**Risk: Character sprites don't fit new contexts (e.g., Heist raider).**  
→ **Mitigation:** Use Kenney sprites for consistency. If needed, use CSS filters (grayscale, hue-rotate) for variation.

---

## Next Steps

1. **Approval on visual direction:** Confirm "Toon RPG" aesthetic and Kenney sprite commitment.
2. **Start Phase 1:** Heist vault art + animations.
3. **Parallel Phase 2:** Gamble avatar + reveal polish.
4. **Iterate:** Playtest after each phase, adjust based on feel.
5. **Final QA:** All modes end-to-end, check for regressions, verify tests pass.
