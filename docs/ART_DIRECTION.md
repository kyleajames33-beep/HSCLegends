# HSC Legends art direction brief

**For:** whoever generates or integrates art (Codex with its image tool, or a human artist).
**Status:** Draft. The style is not locked until the owner picks from the Phase 1 test sheet.

## Why the current art reads as amateur

Image quality alone is not the problem. The causes are:

1. **No locked style.** Every asset in `docs/ART_ASSETS.md` was generated from its own prompt ("stylised 3D game art", a different subject each time). Nothing ties them together, so the pieces drift.
2. **Emoji stand in for art.** There are about 380 emoji in TSX, and 28 of the 39 legend cards are emoji.
3. **Bosses are placeholders.** Five of the six subject bosses are 96×128 sprites that blur when scaled up. Three of them are byte-identical to player fighter sprites.
4. **There are three palettes.** Dark navy and lime on the hub, cream parchment on the study pages, violet on black in Solo Arena. In total there are 239 distinct hex values.

Generating more images will not fix items 2 and 4; those are code work (see "UI work" below). This brief is about making every generated image look like it belongs to one game.

## Phase 1: style lock (do this first and generate nothing else until it is done)

Generate the **same three test subjects** in each of the two candidate styles, then put them on one contact sheet at `art/style-test/contact-sheet.png`:

- Test subjects: (a) the Chemistry mascot, (b) a coin/"Spark" currency icon, (c) a small game-card scene.

| | Style A: flat sticker (recommended) | Style B: polished 3D toy |
|---|---|---|
| Look | Bold flat colour, thick dark outline (about 6% of the sprite width), one cel-shade tone, chunky rounded shapes, big expressive eyes | Soft vinyl-toy 3D render, rim light, simple materials |
| Why choose it | Stays consistent across dozens of generations. Readable at 48px on a phone. Small files. Matches the chunky Kahoot-style answer tiles. | Closer to the existing scene art, so less of it needs replacing |
| Risk | All existing scene art would need replacing | Drifts between generations, muddy at small sizes, larger files |

The owner picks a style. Record the choice and the exact style prompt at the bottom of this file. Every later prompt must start with that style block.

Characters must be **original**. Do not imitate Blooket "Blooks", Gimkit, Kahoot, Pokémon or any existing franchise's characters or look.

## Palette (one palette for the whole app)

Dark base, saturated accents. These become the CSS tokens that replace the parchment set and the stray hex values.

| Token | Hex | Use |
|---|---|---|
| `bg` | `#12142B` | App background |
| `surface` | `#1D2045` | Cards, panels |
| `surface-2` | `#2A2E5E` | Raised cards, inputs |
| `outline` | `#0B0C1C` | Art outlines, button "pressed" shadow |
| `text` | `#F5F3FF` | Primary text |
| `text-dim` | `#A9A8D0` | Secondary text |
| `brand` | `#7C5CFF` | Primary actions, logo |
| `answer-a` | `#FF4F6D` | Answer tile A (triangle) |
| `answer-b` | `#3D8BFF` | Answer tile B (diamond) |
| `answer-c` | `#FFC233` | Answer tile C (circle; dark text) |
| `answer-d` | `#22C27A` | Answer tile D (square) |
| `correct` / `wrong` | `#22C27A` / `#FF4F6D` | Reveal states, always with an icon as well, never colour alone |
| `spark` | `#FFC233` | Currency, rewards |

Subject colours, used for mascots and subject cards:

| Subject | Hex |
|---|---|
| Biology | `#22C27A` |
| Chemistry | `#FF7A3D` |
| Physics | `#3D8BFF` |
| Maths Standard | `#FFC233` |
| Maths Advanced | `#B45CFF` |
| Maths Extension 1 | `#FF4F9A` |

Art should use these hues so that generated images and the UI match. Check that text contrast meets WCAG AA (4.5:1) when the tokens are implemented.

## Asset list, in priority order

1. **Six subject mascots** (one per subject; the boss and buddy for that subject). Poses: `idle`, `happy`, `hurt`, `defeated`. These replace the duplicated and low-resolution sprites in `public/bosses/*`.
2. **Logo and app icon.** A wordmark plus an icon readable at 32px. Replace the lucide Sparkles placeholder in `components/arcade-header.tsx`, the 593-byte `public/icon-192.png`, and the Next template SVGs in `public/`.
3. **Game icon set.** About 24 icons in the same style: Spark coin, gem, heart, shield, scan, timer, streak flame, trophy, crown, lock, star, plus one per game mode. These replace emoji in the UI.
4. **Key art for three game cards:** Classroom Live, Lab Rush, Knockout Solo. Use 16:9 crops with the subject on one side, leaving clear space for overlaid text.
5. **About 30 collectible legend cards.** Variants of the mascots plus new creatures (for example element critters or "unit" creatures for Physics), each with a rarity frame. These replace the emoji and DiceBear cards in `supabase/migrations/20260613_legend_cards.sql`.
6. **Player avatars.** A parts-based set (bodies × colours × accessories) in the same style, to replace DiceBear later. This is the lowest priority.

## Technical specs

- Masters go in `art/masters/<group>/<name>.png`: transparent PNG at 1024px or larger, with no text, letters, numbers or logos inside the image.
- Delivered files go in `public/art/<group>/<name>.webp`, sized for display at 2× (for example, a 128px sprite ships at 256px). Keep each file under 60 KB where possible.
- Name files in kebab-case, with the subject and pose in the name, for example `chemistry-mascot-happy.webp`.
- Record each asset in `docs/ART_ASSETS.md`: the prompt, the tool and model if known, the date, and the master path.
- Art must never stand in for scientific diagrams. Teaching content stays code-rendered or subject-reviewed.

## Prompt template

```
[LOCKED STYLE BLOCK]
Subject: <one sentence>. Pose/expression: <...>. Palette: <subject hex + outline #0B0C1C>.
Composition: centered, full body, transparent background, generous padding.
Exclude: text, letters, numbers, logos, watermarks, realistic humans, gradients
in the background, existing franchise characters.
```

For consistency:

- Generate each mascot's `idle` pose first.
- Pass that image as a reference when generating the other poses.
- Reject any output that changes the outline weight, eye style or proportions.
- Review each new batch next to the contact sheet before integrating it.

## UI work (code, not image generation)

These changes make the biggest visual difference and need no new art:

1. Implement the palette as `@theme` tokens in `app/globals.css`, and remove hard-coded hex values (start with `components/answer-tile.tsx`).
2. Choose one icon approach: the generated icon set from item 3 above, or a single icon library in the meantime. Remove emoji from UI chrome.
3. Pick one body text size scale. No text smaller than 12px.
4. Apply the answer tiles' chunky pressed-button style to every primary button and card.
5. Replace the decorative gradient and glow layers with flat surfaces and outlines.

## Locked style

_Not chosen yet. When the owner picks, paste the exact style prompt block here._
