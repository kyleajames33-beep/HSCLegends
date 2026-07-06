# Visual Enhancement Progress

**Date:** 2026-07-06  
**Status:** Phase 1 & 2 Components Complete, Integration in Progress

---

## ✅ COMPLETED

### Phase 1: Heist Vault Enhancement
- **Component Created:** `components/heist-vault.tsx` (VaultBoard)
- **Features Implemented:**
  - Stone texture overlay (procedural pattern)
  - Enhanced room visualization with ambient lighting
  - Vault door frame with reinforced corners
  - Improved laser animations with glow filter
  - Better gold pad visualization (glow + shine)
  - Raider character position tracking with halos
  - Team-colored vault backgrounds (Crimson red, Violet purple)
  - Grab progress ring visualization
  - Detection halo during spotlight

- **Code Changes:**
  - Updated `app/heist/page.tsx` to import VaultBoard
  - Replaced old BoardSvg component with VaultBoard in RaidGame
  - Replaced old BoardSvg component with VaultBoard in DefenseBoard
  - Removed obsolete BoardSvg function

**Visual Impact:** Vault now feels like an actual chamber with atmosphere, not a debug grid.

---

### Phase 2: Gamble UI Components
- **Component Created:** `components/gamble-ui.tsx` with 3 sub-components:
  - **PartnerCard:** Shows opponent name, betrayal history with warning levels (danger/caution/neutral)
  - **PotDisplay:** Visualizes the points at stake with coin emoji
  - **DecisionButton:** SHARE/STEAL buttons with:
    - Timeout progress bar (depletes as decision window closes)
    - Glow effect when selected
    - Locked-in state visual feedback
  - **RevealCard:** Animated reveal with:
    - Flip animation (cards appear with staggered timing)
    - Outcome visualization (both choices visible simultaneously)
    - Points breakdown with color coding (green = gain, red = loss)

**Next Step:** Integrate these components into `app/gamble/page.tsx`

---

## 🔧 IN PROGRESS / PENDING INTEGRATION

### Gamble Page Integration
Need to update `app/gamble/page.tsx` to use the new components:
1. Import PartnerCard, PotDisplay, DecisionButton, RevealCard
2. Replace button elements in decision phase with DecisionButton
3. Replace reveal display with RevealCard
4. Add PartnerCard to decision pane
5. Add PotDisplay for pot visualization

---

## 📋 STILL AHEAD

### Phase 3: Other Mode Polish (2–3 hours)
- **Campaign:** Improve sentry placement visuals, better arena feel
- **Knockout/Duel:** Add arena backgrounds
- **Type:** Quiz display polish
- **All modes:** Ensure button state feedback, hover effects, smooth transitions

### Quality Assurance
- [ ] Heist: Test vault visuals in two-browser playtest
- [ ] Gamble: Verify reveal animations work smoothly
- [ ] All modes: Check for jank, regressions, performance
- [ ] Responsive: Verify on tablet/mobile viewports

---

## Key Decisions Made

1. **Heist Vault Aesthetic:** Stone chambers with team-colored lighting
   - Reason: Feels like an actual vault, matches toon game style
   - Alternative rejected: Photorealistic graphics (too detailed for toon sprites)

2. **Gamble Decision UI:** Color-coded emotional feedback
   - Reason: Red/green/amber create instant threat assessment
   - Timeout bar depletes left-to-right: intuitive time pressure

3. **Reveal Animation:** Flip cards with staggered timing
   - Reason: Satisfying, simultaneous (both visible at once), not too slow
   - Timing: 300ms stagger ensures smooth readability

---

## Next Actions

1. **Integrate Gamble UI** (~30 min)
   - Import new components into gamble/page.tsx
   - Wire them to existing state

2. **Test Both New Modes** (~20 min)
   - Boot dev server
   - Play 1 Heist round (check vault feels right)
   - Play 1 Gamble round (check decision/reveal feels good)

3. **Polish Pass on Other Modes** (~1–2 hours)
   - Add backgrounds to Knockout/Duel
   - Improve button states across all modes
   - Verify no regressions

4. **Final QA** (~30 min)
   - Performance check (no jank)
   - Responsive check
   - Verify tests still pass

---

## Estimated Total Time
- Heist vault: ✅ 1 hour (done)
- Gamble components: ✅ 45 min (done)
- Gamble integration: 30 min (next)
- Testing: 20 min
- Other mode polish: 1–2 hours
- **Total: ~4 hours remaining**
