# HSC Legends art direction brief

**For:** whoever generates or integrates art (Codex with its image tool, or a human artist).
**Status:** Draft. The style is not locked until the owner picks from the Phase 1 test sheet.

## Audience: read this first

The players are **HSC students aged 16 to 18**. The art must look like something a Year 12 student would happily have on screen in front of their friends. Aim for the visual maturity of teen and young-adult games such as Valorant, Overwatch, Hades, Rocket League and Apex, not Blooket, Kahoot or Pokémon.

**Rejected round 1 (do not repeat):** a cute orange cauldron mascot with big round eyes, an open smiling mouth, stubby arms and flask and molecule stickers on its belly. It was well drawn but looked like a children's app.

Never use:

- Kawaii or chibi proportions: big heads, huge eyes, tiny limbs.
- Smiling-object mascots (a happy beaker, a cauldron with a face).
- Rounded "toy" shapes, pastel candy colours, stickers or sparkles on everything.
- Primary-school science clichés as decoration (a flask on a belly, atom-symbol badges).

Aim for:

- Confident silhouettes and angular shapes.
- Attitude: characters look focused, determined or menacing, never cheerful.
- Restrained colour: a dark base with one or two strong accents.
- Science treated as cool, powerful tech or forces (plasma, crystal lattices, magnetic fields, DNA helices), not as cartoon props.

## Why the current art reads as amateur

Image quality alone is not the problem. The causes are:

1. **No locked style.** Every asset in `docs/ART_ASSETS.md` came from its own one-off prompt, so the pieces drift.
2. **Emoji stand in for art.** There are about 380 emoji in TSX, and 28 of the 39 legend cards are emoji.
3. **Bosses are placeholders.** Five of the six subject bosses are 96×128 sprites. Three of them are byte-identical to player fighter sprites.
4. **There are three palettes.** In total there are 239 distinct hex values.

Items 2 and 4 are code work (see "UI work" below). This brief is about making every generated image look like it belongs to one game.

## Phase 1: style lock (do this first and generate nothing else until it is done)

Make one comparison sheet, `art/style-test/contact-sheet.png`. It has one row per style and three columns:

1. **The Chemistry boss:** a reactor or plasma entity, full body, menacing.
2. **The Spark currency icon.**
3. **A Lab Rush game-card scene** (16:9).

| | Style 1: stylised hero (recommended) | Style 2: graphic emblem | Style 3: dark painterly |
|---|---|---|---|
| Look | Cel-shaded characters with sharp silhouettes and realistic adult or late-teen proportions, like Valorant or Overwatch splash art | Flat geometric vector art, like esports team logos or sci-fi HUD insignia; creatures built from clean shapes; neon on dark | Hand-painted look with dramatic lighting and rich texture, like Hades or Slay the Spire |
| Strength | Feels like a "real game" to teenagers; heroes and bosses carry the brand | Easiest to keep consistent; scales from 24px icons up to posters; most mature | Most striking boss art |
| Risk | Harder to keep consistent; needs reference images for every new pose | Can feel cold without characters | Busy at small sizes; weak for icons |

The owner picks a style. Styles can be mixed only in one way: Style 2 for icons and UI combined with Style 1 or 3 for bosses and key art. Record the choice and the exact style prompt in the "Locked style" section at the bottom of this file. Every later prompt must start with that style block.

All work must be **original**. Do not imitate the characters, logos or signature look of Valorant, Overwatch, Hades, Blooket, Gimkit, Kahoot or any other franchise. Those games are references for maturity level only.

## Palette (one palette for the whole app)

Dark base with saturated but controlled accents. These become the CSS tokens.

| Token | Hex | Use |
|---|---|---|
| `bg` | `#0E1020` | App background |
| `surface` | `#171A31` | Cards, panels |
| `surface-2` | `#22264A` | Raised cards, inputs |
| `outline` | `#07080F` | Art outlines, pressed-button shadow |
| `text` | `#F2F2FA` | Primary text |
| `text-dim` | `#9A9CC0` | Secondary text |
| `brand` | `#6E5BFF` | Primary actions, logo |
| `answer-a` | `#E8445F` | Answer tile A (triangle) |
| `answer-b` | `#2F7BEA` | Answer tile B (diamond) |
| `answer-c` | `#F2B530` | Answer tile C (circle; dark text) |
| `answer-d` | `#1FB070` | Answer tile D (square) |
| `correct` / `wrong` | `#1FB070` / `#E8445F` | Reveal states, always with an icon as well, never colour alone |
| `spark` | `#F2B530` | Currency, rewards |

Subject accent colours (one accent per subject; keep art mostly dark or neutral):

| Subject | Hex |
|---|---|
| Biology | `#1FB070` |
| Chemistry | `#FF6A2B` |
| Physics | `#2F7BEA` |
| Maths Standard | `#F2B530` |
| Maths Advanced | `#9B5CFF` |
| Maths Extension 1 | `#E8447F` |

Check that text contrast meets WCAG AA (4.5:1) when the tokens are implemented.

## Asset list, in priority order

1. **Six subject bosses**, one per subject, as embodiments of that subject's forces: for example, a living plasma reactor for Chemistry, a mutating organism for Biology, an electromagnetic titan for Physics, a geometric or fractal construct for Maths. Poses: `idle`, `attack`, `hurt`, `defeated`. These replace the duplicated and low-resolution sprites in `public/bosses/*`.
2. **Logo and app icon.** A sharp wordmark plus an emblem readable at 32px. Replace the lucide Sparkles placeholder in `components/arcade-header.tsx`, the 593-byte `public/icon-192.png`, and the Next template SVGs in `public/`.
3. **Game icon set** in the same style, about 24 icons: Spark, gem, heart, shield, scan, timer, streak flame, trophy, crown, lock, star, plus one per game mode. These replace emoji in the UI.
4. **Key art for three game cards:** Classroom Live, Lab Rush, Knockout Solo. Use 16:9 crops, with clear space for overlaid text.
5. **About 30 collectible legend cards,** with a rarity frame. Use boss variants plus "operatives" (playable hero characters of late-teen or young-adult age, diverse, in lab or field gear).
6. **Player avatars.** A parts-based operative set to replace DiceBear later. Lowest priority.

## Technical specs

- Masters go in `art/masters/<group>/<name>.png`: transparent PNG at 1024px or larger, with no text, letters, numbers or logos inside the image.
- Delivered files go in `public/art/<group>/<name>.webp`, at 2× display size. Keep each file under 60 KB where possible.
- Name files in kebab-case, with the subject and pose in the name, for example `chemistry-boss-attack.webp`.
- Record each asset in `docs/ART_ASSETS.md`: the prompt, the tool and model if known, the date, and the master path.
- Art must never stand in for scientific diagrams. Teaching content stays code-rendered or subject-reviewed.

## Prompt template

```
[LOCKED STYLE BLOCK]
Audience: 16-18 year olds; mature, not cute.
Subject: <one sentence>. Pose/expression: <focused / menacing / determined>.
Palette: dark base, accent <subject hex>.
Composition: centered, full body, transparent background, generous padding.
Exclude: text, letters, numbers, logos, watermarks, kawaii or chibi proportions,
big cartoon eyes, smiling objects, pastel colours, stickers, existing franchise
characters.
```

For consistency:

- Generate each boss's `idle` pose first.
- Pass that image as a reference when generating the other poses.
- Reject any output that changes the outline weight, proportions or rendering style.
- Review each new batch next to the contact sheet before integrating it.

## UI work (code, not image generation)

1. Implement the palette as `@theme` tokens in `app/globals.css`, and remove hard-coded hex values (start with `components/answer-tile.tsx`).
2. Remove emoji from UI chrome. Use the generated icon set, or a single icon library in the meantime.
3. Pick one type scale. No text smaller than 12px. Use tighter, more confident headings, not playful ones.
4. Give buttons and cards a crisp style: subtle pressed depth, sharp corners of 8 to 12px, no bubbly 24px or larger radii.
5. Replace decorative gradient and glow layers with flat surfaces and outlines.

## Locked style

**Chosen 16 November 2026 from `art/style-test/contact-sheet.png`.** The style is split by asset type:

- **Bosses, characters and key art: Style 1 (stylised hero).** Cel-shaded with crisp dark outlines and sharp angular silhouettes. Deep navy and charcoal forms, with one glowing subject-accent colour. Painterly texture kept light. Dramatic but readable at card size.
- **Icons, currency, UI emblems and badges: Style 2 (graphic emblem).** Flat geometric vector shapes with thick dark outlines, two or three tones, one accent colour. Hexagonal or angular frames. Must read clearly at 24px.

Style block for bosses, characters and key art:

```
Stylised hero game art for a mature teen audience (16-18). Cel-shaded, crisp dark
outlines, sharp angular silhouette, deep navy/charcoal forms with a single glowing
<SUBJECT ACCENT HEX> accent, light painterly texture, dramatic rim light, readable
at card size. Original design.
```

Style block for icons, currency and UI emblems:

```
Flat geometric vector emblem, thick #07080F outline, 2-3 flat tones, deep navy base
with a single <ACCENT HEX> accent, angular/hexagonal framing, no gradients beyond one
subtle highlight, readable at 24px. Original design.
```

### Feedback on the round 2 test (apply it to everything that follows)

- **Each boss must clearly belong to its subject.** The test boss was a generic spiky lava golem and could have come from any fantasy game. Build each boss from that subject's own ideas:
  - **Chemistry:** reaction vessels, crystal lattices, flames in element flame-test colours.
  - **Biology:** a cell or organism that mutates; membranes, helices, spores.
  - **Physics:** fields, coils, orbiting charges, a gravity well.
  - **Maths:** fractal or geometric constructs, glowing equations as abstract shapes (no readable text).
- **Do not use a lightning bolt for the Spark currency.** It reads as Physics. Use a neutral four-point spark or star crystal.
- **Vary pose and silhouette between bosses.** Not every boss should be a humanoid golem standing upright.
