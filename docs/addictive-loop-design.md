# HSC Legends — Addictive Loop & Meta-Game Design (PROPOSAL)

Status: **draft for Kyle to approve / edit.** Nothing here is built yet. Written by Claude
during an autonomous session (2026-06-14). North star: *make studying as addictive as a game.*

Each section ends with **DECISIONS NEEDED** — the calls only you can make.

---

## 1. The three currencies (get this straight first)

Addictive games separate "what you earn right now" from "what you keep". Proposed model:

| Layer | Name | Earned by | Spent on | Persists? |
|---|---|---|---|---|
| Session resource | **Energy** | answering questions in a mode | the mode's action (steal, attack, build) | No — per session |
| Soft currency | **Sparks** (exists) | finishing rounds | cosmetics, power-ups, base upgrades | Yes |
| Progression | **XP / League** (exists) | correct answers over time | status, divisions, unlocks | Yes |

Key idea (the Gimkit/Blooket move): **the question screen is the "engine," not the game.**
You answer a burst of questions → bank **Energy** → spend it in the actual game. Right now most
modes answer-then-effect inline; the proposal makes "earn phase → spend phase" explicit and
consistent so it *feels* like playing a game powered by studying.

**DECISIONS NEEDED:**
- Introduce a distinct "Energy" resource, or just reuse Sparks as the in-mode spend resource?
- One shared Energy across modes, or per-mode resources (heist gold, boss attacks, etc.)?

---

## 2. Energy → existing modes (the chosen direction)

How each existing mode becomes an "earn → spend" loop:

- **Heist** (closest already): answer questions → bank gold (Energy) → on your turn, *spend* to
  Steal from the other team or Defend your vault. Make the spend choice explicit, not automatic.
- **Boss / Campaign**: answer questions → bank Attacks → choose how to spend (big hit vs. multi
  small hits vs. shield). Turns "1 correct = 1 damage" into a tiny tactical choice.
- **Knockout**: survival is the spend — correct answers buy you "lives"/safety into the next round.
- **Duel**: a pure race; Energy fits least. Leave as head-to-head, OR add post-round Energy that
  buys a one-time advantage (steal time, double next).
- **Match**: keep as a speed minigame; correct pairs = Energy toward a session goal.

The unifying screen pattern (already half-built via our fullscreen work): a **temporary question
screen** that visibly fills an Energy meter, then a **mode screen** where you spend it.

**DECISIONS NEEDED:**
- Which modes get the explicit spend phase first? (Recommend: Heist + Boss — least work, most payoff.)
- Is the spend a real *choice* (tactical) or just auto-applied? (Choice = more game-like.)

---

## 3. The long-term hook (optional CoC-lite layer)

This is the "why come back for months" layer. Only build after the core loop is proven. Maps onto
pieces that ALREADY exist:

| Clash-of-Clans concept | HSC Legends piece |
|---|---|
| Base/HQ you upgrade | NEW: a personal "Study HQ" |
| Gold/Elixir | Sparks (exists) |
| Build/upgrade timers (daily pull) | NEW: upgrades that finish over real hours |
| Troops/cards | Collection / Legend cards (exists) |
| Clans | Classes (exists) |
| Clan wars | League / Weekly Boss (exists) |
| Raids | NEW: async "answer to attack a classmate's HQ" |

Minimum lovable version: a single upgradeable HQ where studying earns Sparks, Sparks buy upgrades,
upgrades unlock perks (more Energy, better rewards). Defer raids/wars to v2.

**DECISIONS NEEDED:**
- Build this at all, or is the league/streak/collection loop enough long-term hook?
- If yes — scope: HQ-only MVP first, or include async raids?

---

## 4. Juice plan (micro-feedback — needs your taste, then I build)

Specific moments that should "pop" but currently don't. Each is small and self-contained:

1. **Correct answer**: tile bounce + spark burst + rising "+10" (currently just colour change).
2. **XP / Sparks on results**: count-up animation instead of static number.
3. **Streak**: flame scale-pop + "🔥 N!" when it increments (loss-aversion is the strongest hook).
4. **Boss hit**: damage number flies off the boss + HP bar shake (we just added the text line —
   make it kinetic).
5. **League up / rank change**: full-screen celebration (you already have CelebrateLottie).
6. **Near-miss nudge**: "You're #4 — 15 XP from #3" on the results/leaderboard (social pressure).

**DECISIONS NEEDED:**
- Approve the list / cut any. Then I can implement them behind the existing `md:` + Lottie setup.
- Confirm: subtle (Duolingo) vs. loud (Blooket) juice intensity?

---

## Decisions locked (2026-06-14)
- **Engagement problem:** all of retention/depth/appeal + **ease-of-study is the wedge** — a
  60-second quiz beats a long session. Everything must protect that frictionlessness.
- **Audience:** unknown → build **audience-agnostic** first. Solo HQ = yes. **Async raids /
  clan-wars deferred** until we know if persistent cohorts exist. Live multiplayer = *verify it
  works* (cheap), don't over-invest in class-vs-class yet.
- **Juice:** approved, intensity = **Duolingo-subtle**. First slice shipped (results count-up + pop).

## Parked (do NOT pivot toward)
- **OpenArt "World creator"** (explorable 3D scenes). Cool, but it's a hosted experience, not
  embeddable game tech, and a heavy 3D world fights the ease-of-study wedge. Use ONLY as a
  trailer / backdrop asset tool later — never as a game mode.

## Recommended build order (once you've decided)
1. Prove the live multiplayer works (see NEEDS-HUMAN-TESTING.md) — nothing else matters if it breaks.
2. Juice pass on the existing loop (cheap, huge perceived-quality lift).
3. Explicit earn→spend phase for **Heist + Boss** (the core meta-game taste).
4. *Then* evaluate the CoC-lite HQ layer.
