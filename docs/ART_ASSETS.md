# Art asset provenance

## Game arena

- Delivered asset: `public/art/arena-hero.webp` (1440 × 810, 131,404 bytes).
- Produced with the built-in image-generation tool for this project and optimised from its generated PNG. Exact underlying image model was not exposed by the tool.
- Brief: wide, stylised science-fantasy competitive game arena in a futuristic lab; blue, purple and teal lighting; space for interface overlays; no text or branding.

## Reactor Golem

- Source asset: `prototypes/lab-tycoon/boss-rush.webp` (512 × 538, transparent).
- Produced with the built-in image-generation tool for the offline Lab Rush sample and optimised from its generated PNG. Exact underlying image model was not exposed by the tool.
- Brief: original cobalt and magenta crystal reactor golem, glowing purple core, expressive face, full body, stylised 3D game illustration on a transparent background; no text or branding.
- `scripts/build-lab-rush.mjs` embeds the sprite into `public/lab-rush.html`; regenerate the demo after editing the source asset.

These assets are visual game art. They are not scientific diagrams or evidence of content accuracy. Use code-rendered text and subject-reviewed diagrams for teaching content.

## Tycoon lab

- Source asset: `prototypes/lab-tycoon/lab-arena.webp`; app copy: `public/art/lab-arena.webp` (1280 × 720, 181,084 bytes).
- Produced with the built-in image-generation tool and optimised from its generated PNG. Exact underlying image model was not exposed by the tool.
- Brief: original futuristic research lab as a game base, glowing reactors and holograms, purple and teal with warm gold, stylised 3D game art, no text or interface.
- `scripts/build-lab-rush.mjs` embeds the sample copy into the self-contained demo. The connected Tycoon uses the public copy. Keep them identical when updating the asset.

## Science inventor and arena duel

- Delivered assets: `public/art/lab-scientist.webp` (592 × 800, 107,658 bytes, transparent) and `public/art/arena-duel.webp` (960 × 540, 81,374 bytes).
- Generated separately using the built-in image-generation tool; the tool did not expose its exact underlying model. Original PNG masters are `art/masters/lab-scientist.png` and `art/masters/arena-duel.png`. Both assets are original game illustrations, pending visual-direction review.
- Scientist prompt: a confident young adult science inventor in a futuristic teal-and-violet lab jacket, holding a glowing flask, full-body action pose, polished stylised 3D game art, transparent background, no text or logos.
- Arena prompt: two original lab experiment robots facing off in a futuristic science arena, teal and violet light with gold highlights, polished stylised 3D game art, readable at card size, no text or logos.
- The scientist decorates the home hero; the arena illustrates the explicitly unavailable Knockout card. Neither is a scientific diagram.

## Campaign boss encounter

- Delivered asset: `public/art/campaign-boss.webp` (960 × 540, 102,600 bytes); original master: `art/masters/campaign-boss.png`.
- Produced with the built-in image-generation tool, which did not expose its exact model. Brief: a young science inventor confronting a towering crystalline reactor guardian on a futuristic platform, bold silhouettes, violet, teal and gold, stylised 3D game illustration, no text or logos. Used as decorative Campaign card art and pending visual-direction review.

## Phase 1 — mature audience style comparison (2026-11-17)

Generated for HSC students aged 16–18 under the revised `docs/ART_DIRECTION.md`. These nine tests supersede the rejected cute cauldron round; earlier generated cute tests were not copied into the project or included in this sheet. No style is locked and no assets are integrated into the app.

- Tool for all nine masters: built-in `image_gen.imagegen` (`image_gen__imagegen`), text-to-image; underlying model/version not exposed by the tool.
- Generation date: **2026-11-17** (Australia/Sydney).
- Exact submitted prompts are recorded separately below. Each call requested transparent background for bosses and currency, opaque background for scenes. No input/reference images were supplied.
- Masters: `art/style-test/style-<1|2|3>-<chemistry-boss|spark-currency|lab-rush-scene>.png`. Bosses and currency: 1254 × 1254 RGBA with transparency; scenes: 1672 × 941 RGB (approximately 16:9, the tool's native output).
- Comparison: `art/style-test/contact-sheet.png` (1620 × 1640 RGB). Assembled deterministically using Python/Pillow from the nine masters; resized only in this sheet, alpha composited on `#171A31` panels over `#0E1020`. Fonts: DejaVu Sans/Bold. All style/subject labels sit outside the source images. Original masters were copied unchanged from the tool outputs.
- Review: mature angular silhouettes, restrained Chemistry orange `#FF6A2B` / Spark gold `#F2B530` accents on the brief's dark palette, no visible in-art text or branding. Designs are original concepts with no franchise references in the generation prompts. These are decorative art, not scientific diagrams. Hex values are prompt targets, not a claim of per-pixel palette quantisation.

### style-1-chemistry-boss

- Master: `art/style-test/style-1-chemistry-boss.png`.
- Tool/model: built-in `image_gen.imagegen`; underlying model not exposed.
- Date: 2026-11-17 (Australia/Sydney).
- Exact prompt:

```text
Style 1 — stylised hero. Original mature game splash illustration with precise cel shading, sharp confident silhouettes, angular planes and realistic adult anatomical proportions where humanoid. Crisp hard-edged shadow shapes, controlled highlights, restrained detail, forceful composition. No toy rendering.

Use case: stylized-concept. Asset type: Phase 1 style-test master for HSC Legends. Audience: HSC students aged 16–18; mature, confident, intense, never cute. Original design only: do not imitate any existing game's characters, logos or signature style. Exclude all text, letters, numbers, logos, watermarks and signatures. Never use kawaii or chibi proportions, huge heads, big cartoon eyes, tiny limbs, smiling objects, rounded toy shapes, pastel candy colours, stickers, decorative sparkles, atom badges or flask-body mascots. Science is powerful technology and physical forces. Decorative game art, not a scientific diagram.

Subject: one menacing living plasma reactor entity in an idle battle-ready stance, full body. Tall adult-proportioned angular dark segmented containment armour, broad shoulder fins, long powerful arms, articulated hands and firmly planted long legs. A suspended vertical orange plasma fissure replaces the sternum, smaller orange seams between armour plates, head is a narrow faceless wedge with no eyes or mouth. A few contained angular plasma fragments near the shoulders. No weapons. Mostly dark neutral mass with Chemistry #FF6A2B as the sole saturated accent. Centered front three-quarter view, complete silhouette including feet and fins, generous clear padding on a square canvas at least 1024px. Genuinely transparent background, no environment or ground shadow.

Palette: dark base #0E1020, surface #171A31, raised surface #22264A, outline #07080F, restrained neutral highlights #F2F2FA and #9A9CC0. Boss and scene accent Chemistry #FF6A2B; currency accent Spark #F2B530. Use these exact hues as base colours; lighting or cel-shade values may vary. Do not introduce additional saturated accents.
```

### style-1-spark-currency

- Master: `art/style-test/style-1-spark-currency.png`.
- Tool/model: built-in `image_gen.imagegen`; underlying model not exposed.
- Date: 2026-11-17 (Australia/Sydney).
- Exact prompt:

```text
Style 1 — stylised hero. Original mature game splash illustration with precise cel shading, sharp confident silhouettes, angular planes and realistic adult anatomical proportions where humanoid. Crisp hard-edged shadow shapes, controlled highlights, restrained detail, forceful composition. No toy rendering.

Use case: stylized-concept. Asset type: Phase 1 style-test master for HSC Legends. Audience: HSC students aged 16–18; mature, confident, intense, never cute. Original design only: do not imitate any existing game's characters, logos or signature style. Exclude all text, letters, numbers, logos, watermarks and signatures. Never use kawaii or chibi proportions, huge heads, big cartoon eyes, tiny limbs, smiling objects, rounded toy shapes, pastel candy colours, stickers, decorative sparkles, atom badges or flask-body mascots. Science is powerful technology and physical forces. Decorative game art, not a scientific diagram.

Subject: one Spark currency icon: a severe angular hexagonal dark alloy token, with one recessed broken lightning-slash energy channel in Spark gold #F2B530. Non-letter abstract mark, no currency sign or numerical value. Almost frontal, slight three-quarter angle exposing the thin lower-right edge. Restrained facets and one strong clear silhouette, readable at 24px. Gold is the sole saturated accent. Centered isolated token, generous clear padding on a square canvas at least 1024px. Genuinely transparent background, no face, no character, no orbiting stars or sparkle decorations, no environment or ground shadow.

Palette: dark base #0E1020, surface #171A31, raised surface #22264A, outline #07080F, restrained neutral highlights #F2F2FA and #9A9CC0. Boss and scene accent Chemistry #FF6A2B; currency accent Spark #F2B530. Use these exact hues as base colours; lighting or cel-shade values may vary. Do not introduce additional saturated accents.
```

### style-1-lab-rush-scene

- Master: `art/style-test/style-1-lab-rush-scene.png`.
- Tool/model: built-in `image_gen.imagegen`; underlying model not exposed.
- Date: 2026-11-17 (Australia/Sydney).
- Exact prompt:

```text
Style 1 — stylised hero. Original mature game splash illustration with precise cel shading, sharp confident silhouettes, angular planes and realistic adult anatomical proportions where humanoid. Crisp hard-edged shadow shapes, controlled highlights, restrained detail, forceful composition. No toy rendering.

Use case: stylized-concept. Asset type: Phase 1 style-test master for HSC Legends. Audience: HSC students aged 16–18; mature, confident, intense, never cute. Original design only: do not imitate any existing game's characters, logos or signature style. Exclude all text, letters, numbers, logos, watermarks and signatures. Never use kawaii or chibi proportions, huge heads, big cartoon eyes, tiny limbs, smiling objects, rounded toy shapes, pastel candy colours, stickers, decorative sparkles, atom badges or flask-body mascots. Science is powerful technology and physical forces. Decorative game art, not a scientific diagram.

Subject: Lab Rush game-card key art. A menacing living plasma reactor entity on the RIGHT side inside a severe industrial containment laboratory. Same entity design: tall adult-proportioned angular dark segmented containment armour, broad shoulder fins, long powerful arms, articulated hands, long firmly planted legs, suspended vertical orange plasma fissure replacing sternum, head a narrow faceless wedge without eyes or mouth. It braces beside a fractured reactor cradle with orange plasma contained between angular metal braces. Environmental geometry recedes across the middle; LEFT 40 percent remains quiet dark negative space for later UI copy. No people, no flasks, no atom graphics, no screens with writing, no actual UI. Mostly dark neutral mass, Chemistry orange #FF6A2B as the sole saturated accent. Opaque full-bleed 16:9 wide scene, at least 1536px wide, restrained composition readable at small card size.

Palette: dark base #0E1020, surface #171A31, raised surface #22264A, outline #07080F, restrained neutral highlights #F2F2FA and #9A9CC0. Boss and scene accent Chemistry #FF6A2B; currency accent Spark #F2B530. Use these exact hues as base colours; lighting or cel-shade values may vary. Do not introduce additional saturated accents.
```

### style-2-chemistry-boss

- Master: `art/style-test/style-2-chemistry-boss.png`.
- Tool/model: built-in `image_gen.imagegen`; underlying model not exposed.
- Date: 2026-11-17 (Australia/Sydney).
- Exact prompt:

```text
Style 2 — graphic emblem. Original mature flat geometric vector-like illustration, clean angular shapes, severe negative-space cuts, strong graphic silhouette, two-tone planar construction, neon accents on dark. Sci-fi insignia precision without using any real logo or franchise design. No painterly textures, gradients, 3D bevels or soft shading.

Use case: stylized-concept. Asset type: Phase 1 style-test master for HSC Legends. Audience: HSC students aged 16–18; mature, confident, intense, never cute. Original design only: do not imitate any existing game's characters, logos or signature style. Exclude all text, letters, numbers, logos, watermarks and signatures. Never use kawaii or chibi proportions, huge heads, big cartoon eyes, tiny limbs, smiling objects, rounded toy shapes, pastel candy colours, stickers, decorative sparkles, atom badges or flask-body mascots. Science is powerful technology and physical forces. Decorative game art, not a scientific diagram.

Subject: one menacing living plasma reactor entity in an idle battle-ready stance, full body. Tall adult-proportioned angular dark segmented containment armour, broad shoulder fins, long powerful arms, articulated hands and firmly planted long legs. A suspended vertical orange plasma fissure replaces the sternum, smaller orange seams between armour plates, head is a narrow faceless wedge with no eyes or mouth. A few contained angular plasma fragments near the shoulders. No weapons. Mostly dark neutral mass with Chemistry #FF6A2B as the sole saturated accent. Centered front three-quarter view, complete silhouette including feet and fins, generous clear padding on a square canvas at least 1024px. Genuinely transparent background, no environment or ground shadow.

Palette: dark base #0E1020, surface #171A31, raised surface #22264A, outline #07080F, restrained neutral highlights #F2F2FA and #9A9CC0. Boss and scene accent Chemistry #FF6A2B; currency accent Spark #F2B530. Use these exact hues as base colours; lighting or cel-shade values may vary. Do not introduce additional saturated accents.
```

### style-2-spark-currency

- Master: `art/style-test/style-2-spark-currency.png`.
- Tool/model: built-in `image_gen.imagegen`; underlying model not exposed.
- Date: 2026-11-17 (Australia/Sydney).
- Exact prompt:

```text
Style 2 — graphic emblem. Original mature flat geometric vector-like illustration, clean angular shapes, severe negative-space cuts, strong graphic silhouette, two-tone planar construction, neon accents on dark. Sci-fi insignia precision without using any real logo or franchise design. No painterly textures, gradients, 3D bevels or soft shading.

Use case: stylized-concept. Asset type: Phase 1 style-test master for HSC Legends. Audience: HSC students aged 16–18; mature, confident, intense, never cute. Original design only: do not imitate any existing game's characters, logos or signature style. Exclude all text, letters, numbers, logos, watermarks and signatures. Never use kawaii or chibi proportions, huge heads, big cartoon eyes, tiny limbs, smiling objects, rounded toy shapes, pastel candy colours, stickers, decorative sparkles, atom badges or flask-body mascots. Science is powerful technology and physical forces. Decorative game art, not a scientific diagram.

Subject: one Spark currency icon: a severe angular hexagonal dark alloy token, with one recessed broken lightning-slash energy channel in Spark gold #F2B530. Non-letter abstract mark, no currency sign or numerical value. Almost frontal, slight three-quarter angle exposing the thin lower-right edge. Restrained facets and one strong clear silhouette, readable at 24px. Gold is the sole saturated accent. Centered isolated token, generous clear padding on a square canvas at least 1024px. Genuinely transparent background, no face, no character, no orbiting stars or sparkle decorations, no environment or ground shadow.

Palette: dark base #0E1020, surface #171A31, raised surface #22264A, outline #07080F, restrained neutral highlights #F2F2FA and #9A9CC0. Boss and scene accent Chemistry #FF6A2B; currency accent Spark #F2B530. Use these exact hues as base colours; lighting or cel-shade values may vary. Do not introduce additional saturated accents.
```

### style-2-lab-rush-scene

- Master: `art/style-test/style-2-lab-rush-scene.png`.
- Tool/model: built-in `image_gen.imagegen`; underlying model not exposed.
- Date: 2026-11-17 (Australia/Sydney).
- Exact prompt:

```text
Style 2 — graphic emblem. Original mature flat geometric vector-like illustration, clean angular shapes, severe negative-space cuts, strong graphic silhouette, two-tone planar construction, neon accents on dark. Sci-fi insignia precision without using any real logo or franchise design. No painterly textures, gradients, 3D bevels or soft shading.

Use case: stylized-concept. Asset type: Phase 1 style-test master for HSC Legends. Audience: HSC students aged 16–18; mature, confident, intense, never cute. Original design only: do not imitate any existing game's characters, logos or signature style. Exclude all text, letters, numbers, logos, watermarks and signatures. Never use kawaii or chibi proportions, huge heads, big cartoon eyes, tiny limbs, smiling objects, rounded toy shapes, pastel candy colours, stickers, decorative sparkles, atom badges or flask-body mascots. Science is powerful technology and physical forces. Decorative game art, not a scientific diagram.

Subject: Lab Rush game-card key art. A menacing living plasma reactor entity on the RIGHT side inside a severe industrial containment laboratory. Same entity design: tall adult-proportioned angular dark segmented containment armour, broad shoulder fins, long powerful arms, articulated hands, long firmly planted legs, suspended vertical orange plasma fissure replacing sternum, head a narrow faceless wedge without eyes or mouth. It braces beside a fractured reactor cradle with orange plasma contained between angular metal braces. Environmental geometry recedes across the middle; LEFT 40 percent remains quiet dark negative space for later UI copy. No people, no flasks, no atom graphics, no screens with writing, no actual UI. Mostly dark neutral mass, Chemistry orange #FF6A2B as the sole saturated accent. Opaque full-bleed 16:9 wide scene, at least 1536px wide, restrained composition readable at small card size.

Palette: dark base #0E1020, surface #171A31, raised surface #22264A, outline #07080F, restrained neutral highlights #F2F2FA and #9A9CC0. Boss and scene accent Chemistry #FF6A2B; currency accent Spark #F2B530. Use these exact hues as base colours; lighting or cel-shade values may vary. Do not introduce additional saturated accents.
```

### style-3-chemistry-boss

- Master: `art/style-test/style-3-chemistry-boss.png`.
- Tool/model: built-in `image_gen.imagegen`; underlying model not exposed.
- Date: 2026-11-17 (Australia/Sydney).
- Exact prompt:

```text
Style 3 — dark painterly. Original mature hand-painted game illustration, dramatic directional light, rich visible brush texture, sculpted shadow masses, sharp angular silhouette, deep dark values and restrained accent lighting. Painterly edge variation and material texture, readable focal point. No toy rendering.

Use case: stylized-concept. Asset type: Phase 1 style-test master for HSC Legends. Audience: HSC students aged 16–18; mature, confident, intense, never cute. Original design only: do not imitate any existing game's characters, logos or signature style. Exclude all text, letters, numbers, logos, watermarks and signatures. Never use kawaii or chibi proportions, huge heads, big cartoon eyes, tiny limbs, smiling objects, rounded toy shapes, pastel candy colours, stickers, decorative sparkles, atom badges or flask-body mascots. Science is powerful technology and physical forces. Decorative game art, not a scientific diagram.

Subject: one menacing living plasma reactor entity in an idle battle-ready stance, full body. Tall adult-proportioned angular dark segmented containment armour, broad shoulder fins, long powerful arms, articulated hands and firmly planted long legs. A suspended vertical orange plasma fissure replaces the sternum, smaller orange seams between armour plates, head is a narrow faceless wedge with no eyes or mouth. A few contained angular plasma fragments near the shoulders. No weapons. Mostly dark neutral mass with Chemistry #FF6A2B as the sole saturated accent. Centered front three-quarter view, complete silhouette including feet and fins, generous clear padding on a square canvas at least 1024px. Genuinely transparent background, no environment or ground shadow.

Palette: dark base #0E1020, surface #171A31, raised surface #22264A, outline #07080F, restrained neutral highlights #F2F2FA and #9A9CC0. Boss and scene accent Chemistry #FF6A2B; currency accent Spark #F2B530. Use these exact hues as base colours; lighting or cel-shade values may vary. Do not introduce additional saturated accents.
```

### style-3-spark-currency

- Master: `art/style-test/style-3-spark-currency.png`.
- Tool/model: built-in `image_gen.imagegen`; underlying model not exposed.
- Date: 2026-11-17 (Australia/Sydney).
- Exact prompt:

```text
Style 3 — dark painterly. Original mature hand-painted game illustration, dramatic directional light, rich visible brush texture, sculpted shadow masses, sharp angular silhouette, deep dark values and restrained accent lighting. Painterly edge variation and material texture, readable focal point. No toy rendering.

Use case: stylized-concept. Asset type: Phase 1 style-test master for HSC Legends. Audience: HSC students aged 16–18; mature, confident, intense, never cute. Original design only: do not imitate any existing game's characters, logos or signature style. Exclude all text, letters, numbers, logos, watermarks and signatures. Never use kawaii or chibi proportions, huge heads, big cartoon eyes, tiny limbs, smiling objects, rounded toy shapes, pastel candy colours, stickers, decorative sparkles, atom badges or flask-body mascots. Science is powerful technology and physical forces. Decorative game art, not a scientific diagram.

Subject: one Spark currency icon: a severe angular hexagonal dark alloy token, with one recessed broken lightning-slash energy channel in Spark gold #F2B530. Non-letter abstract mark, no currency sign or numerical value. Almost frontal, slight three-quarter angle exposing the thin lower-right edge. Restrained facets and one strong clear silhouette, readable at 24px. Gold is the sole saturated accent. Centered isolated token, generous clear padding on a square canvas at least 1024px. Genuinely transparent background, no face, no character, no orbiting stars or sparkle decorations, no environment or ground shadow.

Palette: dark base #0E1020, surface #171A31, raised surface #22264A, outline #07080F, restrained neutral highlights #F2F2FA and #9A9CC0. Boss and scene accent Chemistry #FF6A2B; currency accent Spark #F2B530. Use these exact hues as base colours; lighting or cel-shade values may vary. Do not introduce additional saturated accents.
```

### style-3-lab-rush-scene

- Master: `art/style-test/style-3-lab-rush-scene.png`.
- Tool/model: built-in `image_gen.imagegen`; underlying model not exposed.
- Date: 2026-11-17 (Australia/Sydney).
- Exact prompt:

```text
Style 3 — dark painterly. Original mature hand-painted game illustration, dramatic directional light, rich visible brush texture, sculpted shadow masses, sharp angular silhouette, deep dark values and restrained accent lighting. Painterly edge variation and material texture, readable focal point. No toy rendering.

Use case: stylized-concept. Asset type: Phase 1 style-test master for HSC Legends. Audience: HSC students aged 16–18; mature, confident, intense, never cute. Original design only: do not imitate any existing game's characters, logos or signature style. Exclude all text, letters, numbers, logos, watermarks and signatures. Never use kawaii or chibi proportions, huge heads, big cartoon eyes, tiny limbs, smiling objects, rounded toy shapes, pastel candy colours, stickers, decorative sparkles, atom badges or flask-body mascots. Science is powerful technology and physical forces. Decorative game art, not a scientific diagram.

Subject: Lab Rush game-card key art. A menacing living plasma reactor entity on the RIGHT side inside a severe industrial containment laboratory. Same entity design: tall adult-proportioned angular dark segmented containment armour, broad shoulder fins, long powerful arms, articulated hands, long firmly planted legs, suspended vertical orange plasma fissure replacing sternum, head a narrow faceless wedge without eyes or mouth. It braces beside a fractured reactor cradle with orange plasma contained between angular metal braces. Environmental geometry recedes across the middle; LEFT 40 percent remains quiet dark negative space for later UI copy. No people, no flasks, no atom graphics, no screens with writing, no actual UI. Mostly dark neutral mass, Chemistry orange #FF6A2B as the sole saturated accent. Opaque full-bleed 16:9 wide scene, at least 1536px wide, restrained composition readable at small card size.

Palette: dark base #0E1020, surface #171A31, raised surface #22264A, outline #07080F, restrained neutral highlights #F2F2FA and #9A9CC0. Boss and scene accent Chemistry #FF6A2B; currency accent Spark #F2B530. Use these exact hues as base colours; lighting or cel-shade values may vary. Do not introduce additional saturated accents.
```

## Round 3 — locked-style production assets (2026-11-17)

Produced under the Locked style section and round 2 feedback in `docs/ART_DIRECTION.md`. Style 1 is used for six subject-specific idle bosses and the live lobby backdrop; Style 2 is used for the replacement neutral four-point Spark crystal and twelve live-game UI icons. No other poses or app integration are included. The locked style block begins every prompt below, with its accent placeholder substituted.

- Generation date: **2026-11-17** (Australia/Sydney), all twenty assets.
- Tool: built-in **`image_gen.imagegen`** (`image_gen__imagegen`), one text-to-image call per asset; exact underlying model/version is **not exposed** by the tool. No input/reference images were used.
- PNG masters are copied unchanged from the generated outputs. Boss and icon backgrounds were requested as transparent and retain their generated alpha; the lobby is intentionally opaque.
- Web delivery uses Pillow: bosses **512 × 512** (for display up to 256 × 256), icons **96 × 96** (for display up to 48 × 48, including 24px), lobby **1600 × 900** (for display up to 800 × 450 at 2×). The brief gives the 2× rule without concrete display dimensions; these are the delivery sizes chosen for this batch. Icons use lossless WebP; bosses and key art use lossy WebP with alpha preserved where applicable. The near-16:9 generated lobby is centre fitted to exact 16:9 for web delivery.
- Review sheet: **`art/review/round3-sheet.png`**, 1800 × 2500, assembled from the unchanged masters with Pillow on **`#0E1020`**. Bosses are grouped by subject; each icon appears enlarged and at 24px; lobby is shown at 16:9. DejaVu Sans labels sit outside the asset images.
- Review checks: distinct boss silhouettes and subject cues; each subject uses its palette accent; no visible text/branding inside art; Spark has four points and the achievement star five; transparent sprites/icons; quiet lobby centre for join-code overlay. Colour hex values are prompt targets with natural shading, not per-pixel palette quantisation. All artwork is decorative and must not replace subject-reviewed teaching diagrams. Awaiting owner review.

### Round 3 delivery inventory

| Asset | Master size | Web size | Web bytes |
|---|---|---|---:|
| `bosses/biology-boss-idle` | 1254 × 1254 | 512 × 512 | 54,448 |
| `bosses/chemistry-boss-idle` | 1254 × 1254 | 512 × 512 | 55,098 |
| `bosses/physics-boss-idle` | 1254 × 1254 | 512 × 512 | 58,276 |
| `bosses/maths-standard-boss-idle` | 1254 × 1254 | 512 × 512 | 46,096 |
| `bosses/maths-advanced-boss-idle` | 1254 × 1254 | 512 × 512 | 43,710 |
| `bosses/maths-extension-1-boss-idle` | 1254 × 1254 | 512 × 512 | 35,684 |
| `icons/spark` | 1254 × 1254 | 96 × 96 | 5,922 |
| `icons/timer` | 1254 × 1254 | 96 × 96 | 5,338 |
| `icons/correct-tick` | 1254 × 1254 | 96 × 96 | 5,640 |
| `icons/wrong-cross` | 1254 × 1254 | 96 × 96 | 5,762 |
| `icons/crown` | 1254 × 1254 | 96 × 96 | 5,166 |
| `icons/trophy` | 1254 × 1254 | 96 × 96 | 8,054 |
| `icons/streak-flame` | 1254 × 1254 | 96 × 96 | 5,778 |
| `icons/player` | 1254 × 1254 | 96 × 96 | 6,240 |
| `icons/players-group` | 1254 × 1254 | 96 × 96 | 7,040 |
| `icons/lock` | 1254 × 1254 | 96 × 96 | 4,264 |
| `icons/star` | 1254 × 1254 | 96 × 96 | 8,060 |
| `icons/shield` | 1254 × 1254 | 96 × 96 | 6,270 |
| `icons/play` | 1254 × 1254 | 96 × 96 | 5,640 |
| `keyart/live-lobby` | 1672 × 941 | 1600 × 900 | 37,242 |

### Round 3: biology-boss-idle

- Master: `art/masters/bosses/biology-boss-idle.png`.
- Web copy: `public/art/bosses/biology-boss-idle.webp`.
- Style: 1 (stylised hero); accent: `#1FB070`.
- Date: 2026-11-17 (Australia/Sydney).
- Tool/model: built-in `image_gen.imagegen`; exact model not exposed.
- Exact prompt:

```text
Stylised hero game art for a mature teen audience (16-18). Cel-shaded, crisp dark
outlines, sharp angular silhouette, deep navy/charcoal forms with a single glowing
#1FB070 accent, light painterly texture, dramatic rim light, readable
at card size. Original design.

Use case: stylized-concept. Original mature teen game asset. No existing franchise characters, logos or signature visual likenesses. No text, letters, numbers, equations, watermarks or signatures. No cute or chibi forms, big cartoon eyes, smiling objects, toy shapes, candy pastels or primary-school science badges. Art is decorative, not a scientific diagram. Palette neutrals #0E1020, #171A31, #22264A, outline #07080F; restrained highlights #9A9CC0 and #F2F2FA. Keep only the specified saturated accent.

Subject: A menacing mutating colonial organism: broad low asymmetrical living cell mass with a translucent faceted membrane enclosing a visible coiled double-helix nucleus; three long splayed chitinous tendrils anchor it, a crown of three large spore sacs grows from one side. No head, human torso or face. Green membrane edges and internal helix against navy organic plates. Resting predatory crouch, wide triangular silhouette, biology visible through membranes, nucleus and spores rather than decorative symbols.

Composition: one boss only, idle pose, focused or menacing, isolated complete full body, square PNG at least 1024px, genuinely transparent background. Silhouette occupies 80% of canvas with generous clear padding, nothing clipped. No scenery, no floor, no labels, no cast shadow beyond subject. Keep structure bold and readable when reduced to 256px; avoid small ornamental spikes.
```

### Round 3: chemistry-boss-idle

- Master: `art/masters/bosses/chemistry-boss-idle.png`.
- Web copy: `public/art/bosses/chemistry-boss-idle.webp`.
- Style: 1 (stylised hero); accent: `#FF6A2B`.
- Date: 2026-11-17 (Australia/Sydney).
- Tool/model: built-in `image_gen.imagegen`; exact model not exposed.
- Exact prompt:

```text
Stylised hero game art for a mature teen audience (16-18). Cel-shaded, crisp dark
outlines, sharp angular silhouette, deep navy/charcoal forms with a single glowing
#FF6A2B accent, light painterly texture, dramatic rim light, readable
at card size. Original design.

Use case: stylized-concept. Original mature teen game asset. No existing franchise characters, logos or signature visual likenesses. No text, letters, numbers, equations, watermarks or signatures. No cute or chibi forms, big cartoon eyes, smiling objects, toy shapes, candy pastels or primary-school science badges. Art is decorative, not a scientific diagram. Palette neutrals #0E1020, #171A31, #22264A, outline #07080F; restrained highlights #9A9CC0 and #F2F2FA. Keep only the specified saturated accent.

Subject: A menacing mobile reaction-vessel entity: heavy hexagonal transparent reaction chamber containing a bright controlled orange chemical flame, mounted on four low angular articulated crawler legs. An exposed crystal lattice grows through one side of the chamber, with large repeating cubic crystal bonds; two angular distillation necks curl upward on the other side. Dark ceramic and navy structural clamps, orange crystal facets and flame. Idle squat crab-like silhouette, no human torso, no head or face. Its body IS a reaction vessel and crystal growth, not a generic armoured lava golem.

Composition: one boss only, idle pose, focused or menacing, isolated complete full body, square PNG at least 1024px, genuinely transparent background. Silhouette occupies 80% of canvas with generous clear padding, nothing clipped. No scenery, no floor, no labels, no cast shadow beyond subject. Keep structure bold and readable when reduced to 256px; avoid small ornamental spikes.
```

### Round 3: physics-boss-idle

- Master: `art/masters/bosses/physics-boss-idle.png`.
- Web copy: `public/art/bosses/physics-boss-idle.webp`.
- Style: 1 (stylised hero); accent: `#2F7BEA`.
- Date: 2026-11-17 (Australia/Sydney).
- Tool/model: built-in `image_gen.imagegen`; exact model not exposed.
- Exact prompt:

```text
Stylised hero game art for a mature teen audience (16-18). Cel-shaded, crisp dark
outlines, sharp angular silhouette, deep navy/charcoal forms with a single glowing
#2F7BEA accent, light painterly texture, dramatic rim light, readable
at card size. Original design.

Use case: stylized-concept. Original mature teen game asset. No existing franchise characters, logos or signature visual likenesses. No text, letters, numbers, equations, watermarks or signatures. No cute or chibi forms, big cartoon eyes, smiling objects, toy shapes, candy pastels or primary-school science badges. Art is decorative, not a scientific diagram. Palette neutrals #0E1020, #171A31, #22264A, outline #07080F; restrained highlights #9A9CC0 and #F2F2FA. Keep only the specified saturated accent.

Subject: A menacing levitating electromagnetic field entity: a large dark central toroidal induction coil tilted diagonally, split into three clear wound coil segments around a deep circular gravity-well void. Two separated heavy crescent field vanes above and below, and three small blue orbiting charge spheres on one clean elliptical track. No head, arms, legs or humanoid body. Blue field lines are sparse continuous arcs, never lightning bolts. Floating open circular silhouette with strong negative space, idle stable suspension; recognisable coils, charges and field geometry.

Composition: one boss only, idle pose, focused or menacing, isolated complete full body, square PNG at least 1024px, genuinely transparent background. Silhouette occupies 80% of canvas with generous clear padding, nothing clipped. No scenery, no floor, no labels, no cast shadow beyond subject. Keep structure bold and readable when reduced to 256px; avoid small ornamental spikes.
```

### Round 3: maths-standard-boss-idle

- Master: `art/masters/bosses/maths-standard-boss-idle.png`.
- Web copy: `public/art/bosses/maths-standard-boss-idle.webp`.
- Style: 1 (stylised hero); accent: `#F2B530`.
- Date: 2026-11-17 (Australia/Sydney).
- Tool/model: built-in `image_gen.imagegen`; exact model not exposed.
- Exact prompt:

```text
Stylised hero game art for a mature teen audience (16-18). Cel-shaded, crisp dark
outlines, sharp angular silhouette, deep navy/charcoal forms with a single glowing
#F2B530 accent, light painterly texture, dramatic rim light, readable
at card size. Original design.

Use case: stylized-concept. Original mature teen game asset. No existing franchise characters, logos or signature visual likenesses. No text, letters, numbers, equations, watermarks or signatures. No cute or chibi forms, big cartoon eyes, smiling objects, toy shapes, candy pastels or primary-school science badges. Art is decorative, not a scientific diagram. Palette neutrals #0E1020, #171A31, #22264A, outline #07080F; restrained highlights #9A9CC0 and #F2F2FA. Keep only the specified saturated accent.

Subject: A menacing geometric balance construct embodying measurement, proportion and statistics: a broad horizontal angular balance beam hovering on a short stepped trapezoid plinth; unequal stacks of dark cubes sit in two rigid suspended geometric trays, aligned into a balanced lever. Gold measuring divisions as short unlabelled notches, and a large gold outlined triangular brace connect the structure. No face, limbs, equations or numbers. Idle symmetrical wide T silhouette with readable lever, cubic volume and proportion; intimidating engineered monolith, not a literal school ruler with a face.

Composition: one boss only, idle pose, focused or menacing, isolated complete full body, square PNG at least 1024px, genuinely transparent background. Silhouette occupies 80% of canvas with generous clear padding, nothing clipped. No scenery, no floor, no labels, no cast shadow beyond subject. Keep structure bold and readable when reduced to 256px; avoid small ornamental spikes.
```

### Round 3: maths-advanced-boss-idle

- Master: `art/masters/bosses/maths-advanced-boss-idle.png`.
- Web copy: `public/art/bosses/maths-advanced-boss-idle.webp`.
- Style: 1 (stylised hero); accent: `#9B5CFF`.
- Date: 2026-11-17 (Australia/Sydney).
- Tool/model: built-in `image_gen.imagegen`; exact model not exposed.
- Exact prompt:

```text
Stylised hero game art for a mature teen audience (16-18). Cel-shaded, crisp dark
outlines, sharp angular silhouette, deep navy/charcoal forms with a single glowing
#9B5CFF accent, light painterly texture, dramatic rim light, readable
at card size. Original design.

Use case: stylized-concept. Original mature teen game asset. No existing franchise characters, logos or signature visual likenesses. No text, letters, numbers, equations, watermarks or signatures. No cute or chibi forms, big cartoon eyes, smiling objects, toy shapes, candy pastels or primary-school science badges. Art is decorative, not a scientific diagram. Palette neutrals #0E1020, #171A31, #22264A, outline #07080F; restrained highlights #9A9CC0 and #F2F2FA. Keep only the specified saturated accent.

Subject: A menacing suspended recursive polyhedral construct embodying functions and geometric transformation: a giant dark octahedron split into four separated sharp facets around a glowing violet hollow octahedral core, with two progressively smaller nested octahedra visible through the gap. A single clean violet curved parametric ribbon threads through its centre, no symbols or text. No face, limbs or humanoid anatomy. Idle poised diagonal diamond silhouette, few large angular pieces, precise repeated scaling and geometric transformations rather than decorative random armour.

Composition: one boss only, idle pose, focused or menacing, isolated complete full body, square PNG at least 1024px, genuinely transparent background. Silhouette occupies 80% of canvas with generous clear padding, nothing clipped. No scenery, no floor, no labels, no cast shadow beyond subject. Keep structure bold and readable when reduced to 256px; avoid small ornamental spikes.
```

### Round 3: maths-extension-1-boss-idle

- Master: `art/masters/bosses/maths-extension-1-boss-idle.png`.
- Web copy: `public/art/bosses/maths-extension-1-boss-idle.webp`.
- Style: 1 (stylised hero); accent: `#E8447F`.
- Date: 2026-11-17 (Australia/Sydney).
- Tool/model: built-in `image_gen.imagegen`; exact model not exposed.
- Exact prompt:

```text
Stylised hero game art for a mature teen audience (16-18). Cel-shaded, crisp dark
outlines, sharp angular silhouette, deep navy/charcoal forms with a single glowing
#E8447F accent, light painterly texture, dramatic rim light, readable
at card size. Original design.

Use case: stylized-concept. Original mature teen game asset. No existing franchise characters, logos or signature visual likenesses. No text, letters, numbers, equations, watermarks or signatures. No cute or chibi forms, big cartoon eyes, smiling objects, toy shapes, candy pastels or primary-school science badges. Art is decorative, not a scientific diagram. Palette neutrals #0E1020, #171A31, #22264A, outline #07080F; restrained highlights #9A9CC0 and #F2F2FA. Keep only the specified saturated accent.

Subject: A menacing long serpentine fractal construct embodying recursion and vector trajectories: a single segmented chain of self-similar dark triangular tetrahedra curls into a sweeping angular S, tapering toward both ends. Three clear scales of repeating tetrahedral branching form a crown at the upper tip, with a sparse continuous pink trajectory thread joining the geometric centres. No animal face, eyes, mouth, wings, human torso or limbs. Idle suspended coiled posture, tall sinuous asymmetrical silhouette with large negative spaces, visibly recursive mathematical structure, no written equations.

Composition: one boss only, idle pose, focused or menacing, isolated complete full body, square PNG at least 1024px, genuinely transparent background. Silhouette occupies 80% of canvas with generous clear padding, nothing clipped. No scenery, no floor, no labels, no cast shadow beyond subject. Keep structure bold and readable when reduced to 256px; avoid small ornamental spikes.
```

### Round 3: spark

- Master: `art/masters/icons/spark.png`.
- Web copy: `public/art/icons/spark.webp`.
- Style: 2 (graphic emblem); accent: `#F2B530`.
- Date: 2026-11-17 (Australia/Sydney).
- Tool/model: built-in `image_gen.imagegen`; exact model not exposed.
- Exact prompt:

```text
Flat geometric vector emblem, thick #07080F outline, 2-3 flat tones, deep navy base
with a single #F2B530 accent, angular/hexagonal framing, no gradients beyond one
subtle highlight, readable at 24px. Original design.

Use case: stylized-concept. Original mature teen game asset. No existing franchise characters, logos or signature visual likenesses. No text, letters, numbers, equations, watermarks or signatures. No cute or chibi forms, big cartoon eyes, smiling objects, toy shapes, candy pastels or primary-school science badges. Art is decorative, not a scientific diagram. Palette neutrals #0E1020, #171A31, #22264A, outline #07080F; restrained highlights #9A9CC0 and #F2F2FA. Keep only the specified saturated accent.

Subject: Neutral four-point star crystal currency. ONE four-point diamond-like crystal, elongated vertical tips and shorter horizontal tips, four simple angular planar faces, gold with navy recessed seams. No lightning bolt, zigzag, letter, coin writing, Physics motif or decorative sparkles.

Composition: one isolated UI icon, centered on a square canvas at least 1024px. Genuine transparent background. Icon occupies about 76% of canvas with consistent generous padding. Simple broad geometric shapes, thick dark external outline, crisp flat fill, at most three main tones, no small ornamental details, no cast shadow or surrounding scenery. Must remain legible at 24px. Keep edges sharp, no rounded toy bevels.
```

### Round 3: timer

- Master: `art/masters/icons/timer.png`.
- Web copy: `public/art/icons/timer.webp`.
- Style: 2 (graphic emblem); accent: `#F2B530`.
- Date: 2026-11-17 (Australia/Sydney).
- Tool/model: built-in `image_gen.imagegen`; exact model not exposed.
- Exact prompt:

```text
Flat geometric vector emblem, thick #07080F outline, 2-3 flat tones, deep navy base
with a single #F2B530 accent, angular/hexagonal framing, no gradients beyond one
subtle highlight, readable at 24px. Original design.

Use case: stylized-concept. Original mature teen game asset. No existing franchise characters, logos or signature visual likenesses. No text, letters, numbers, equations, watermarks or signatures. No cute or chibi forms, big cartoon eyes, smiling objects, toy shapes, candy pastels or primary-school science badges. Art is decorative, not a scientific diagram. Palette neutrals #0E1020, #171A31, #22264A, outline #07080F; restrained highlights #9A9CC0 and #F2F2FA. Keep only the specified saturated accent.

Subject: An angular stopwatch silhouette with one small top stem, a clear circular dark face inside an octagonal rim, and two thick gold clock hands pointing upward and right. No digits, tick marks or lettering.

Composition: one isolated UI icon, centered on a square canvas at least 1024px. Genuine transparent background. Icon occupies about 76% of canvas with consistent generous padding. Simple broad geometric shapes, thick dark external outline, crisp flat fill, at most three main tones, no small ornamental details, no cast shadow or surrounding scenery. Must remain legible at 24px. Keep edges sharp, no rounded toy bevels.
```

### Round 3: correct-tick

- Master: `art/masters/icons/correct-tick.png`.
- Web copy: `public/art/icons/correct-tick.webp`.
- Style: 2 (graphic emblem); accent: `#1FB070`.
- Date: 2026-11-17 (Australia/Sydney).
- Tool/model: built-in `image_gen.imagegen`; exact model not exposed.
- Exact prompt:

```text
Flat geometric vector emblem, thick #07080F outline, 2-3 flat tones, deep navy base
with a single #1FB070 accent, angular/hexagonal framing, no gradients beyond one
subtle highlight, readable at 24px. Original design.

Use case: stylized-concept. Original mature teen game asset. No existing franchise characters, logos or signature visual likenesses. No text, letters, numbers, equations, watermarks or signatures. No cute or chibi forms, big cartoon eyes, smiling objects, toy shapes, candy pastels or primary-school science badges. Art is decorative, not a scientific diagram. Palette neutrals #0E1020, #171A31, #22264A, outline #07080F; restrained highlights #9A9CC0 and #F2F2FA. Keep only the specified saturated accent.

Subject: ONE bold green check mark centered in a simple angular dark hexagonal backing. Thick clear diagonal strokes, unmistakable success tick.

Composition: one isolated UI icon, centered on a square canvas at least 1024px. Genuine transparent background. Icon occupies about 76% of canvas with consistent generous padding. Simple broad geometric shapes, thick dark external outline, crisp flat fill, at most three main tones, no small ornamental details, no cast shadow or surrounding scenery. Must remain legible at 24px. Keep edges sharp, no rounded toy bevels.
```

### Round 3: wrong-cross

- Master: `art/masters/icons/wrong-cross.png`.
- Web copy: `public/art/icons/wrong-cross.webp`.
- Style: 2 (graphic emblem); accent: `#E8445F`.
- Date: 2026-11-17 (Australia/Sydney).
- Tool/model: built-in `image_gen.imagegen`; exact model not exposed.
- Exact prompt:

```text
Flat geometric vector emblem, thick #07080F outline, 2-3 flat tones, deep navy base
with a single #E8445F accent, angular/hexagonal framing, no gradients beyond one
subtle highlight, readable at 24px. Original design.

Use case: stylized-concept. Original mature teen game asset. No existing franchise characters, logos or signature visual likenesses. No text, letters, numbers, equations, watermarks or signatures. No cute or chibi forms, big cartoon eyes, smiling objects, toy shapes, candy pastels or primary-school science badges. Art is decorative, not a scientific diagram. Palette neutrals #0E1020, #171A31, #22264A, outline #07080F; restrained highlights #9A9CC0 and #F2F2FA. Keep only the specified saturated accent.

Subject: ONE bold coral diagonal cross inside the same simple angular dark hexagonal backing. Two equally thick diagonal bars, unmistakable failure cross, no typography.

Composition: one isolated UI icon, centered on a square canvas at least 1024px. Genuine transparent background. Icon occupies about 76% of canvas with consistent generous padding. Simple broad geometric shapes, thick dark external outline, crisp flat fill, at most three main tones, no small ornamental details, no cast shadow or surrounding scenery. Must remain legible at 24px. Keep edges sharp, no rounded toy bevels.
```

### Round 3: crown

- Master: `art/masters/icons/crown.png`.
- Web copy: `public/art/icons/crown.webp`.
- Style: 2 (graphic emblem); accent: `#F2B530`.
- Date: 2026-11-17 (Australia/Sydney).
- Tool/model: built-in `image_gen.imagegen`; exact model not exposed.
- Exact prompt:

```text
Flat geometric vector emblem, thick #07080F outline, 2-3 flat tones, deep navy base
with a single #F2B530 accent, angular/hexagonal framing, no gradients beyond one
subtle highlight, readable at 24px. Original design.

Use case: stylized-concept. Original mature teen game asset. No existing franchise characters, logos or signature visual likenesses. No text, letters, numbers, equations, watermarks or signatures. No cute or chibi forms, big cartoon eyes, smiling objects, toy shapes, candy pastels or primary-school science badges. Art is decorative, not a scientific diagram. Palette neutrals #0E1020, #171A31, #22264A, outline #07080F; restrained highlights #9A9CC0 and #F2F2FA. Keep only the specified saturated accent.

Subject: A severe three-point gold crown with a flat dark base band and no jewels or tiny decoration. Clear competitive rank silhouette.

Composition: one isolated UI icon, centered on a square canvas at least 1024px. Genuine transparent background. Icon occupies about 76% of canvas with consistent generous padding. Simple broad geometric shapes, thick dark external outline, crisp flat fill, at most three main tones, no small ornamental details, no cast shadow or surrounding scenery. Must remain legible at 24px. Keep edges sharp, no rounded toy bevels.
```

### Round 3: trophy

- Master: `art/masters/icons/trophy.png`.
- Web copy: `public/art/icons/trophy.webp`.
- Style: 2 (graphic emblem); accent: `#F2B530`.
- Date: 2026-11-17 (Australia/Sydney).
- Tool/model: built-in `image_gen.imagegen`; exact model not exposed.
- Exact prompt:

```text
Flat geometric vector emblem, thick #07080F outline, 2-3 flat tones, deep navy base
with a single #F2B530 accent, angular/hexagonal framing, no gradients beyond one
subtle highlight, readable at 24px. Original design.

Use case: stylized-concept. Original mature teen game asset. No existing franchise characters, logos or signature visual likenesses. No text, letters, numbers, equations, watermarks or signatures. No cute or chibi forms, big cartoon eyes, smiling objects, toy shapes, candy pastels or primary-school science badges. Art is decorative, not a scientific diagram. Palette neutrals #0E1020, #171A31, #22264A, outline #07080F; restrained highlights #9A9CC0 and #F2F2FA. Keep only the specified saturated accent.

Subject: A gold angular championship cup, two broad handles, short stem and trapezoid foot. No engraving, stars, lettering or tiny details.

Composition: one isolated UI icon, centered on a square canvas at least 1024px. Genuine transparent background. Icon occupies about 76% of canvas with consistent generous padding. Simple broad geometric shapes, thick dark external outline, crisp flat fill, at most three main tones, no small ornamental details, no cast shadow or surrounding scenery. Must remain legible at 24px. Keep edges sharp, no rounded toy bevels.
```

### Round 3: streak-flame

- Master: `art/masters/icons/streak-flame.png`.
- Web copy: `public/art/icons/streak-flame.webp`.
- Style: 2 (graphic emblem); accent: `#FF6A2B`.
- Date: 2026-11-17 (Australia/Sydney).
- Tool/model: built-in `image_gen.imagegen`; exact model not exposed.
- Exact prompt:

```text
Flat geometric vector emblem, thick #07080F outline, 2-3 flat tones, deep navy base
with a single #FF6A2B accent, angular/hexagonal framing, no gradients beyond one
subtle highlight, readable at 24px. Original design.

Use case: stylized-concept. Original mature teen game asset. No existing franchise characters, logos or signature visual likenesses. No text, letters, numbers, equations, watermarks or signatures. No cute or chibi forms, big cartoon eyes, smiling objects, toy shapes, candy pastels or primary-school science badges. Art is decorative, not a scientific diagram. Palette neutrals #0E1020, #171A31, #22264A, outline #07080F; restrained highlights #9A9CC0 and #F2F2FA. Keep only the specified saturated accent.

Subject: ONE sharp orange flame with an angular upward tongue and one dark negative-space inner cut. Energetic streak symbol, no face or enclosing badge.

Composition: one isolated UI icon, centered on a square canvas at least 1024px. Genuine transparent background. Icon occupies about 76% of canvas with consistent generous padding. Simple broad geometric shapes, thick dark external outline, crisp flat fill, at most three main tones, no small ornamental details, no cast shadow or surrounding scenery. Must remain legible at 24px. Keep edges sharp, no rounded toy bevels.
```

### Round 3: player

- Master: `art/masters/icons/player.png`.
- Web copy: `public/art/icons/player.webp`.
- Style: 2 (graphic emblem); accent: `#6E5BFF`.
- Date: 2026-11-17 (Australia/Sydney).
- Tool/model: built-in `image_gen.imagegen`; exact model not exposed.
- Exact prompt:

```text
Flat geometric vector emblem, thick #07080F outline, 2-3 flat tones, deep navy base
with a single #6E5BFF accent, angular/hexagonal framing, no gradients beyond one
subtle highlight, readable at 24px. Original design.

Use case: stylized-concept. Original mature teen game asset. No existing franchise characters, logos or signature visual likenesses. No text, letters, numbers, equations, watermarks or signatures. No cute or chibi forms, big cartoon eyes, smiling objects, toy shapes, candy pastels or primary-school science badges. Art is decorative, not a scientific diagram. Palette neutrals #0E1020, #171A31, #22264A, outline #07080F; restrained highlights #9A9CC0 and #F2F2FA. Keep only the specified saturated accent.

Subject: A neutral anonymous player bust: one faceted geometric head above broad angular shoulders, violet silhouette panels and dark separation. No eyes, facial details, gender cues, clothing decoration or letters.

Composition: one isolated UI icon, centered on a square canvas at least 1024px. Genuine transparent background. Icon occupies about 76% of canvas with consistent generous padding. Simple broad geometric shapes, thick dark external outline, crisp flat fill, at most three main tones, no small ornamental details, no cast shadow or surrounding scenery. Must remain legible at 24px. Keep edges sharp, no rounded toy bevels.
```

### Round 3: players-group

- Master: `art/masters/icons/players-group.png`.
- Web copy: `public/art/icons/players-group.webp`.
- Style: 2 (graphic emblem); accent: `#6E5BFF`.
- Date: 2026-11-17 (Australia/Sydney).
- Tool/model: built-in `image_gen.imagegen`; exact model not exposed.
- Exact prompt:

```text
Flat geometric vector emblem, thick #07080F outline, 2-3 flat tones, deep navy base
with a single #6E5BFF accent, angular/hexagonal framing, no gradients beyond one
subtle highlight, readable at 24px. Original design.

Use case: stylized-concept. Original mature teen game asset. No existing franchise characters, logos or signature visual likenesses. No text, letters, numbers, equations, watermarks or signatures. No cute or chibi forms, big cartoon eyes, smiling objects, toy shapes, candy pastels or primary-school science badges. Art is decorative, not a scientific diagram. Palette neutrals #0E1020, #171A31, #22264A, outline #07080F; restrained highlights #9A9CC0 and #F2F2FA. Keep only the specified saturated accent.

Subject: A group of THREE anonymous geometric player busts: one larger central head and shoulders in front, two smaller heads and shoulders behind on either side. Violet shapes with dark separations, no faces or decoration. Clear group silhouette.

Composition: one isolated UI icon, centered on a square canvas at least 1024px. Genuine transparent background. Icon occupies about 76% of canvas with consistent generous padding. Simple broad geometric shapes, thick dark external outline, crisp flat fill, at most three main tones, no small ornamental details, no cast shadow or surrounding scenery. Must remain legible at 24px. Keep edges sharp, no rounded toy bevels.
```

### Round 3: lock

- Master: `art/masters/icons/lock.png`.
- Web copy: `public/art/icons/lock.webp`.
- Style: 2 (graphic emblem); accent: `#9A9CC0`.
- Date: 2026-11-17 (Australia/Sydney).
- Tool/model: built-in `image_gen.imagegen`; exact model not exposed.
- Exact prompt:

```text
Flat geometric vector emblem, thick #07080F outline, 2-3 flat tones, deep navy base
with a single #9A9CC0 accent, angular/hexagonal framing, no gradients beyond one
subtle highlight, readable at 24px. Original design.

Use case: stylized-concept. Original mature teen game asset. No existing franchise characters, logos or signature visual likenesses. No text, letters, numbers, equations, watermarks or signatures. No cute or chibi forms, big cartoon eyes, smiling objects, toy shapes, candy pastels or primary-school science badges. Art is decorative, not a scientific diagram. Palette neutrals #0E1020, #171A31, #22264A, outline #07080F; restrained highlights #9A9CC0 and #F2F2FA. Keep only the specified saturated accent.

Subject: A closed angular padlock: broad rectangular dark body with pale lavender-grey front plane and a thick squared U-shaped shackle. ONE simple dark keyhole cutout; no text.

Composition: one isolated UI icon, centered on a square canvas at least 1024px. Genuine transparent background. Icon occupies about 76% of canvas with consistent generous padding. Simple broad geometric shapes, thick dark external outline, crisp flat fill, at most three main tones, no small ornamental details, no cast shadow or surrounding scenery. Must remain legible at 24px. Keep edges sharp, no rounded toy bevels.
```

### Round 3: star

- Master: `art/masters/icons/star.png`.
- Web copy: `public/art/icons/star.webp`.
- Style: 2 (graphic emblem); accent: `#F2B530`.
- Date: 2026-11-17 (Australia/Sydney).
- Tool/model: built-in `image_gen.imagegen`; exact model not exposed.
- Exact prompt:

```text
Flat geometric vector emblem, thick #07080F outline, 2-3 flat tones, deep navy base
with a single #F2B530 accent, angular/hexagonal framing, no gradients beyond one
subtle highlight, readable at 24px. Original design.

Use case: stylized-concept. Original mature teen game asset. No existing franchise characters, logos or signature visual likenesses. No text, letters, numbers, equations, watermarks or signatures. No cute or chibi forms, big cartoon eyes, smiling objects, toy shapes, candy pastels or primary-school science badges. Art is decorative, not a scientific diagram. Palette neutrals #0E1020, #171A31, #22264A, outline #07080F; restrained highlights #9A9CC0 and #F2F2FA. Keep only the specified saturated accent.

Subject: ONE solid symmetric FIVE-point gold achievement star, broad angular points, dark thick outline, one inset dark planar cut for restrained depth. Five points clearly distinct from the FOUR-point Spark currency crystal.

Composition: one isolated UI icon, centered on a square canvas at least 1024px. Genuine transparent background. Icon occupies about 76% of canvas with consistent generous padding. Simple broad geometric shapes, thick dark external outline, crisp flat fill, at most three main tones, no small ornamental details, no cast shadow or surrounding scenery. Must remain legible at 24px. Keep edges sharp, no rounded toy bevels.
```

### Round 3: shield

- Master: `art/masters/icons/shield.png`.
- Web copy: `public/art/icons/shield.webp`.
- Style: 2 (graphic emblem); accent: `#2F7BEA`.
- Date: 2026-11-17 (Australia/Sydney).
- Tool/model: built-in `image_gen.imagegen`; exact model not exposed.
- Exact prompt:

```text
Flat geometric vector emblem, thick #07080F outline, 2-3 flat tones, deep navy base
with a single #2F7BEA accent, angular/hexagonal framing, no gradients beyond one
subtle highlight, readable at 24px. Original design.

Use case: stylized-concept. Original mature teen game asset. No existing franchise characters, logos or signature visual likenesses. No text, letters, numbers, equations, watermarks or signatures. No cute or chibi forms, big cartoon eyes, smiling objects, toy shapes, candy pastels or primary-school science badges. Art is decorative, not a scientific diagram. Palette neutrals #0E1020, #171A31, #22264A, outline #07080F; restrained highlights #9A9CC0 and #F2F2FA. Keep only the specified saturated accent.

Subject: ONE angular blue shield with broad straight shoulders and a pointed lower tip, strong central dark seam dividing two flat planes. No emblems, weapons, symbols or lettering inside.

Composition: one isolated UI icon, centered on a square canvas at least 1024px. Genuine transparent background. Icon occupies about 76% of canvas with consistent generous padding. Simple broad geometric shapes, thick dark external outline, crisp flat fill, at most three main tones, no small ornamental details, no cast shadow or surrounding scenery. Must remain legible at 24px. Keep edges sharp, no rounded toy bevels.
```

### Round 3: play

- Master: `art/masters/icons/play.png`.
- Web copy: `public/art/icons/play.webp`.
- Style: 2 (graphic emblem); accent: `#1FB070`.
- Date: 2026-11-17 (Australia/Sydney).
- Tool/model: built-in `image_gen.imagegen`; exact model not exposed.
- Exact prompt:

```text
Flat geometric vector emblem, thick #07080F outline, 2-3 flat tones, deep navy base
with a single #1FB070 accent, angular/hexagonal framing, no gradients beyond one
subtle highlight, readable at 24px. Original design.

Use case: stylized-concept. Original mature teen game asset. No existing franchise characters, logos or signature visual likenesses. No text, letters, numbers, equations, watermarks or signatures. No cute or chibi forms, big cartoon eyes, smiling objects, toy shapes, candy pastels or primary-school science badges. Art is decorative, not a scientific diagram. Palette neutrals #0E1020, #171A31, #22264A, outline #07080F; restrained highlights #9A9CC0 and #F2F2FA. Keep only the specified saturated accent.

Subject: ONE bold green right-pointing triangular play symbol in a simple angular dark hexagonal backing; clean thick triangle, generous negative space. No letters.

Composition: one isolated UI icon, centered on a square canvas at least 1024px. Genuine transparent background. Icon occupies about 76% of canvas with consistent generous padding. Simple broad geometric shapes, thick dark external outline, crisp flat fill, at most three main tones, no small ornamental details, no cast shadow or surrounding scenery. Must remain legible at 24px. Keep edges sharp, no rounded toy bevels.
```

### Round 3: live-lobby

- Master: `art/masters/keyart/live-lobby.png`.
- Web copy: `public/art/keyart/live-lobby.webp`.
- Style: 1 (stylised hero); accent: `#6E5BFF`.
- Date: 2026-11-17 (Australia/Sydney).
- Tool/model: built-in `image_gen.imagegen`; exact model not exposed.
- Exact prompt:

```text
Stylised hero game art for a mature teen audience (16-18). Cel-shaded, crisp dark
outlines, sharp angular silhouette, deep navy/charcoal forms with a single glowing
#6E5BFF accent, light painterly texture, dramatic rim light, readable
at card size. Original design.

Use case: stylized-concept. Original mature teen game asset. No existing franchise characters, logos or signature visual likenesses. No text, letters, numbers, equations, watermarks or signatures. No cute or chibi forms, big cartoon eyes, smiling objects, toy shapes, candy pastels or primary-school science badges. Art is decorative, not a scientific diagram. Palette neutrals #0E1020, #171A31, #22264A, outline #07080F; restrained highlights #9A9CC0 and #F2F2FA. Keep only the specified saturated accent.

Subject: a mature competitive science-game live lobby backdrop, an original monumental angular research arena with severe containment architecture on the far LEFT and far RIGHT edges. Sparse violet light strips, dark metal facets and controlled energy conduits along the outside edges. No characters, icons, floating objects or focal reactor in the middle.

Composition: opaque full-bleed wide 16:9, at least 1536px wide. The central 60% width and central 70% height must be a LARGE CALM EMPTY dark navy #0E1020 area with no lights, structures, particles, beams, bright perspective vanishing point, lines or detail; a big join code will later be overlaid there by the app, but DO NOT DRAW any code, text, digits, UI or placeholder. Any floor perspective stays dark and only along the bottom outer edge. Architecture and all violet highlights confined to outer left/right 20% edges. Restrained border framing composition, centre deliberately plain and very low contrast, not an action scene.
```

## Round 4 — approved-design pose expansion and two revisions (2026-11-17)

Round 3 was approved with two fixes. This batch replaces `maths-extension-1-boss-idle` with a more substantial central fractal mass, replaces `icons/timer` with a pale-face/high-contrast variant, and adds hurt and defeated poses for all six bosses. Earlier round 3 entries and its review sheet are historical; the two replaced assets are now described here. The other five idle masters and web copies are unchanged.

- Date for every generation/edit: **2026-11-17** (Australia/Sydney).
- Tool: built-in **`image_gen.imagegen`** (`image_gen__imagegen`), with transparent background requested in every call. The tool does not expose its exact underlying model/version.
- Every pose call supplied its own idle PNG via `referenced_image_paths`. Extension 1 poses use the **revised round 4 idle**, not the thin round 3 design. Revisions used the previous round 3 asset as their edit target. Original round 3 versions remain recoverable from commit `f20260f`.
- All generated PNG masters are saved unchanged; all new/revised boss web copies are 512 × 512 RGBA (2× for display at 256px) and the timer is 96 × 96 RGBA (2× for display at 48px; also reviewed at 24px). Pillow resizes with Lanczos; bosses use lossy WebP with preserved alpha and timer uses lossless WebP. Delivery inventory below records actual sizes and bytes.
- Standard pose count correction: the initial pose generation added a fourth cube in the left tray. A targeted second edit used both idle and initial pose images, restoring **three left / six right**. Both prompt stages and correction-reference hashes are recorded below; discarded initial candidates are not shipped.
- Review sheet: `art/review/round4-sheet.png`, 1800 × 3320 RGB, composed with Pillow on `#0E1020`, one subject per row and idle/hurt/defeated columns. Labels use DejaVu Sans outside artwork. The corrected timer is shown at native **96px and 24px from the delivered WebP**. Round 3 sheet remains unchanged for historical comparison.
- Reviewed for design continuity, outline/rendering consistency, subject colours, complete framing, pose distinction and lack of in-art text/logos. Hurt states recoil; defeated states settle and reduce energy while retaining their components. Palette hex values are prompt targets with shading. This remains decorative game art, not a teaching diagram. Awaiting owner review.

### Round 4 delivery inventory

| Asset | Master size | Web size | Web bytes |
|---|---|---|---:|
| `bosses/maths-extension-1-boss-idle` | 1254 × 1254 | 512 × 512 | 38,128 |
| `icons/timer` | 1254 × 1254 | 96 × 96 | 6,254 |
| `bosses/biology-boss-hurt` | 1254 × 1254 | 512 × 512 | 36,922 |
| `bosses/biology-boss-defeated` | 1254 × 1254 | 512 × 512 | 26,860 |
| `bosses/chemistry-boss-hurt` | 1254 × 1254 | 512 × 512 | 52,922 |
| `bosses/chemistry-boss-defeated` | 1254 × 1254 | 512 × 512 | 43,896 |
| `bosses/physics-boss-hurt` | 1254 × 1254 | 512 × 512 | 54,438 |
| `bosses/physics-boss-defeated` | 1254 × 1254 | 512 × 512 | 29,304 |
| `bosses/maths-standard-boss-hurt` | 1254 × 1254 | 512 × 512 | 49,738 |
| `bosses/maths-standard-boss-defeated` | 1254 × 1254 | 512 × 512 | 31,322 |
| `bosses/maths-advanced-boss-hurt` | 1254 × 1254 | 512 × 512 | 43,858 |
| `bosses/maths-advanced-boss-defeated` | 1254 × 1254 | 512 × 512 | 24,236 |
| `bosses/maths-extension-1-boss-hurt` | 1254 × 1254 | 512 × 512 | 36,262 |
| `bosses/maths-extension-1-boss-defeated` | 1254 × 1254 | 512 × 512 | 26,166 |

### Round 4 reference inventory

SHA-256 identifies the exact supplied images, including superseded edit targets.

| Reference | SHA-256 |
|---|---|
| `art/masters/bosses/biology-boss-idle.png` (pose reference) | `377579bd276ecf36d25d625a6af45b92c25d7a57e9bf748bb68dc11814c4b859` |
| `art/masters/bosses/chemistry-boss-idle.png` (pose reference) | `528d32ee8afe9df8a59e457497844f02ab70492b1726556a78dc5f2b409153f8` |
| `art/masters/bosses/physics-boss-idle.png` (pose reference) | `c0b03485772fdc020990033278d9c6b7b9c8ffde00e0a5c5918b333b8b3235bd` |
| `art/masters/bosses/maths-standard-boss-idle.png` (pose reference) | `082bff165d0bc7db9f762e95ee628dfad1cc50b53bf9a8fc96ed7665cac1df80` |
| `art/masters/bosses/maths-advanced-boss-idle.png` (pose reference) | `f2e9fe1712190b5fcda2c56ed737a33c29bc06489cf266e5c67653dd346700ee` |
| `art/masters/bosses/maths-extension-1-boss-idle.png` (pose reference) | `8cadb4a37b98cda50a87a196dd5fbf383efc4d227359f85c24c15d9c885a29ef` |
| `art/masters/bosses/maths-extension-1-boss-idle.png` at `f20260f` (revision edit target) | `58947a48a9141fb979776091304fbd92d8cc2433c617ef189c8d825cc069b7c1` |
| `art/masters/icons/timer.png` at `f20260f` (revision edit target) | `8faa4ee011c8cadb6fa88b1e3496a8f5ef26f9c4ddb4aca36c1a47b9aecb3b9a` |
| Initial `maths-standard-boss-hurt` candidate (discarded; correction edit target) | `fe7051b413e51c5f020f08b23bfadcd135b874d2434b4b01529075640aca2d6d` |
| Initial `maths-standard-boss-defeated` candidate (discarded; correction edit target) | `96849431c94f5983185fe2459e673acb7b14fea7e565dce9dd2c4873edcd0572` |

### Round 4: maths-extension-1-boss-idle

- Master: `art/masters/bosses/maths-extension-1-boss-idle.png`.
- Web copy: `public/art/bosses/maths-extension-1-boss-idle.webp`.
- Date: 2026-11-17 (Australia/Sydney).
- Tool/model: built-in `image_gen.imagegen`; exact model not exposed.
- Style: 1 (stylised hero); accent `#E8447F`.
- Input image 1: `art/masters/bosses/maths-extension-1-boss-idle.png` (round 3 version, from commit `f20260f`).
- Exact submitted prompt:

```text
Stylised hero game art for a mature teen audience (16-18). Cel-shaded, crisp dark
outlines, sharp angular silhouette, deep navy/charcoal forms with a single glowing
#E8447F accent, light painterly texture, dramatic rim light, readable
at card size. Original design.

Use case: precise-object-edit. Input image 1 is the existing Maths Extension 1 idle boss, supplied as the design/style reference and edit target. Revise this one design only: it is currently too thin and sparse. Retain its dark navy/charcoal triangular tetrahedral facets, pink #E8447F central trajectory seams, self-similar geometric recursion, crisp dark outline weight, lighting and cel-shaded materials. Build a BROAD SOLID CENTRAL MASS from a compact interlocking cluster of three large tetrahedral volumes, approximately 55% of the overall silhouette width and height; very little empty space within this central body. Thick tapering geometric extensions curve around this body in a compact angular S, and two short recursive triangular branches grow from its upper shoulders. Geometric menacing construct, no head, face or humanoid torso. Few large self-similar volumes with short attached branching, not a wispy chain or wireframe. Strong substantial silhouette that has comparable visual weight to the other bosses at 256px.

Pose: idle, stable suspended form; centered isolated complete body on a square canvas at least 1024px. Preserve transparent background, generous clear padding, no floor or ground shadow. Palette #0E1020 #171A31 #22264A #07080F, neutral highlights #9A9CC0 #F2F2FA, single saturated accent #E8447F. Exclude all text, letters, numbers, logos, watermark, equations, existing franchise likenesses, cute/chibi/toy forms and extra scenery.
```

### Round 4: timer

- Master: `art/masters/icons/timer.png`.
- Web copy: `public/art/icons/timer.webp`.
- Date: 2026-11-17 (Australia/Sydney).
- Tool/model: built-in `image_gen.imagegen`; exact model not exposed.
- Style: 2 (graphic emblem); accent `#F2B530`.
- Input image 1: `art/masters/icons/timer.png` (round 3 version, from commit `f20260f`).
- Exact submitted prompt:

```text
Flat geometric vector emblem, thick #07080F outline, 2-3 flat tones, deep navy base
with a single #F2B530 accent, angular/hexagonal framing, no gradients beyond one
subtle highlight, readable at 24px. Original design.

Use case: precise-object-edit. Input image 1 is the current timer icon, supplied as edit target and exact shape reference. Fix its dark-on-dark legibility while keeping its angular stopwatch body, top stem, octagonal rim, broad two clock hands and mature geometric construction. Change the entire inner clock FACE to solid pale #F2F2FA; make its two thick hands and centre hub dark #07080F for high contrast. Add a broad bright gold #F2B530 rim band around the face to separate the silhouette clearly from a #0E1020 app background; keep a dark outline and top stem with a pale highlight. Only three main tones: pale face, gold rim, navy/dark outline and hands. No tiny ticks, numbers, letters or small detail. Ensure the clock face and both hands remain immediately recognisable at 24px.

Centered isolated one icon on square canvas at least 1024px, occupying 80% of canvas with clear padding, genuinely transparent background, preserve alpha. No text, numbers, logos, watermark, gradient, 3D bevel, scenery, shadows outside the subject or cute/toy styling. Original design.
```

### Round 4: biology-boss-hurt

- Master: `art/masters/bosses/biology-boss-hurt.png`.
- Web copy: `public/art/bosses/biology-boss-hurt.webp`.
- Date: 2026-11-17 (Australia/Sydney).
- Tool/model: built-in `image_gen.imagegen`; exact model not exposed.
- Style: 1 (stylised hero); accent `#1FB070`.
- Input image 1: `art/masters/bosses/biology-boss-idle.png` (current idle, exact identity/style reference).
- Exact submitted prompt:

```text
Stylised hero game art for a mature teen audience (16-18). Cel-shaded, crisp dark
outlines, sharp angular silhouette, deep navy/charcoal forms with a single glowing
#1FB070 accent, light painterly texture, dramatic rim light, readable
at card size. Original design.

Use case: identity-preserve. Input image 1 is this boss's approved idle PNG and is the exact identity, design, proportions, outline-weight, palette and material reference. Produce ONE alternate pose of THIS SAME boss, not a new design. Preserve the exact navy chitinous cell-colony body, translucent green membrane enclosing one helix, three spore sacs and splayed articulated tendrils.

Change ONLY articulation/posture and energy intensity to show the hurt state. Recoil sideways in a tight defensive crouch: the front tendril draws inward, membrane compresses slightly, three spore stalks bend back together, nucleus intact. A short interruption in the green internal glow indicates pain. No gore or new objects.

Invariants: same component shapes/counts, same facet construction and thickness of dark #07080F outlines, same cel-shading, light texture, camera side and neutral highlights. Keep the reference base colours with the sole accent #1FB070; no red damage flash, white washout or palette swaps. Do not change it into a humanoid or invent a face.

Composition: one complete full-body boss on square canvas at least 1024px; same camera scale as idle, clear padding all around, no clipping, genuinely transparent background. No scene, floor, ground shadow, labels, UI, motion lines, impact stars or detached decorative particles. No text, numbers, equations, logos, watermark, franchise likenesses, cute or toy styling. Decorative game art, not a scientific diagram.
```

### Round 4: biology-boss-defeated

- Master: `art/masters/bosses/biology-boss-defeated.png`.
- Web copy: `public/art/bosses/biology-boss-defeated.webp`.
- Date: 2026-11-17 (Australia/Sydney).
- Tool/model: built-in `image_gen.imagegen`; exact model not exposed.
- Style: 1 (stylised hero); accent `#1FB070`.
- Input image 1: `art/masters/bosses/biology-boss-idle.png` (current idle, exact identity/style reference).
- Exact submitted prompt:

```text
Stylised hero game art for a mature teen audience (16-18). Cel-shaded, crisp dark
outlines, sharp angular silhouette, deep navy/charcoal forms with a single glowing
#1FB070 accent, light painterly texture, dramatic rim light, readable
at card size. Original design.

Use case: identity-preserve. Input image 1 is this boss's approved idle PNG and is the exact identity, design, proportions, outline-weight, palette and material reference. Produce ONE alternate pose of THIS SAME boss, not a new design. Preserve the exact navy chitinous cell-colony body, translucent green membrane enclosing one helix, three spore sacs and splayed articulated tendrils.

Change ONLY articulation/posture and energy intensity to show the defeated state. Slumped low with its main membrane body resting near the bottom, existing tendrils folded underneath and three spore sacs drooping down beside the body. Helix and membranes intact, green glow reduced but still recognisably green; inert and unmistakably defeated. No gore, no missing or newly invented parts.

Invariants: same component shapes/counts, same facet construction and thickness of dark #07080F outlines, same cel-shading, light texture, camera side and neutral highlights. Keep the reference base colours with the sole accent #1FB070; no red damage flash, white washout or palette swaps. Do not change it into a humanoid or invent a face.

Composition: one complete full-body boss on square canvas at least 1024px; same camera scale as idle, clear padding all around, no clipping, genuinely transparent background. No scene, floor, ground shadow, labels, UI, motion lines, impact stars or detached decorative particles. No text, numbers, equations, logos, watermark, franchise likenesses, cute or toy styling. Decorative game art, not a scientific diagram.
```

### Round 4: chemistry-boss-hurt

- Master: `art/masters/bosses/chemistry-boss-hurt.png`.
- Web copy: `public/art/bosses/chemistry-boss-hurt.webp`.
- Date: 2026-11-17 (Australia/Sydney).
- Tool/model: built-in `image_gen.imagegen`; exact model not exposed.
- Style: 1 (stylised hero); accent `#FF6A2B`.
- Input image 1: `art/masters/bosses/chemistry-boss-idle.png` (current idle, exact identity/style reference).
- Exact submitted prompt:

```text
Stylised hero game art for a mature teen audience (16-18). Cel-shaded, crisp dark
outlines, sharp angular silhouette, deep navy/charcoal forms with a single glowing
#FF6A2B accent, light painterly texture, dramatic rim light, readable
at card size. Original design.

Use case: identity-preserve. Input image 1 is this boss's approved idle PNG and is the exact identity, design, proportions, outline-weight, palette and material reference. Produce ONE alternate pose of THIS SAME boss, not a new design. Preserve the exact orange reaction chamber, glass hexagonal vessel, dark clamps, four crawler legs, cubic crystal lattice on the left and two glass distillation necks above/right.

Change ONLY articulation/posture and energy intensity to show the hurt state. Recoil with vessel tilting backward slightly, front legs pulling inward while rear legs brace; glass and crystal lattice intact. Internal orange flame contracts unevenly as if reaction destabilised. Two necks remain attached and same shape. No new anatomy or explosions.

Invariants: same component shapes/counts, same facet construction and thickness of dark #07080F outlines, same cel-shading, light texture, camera side and neutral highlights. Keep the reference base colours with the sole accent #FF6A2B; no red damage flash, white washout or palette swaps. Do not change it into a humanoid or invent a face.

Composition: one complete full-body boss on square canvas at least 1024px; same camera scale as idle, clear padding all around, no clipping, genuinely transparent background. No scene, floor, ground shadow, labels, UI, motion lines, impact stars or detached decorative particles. No text, numbers, equations, logos, watermark, franchise likenesses, cute or toy styling. Decorative game art, not a scientific diagram.
```

### Round 4: chemistry-boss-defeated

- Master: `art/masters/bosses/chemistry-boss-defeated.png`.
- Web copy: `public/art/bosses/chemistry-boss-defeated.webp`.
- Date: 2026-11-17 (Australia/Sydney).
- Tool/model: built-in `image_gen.imagegen`; exact model not exposed.
- Style: 1 (stylised hero); accent `#FF6A2B`.
- Input image 1: `art/masters/bosses/chemistry-boss-idle.png` (current idle, exact identity/style reference).
- Exact submitted prompt:

```text
Stylised hero game art for a mature teen audience (16-18). Cel-shaded, crisp dark
outlines, sharp angular silhouette, deep navy/charcoal forms with a single glowing
#FF6A2B accent, light painterly texture, dramatic rim light, readable
at card size. Original design.

Use case: identity-preserve. Input image 1 is this boss's approved idle PNG and is the exact identity, design, proportions, outline-weight, palette and material reference. Produce ONE alternate pose of THIS SAME boss, not a new design. Preserve the exact orange reaction chamber, glass hexagonal vessel, dark clamps, four crawler legs, cubic crystal lattice on the left and two glass distillation necks above/right.

Change ONLY articulation/posture and energy intensity to show the defeated state. Settled low on its folded four crawler legs, entire same glass vessel slumped gently to one side, both distillation necks and crystal lattice remain attached and intact. Internal flame has subsided to a small dull orange ember in vessel. Clearly powered down; no shattered parts or new objects.

Invariants: same component shapes/counts, same facet construction and thickness of dark #07080F outlines, same cel-shading, light texture, camera side and neutral highlights. Keep the reference base colours with the sole accent #FF6A2B; no red damage flash, white washout or palette swaps. Do not change it into a humanoid or invent a face.

Composition: one complete full-body boss on square canvas at least 1024px; same camera scale as idle, clear padding all around, no clipping, genuinely transparent background. No scene, floor, ground shadow, labels, UI, motion lines, impact stars or detached decorative particles. No text, numbers, equations, logos, watermark, franchise likenesses, cute or toy styling. Decorative game art, not a scientific diagram.
```

### Round 4: physics-boss-hurt

- Master: `art/masters/bosses/physics-boss-hurt.png`.
- Web copy: `public/art/bosses/physics-boss-hurt.webp`.
- Date: 2026-11-17 (Australia/Sydney).
- Tool/model: built-in `image_gen.imagegen`; exact model not exposed.
- Style: 1 (stylised hero); accent `#2F7BEA`.
- Input image 1: `art/masters/bosses/physics-boss-idle.png` (current idle, exact identity/style reference).
- Exact submitted prompt:

```text
Stylised hero game art for a mature teen audience (16-18). Cel-shaded, crisp dark
outlines, sharp angular silhouette, deep navy/charcoal forms with a single glowing
#2F7BEA accent, light painterly texture, dramatic rim light, readable
at card size. Original design.

Use case: identity-preserve. Input image 1 is this boss's approved idle PNG and is the exact identity, design, proportions, outline-weight, palette and material reference. Produce ONE alternate pose of THIS SAME boss, not a new design. Preserve the exact toroidal reactor with three blue wound coil sections, central gravity-well opening, two large separate curved crescent vanes above/below and three small orbiting blue charges.

Change ONLY articulation/posture and energy intensity to show the hurt state. Recoil with the complete toroid tilted abruptly to the left, existing two crescent vanes skewed slightly out of stable alignment; three charges drawn nearer ring on a distorted blue elliptical field. Coils remain fully attached. A visible unstable posture, not a redesign or damage explosion.

Invariants: same component shapes/counts, same facet construction and thickness of dark #07080F outlines, same cel-shading, light texture, camera side and neutral highlights. Keep the reference base colours with the sole accent #2F7BEA; no red damage flash, white washout or palette swaps. Do not change it into a humanoid or invent a face.

Composition: one complete full-body boss on square canvas at least 1024px; same camera scale as idle, clear padding all around, no clipping, genuinely transparent background. No scene, floor, ground shadow, labels, UI, motion lines, impact stars or detached decorative particles. No text, numbers, equations, logos, watermark, franchise likenesses, cute or toy styling. Decorative game art, not a scientific diagram.
```

### Round 4: physics-boss-defeated

- Master: `art/masters/bosses/physics-boss-defeated.png`.
- Web copy: `public/art/bosses/physics-boss-defeated.webp`.
- Date: 2026-11-17 (Australia/Sydney).
- Tool/model: built-in `image_gen.imagegen`; exact model not exposed.
- Style: 1 (stylised hero); accent `#2F7BEA`.
- Input image 1: `art/masters/bosses/physics-boss-idle.png` (current idle, exact identity/style reference).
- Exact submitted prompt:

```text
Stylised hero game art for a mature teen audience (16-18). Cel-shaded, crisp dark
outlines, sharp angular silhouette, deep navy/charcoal forms with a single glowing
#2F7BEA accent, light painterly texture, dramatic rim light, readable
at card size. Original design.

Use case: identity-preserve. Input image 1 is this boss's approved idle PNG and is the exact identity, design, proportions, outline-weight, palette and material reference. Produce ONE alternate pose of THIS SAME boss, not a new design. Preserve the exact toroidal reactor with three blue wound coil sections, central gravity-well opening, two large separate curved crescent vanes above/below and three small orbiting blue charges.

Change ONLY articulation/posture and energy intensity to show the defeated state. Entire ring rests low at a shallow angle, both crescent vanes drooped down close beside it, three charge spheres settled adjacent to the coil. Blue arcs lose their extended orbit and hang slack close to the entity, blue coil light dimmed. Keep all same components and central opening; unmistakably inert, no missing parts.

Invariants: same component shapes/counts, same facet construction and thickness of dark #07080F outlines, same cel-shading, light texture, camera side and neutral highlights. Keep the reference base colours with the sole accent #2F7BEA; no red damage flash, white washout or palette swaps. Do not change it into a humanoid or invent a face.

Composition: one complete full-body boss on square canvas at least 1024px; same camera scale as idle, clear padding all around, no clipping, genuinely transparent background. No scene, floor, ground shadow, labels, UI, motion lines, impact stars or detached decorative particles. No text, numbers, equations, logos, watermark, franchise likenesses, cute or toy styling. Decorative game art, not a scientific diagram.
```

### Round 4: maths-standard-boss-hurt

- Master: `art/masters/bosses/maths-standard-boss-hurt.png`.
- Web copy: `public/art/bosses/maths-standard-boss-hurt.webp`.
- Date: 2026-11-17 (Australia/Sydney).
- Tool/model: built-in `image_gen.imagegen`; exact model not exposed.
- Style: 1 (stylised hero); accent `#F2B530`.
- Input image 1: `art/masters/bosses/maths-standard-boss-idle.png` (current idle, exact identity/style reference).
- Exact initial pose-generation prompt:

```text
Stylised hero game art for a mature teen audience (16-18). Cel-shaded, crisp dark
outlines, sharp angular silhouette, deep navy/charcoal forms with a single glowing
#F2B530 accent, light painterly texture, dramatic rim light, readable
at card size. Original design.

Use case: identity-preserve. Input image 1 is this boss's approved idle PNG and is the exact identity, design, proportions, outline-weight, palette and material reference. Produce ONE alternate pose of THIS SAME boss, not a new design. Preserve the exact angular balance construct: dark broad beam with gold divisions, central triangular gold brace and dark upright support on stepped plinth, two triangular suspended trays, three cubes on one tray and six on the other.

Change ONLY articulation/posture and energy intensity to show the hurt state. Whole construct recoils off balance: beam tips about 20 degrees, one tray rises and the other drops, same three and six cubes remain in their respective trays, plinth and triangular brace intact. Gold accents flicker faintly. No limbs, eyes or new parts.

Invariants: same component shapes/counts, same facet construction and thickness of dark #07080F outlines, same cel-shading, light texture, camera side and neutral highlights. Keep the reference base colours with the sole accent #F2B530; no red damage flash, white washout or palette swaps. Do not change it into a humanoid or invent a face.

Composition: one complete full-body boss on square canvas at least 1024px; same camera scale as idle, clear padding all around, no clipping, genuinely transparent background. No scene, floor, ground shadow, labels, UI, motion lines, impact stars or detached decorative particles. No text, numbers, equations, logos, watermark, franchise likenesses, cute or toy styling. Decorative game art, not a scientific diagram.
```

- Final count-correction inputs, in order: `art/masters/bosses/maths-standard-boss-idle.png` (idle), initial generated hurt image (discarded intermediate; SHA-256 in reference inventory).
- Exact final correction prompt:

```text
Stylised hero game art for a mature teen audience (16-18). Cel-shaded, crisp dark
outlines, sharp angular silhouette, deep navy/charcoal forms with a single glowing
#F2B530 accent, light painterly texture, dramatic rim light, readable
at card size. Original design.

Use case: precise-object-edit. Input image 1 is the approved idle design reference. Input image 2 is the hurt pose EDIT TARGET. Keep input image 2 exactly: its pose, framing, body geometry, tilted or collapsed beam, trays, outline weight, highlights, base, palette, transparent background. Change ONLY the cube count in the LEFT tray to match the idle image. There must be exactly THREE cubes in the left tray: TWO cubes on the bottom row and ONE cube resting above, no third cube on the bottom row. The RIGHT tray must contain exactly SIX cubes: THREE bottom, TWO middle, ONE on top. Preserve the pose target's other details and existing component designs. No extra cubes, no scattered cubes, no changes outside the trays. Keep the same #F2B530 gold and navy tones. One complete boss, transparent square PNG at least 1024px. No text, numbers, labels, symbols, scenery or logos.
```

### Round 4: maths-standard-boss-defeated

- Master: `art/masters/bosses/maths-standard-boss-defeated.png`.
- Web copy: `public/art/bosses/maths-standard-boss-defeated.webp`.
- Date: 2026-11-17 (Australia/Sydney).
- Tool/model: built-in `image_gen.imagegen`; exact model not exposed.
- Style: 1 (stylised hero); accent `#F2B530`.
- Input image 1: `art/masters/bosses/maths-standard-boss-idle.png` (current idle, exact identity/style reference).
- Exact initial pose-generation prompt:

```text
Stylised hero game art for a mature teen audience (16-18). Cel-shaded, crisp dark
outlines, sharp angular silhouette, deep navy/charcoal forms with a single glowing
#F2B530 accent, light painterly texture, dramatic rim light, readable
at card size. Original design.

Use case: identity-preserve. Input image 1 is this boss's approved idle PNG and is the exact identity, design, proportions, outline-weight, palette and material reference. Produce ONE alternate pose of THIS SAME boss, not a new design. Preserve the exact angular balance construct: dark broad beam with gold divisions, central triangular gold brace and dark upright support on stepped plinth, two triangular suspended trays, three cubes on one tray and six on the other.

Change ONLY articulation/posture and energy intensity to show the defeated state. Main beam and support have folded down at their existing pivot, both trays lowered and resting near the stepped plinth; original three and six cubes still present in their respective trays, no extra cubes. Angular brace and gold measuring divisions remain, gold glow subdued. Low collapsed inactive silhouette, same construct, no destruction or missing parts.

Invariants: same component shapes/counts, same facet construction and thickness of dark #07080F outlines, same cel-shading, light texture, camera side and neutral highlights. Keep the reference base colours with the sole accent #F2B530; no red damage flash, white washout or palette swaps. Do not change it into a humanoid or invent a face.

Composition: one complete full-body boss on square canvas at least 1024px; same camera scale as idle, clear padding all around, no clipping, genuinely transparent background. No scene, floor, ground shadow, labels, UI, motion lines, impact stars or detached decorative particles. No text, numbers, equations, logos, watermark, franchise likenesses, cute or toy styling. Decorative game art, not a scientific diagram.
```

- Final count-correction inputs, in order: `art/masters/bosses/maths-standard-boss-idle.png` (idle), initial generated defeated image (discarded intermediate; SHA-256 in reference inventory).
- Exact final correction prompt:

```text
Stylised hero game art for a mature teen audience (16-18). Cel-shaded, crisp dark
outlines, sharp angular silhouette, deep navy/charcoal forms with a single glowing
#F2B530 accent, light painterly texture, dramatic rim light, readable
at card size. Original design.

Use case: precise-object-edit. Input image 1 is the approved idle design reference. Input image 2 is the defeated pose EDIT TARGET. Keep input image 2 exactly: its pose, framing, body geometry, tilted or collapsed beam, trays, outline weight, highlights, base, palette, transparent background. Change ONLY the cube count in the LEFT tray to match the idle image. There must be exactly THREE cubes in the left tray: TWO cubes on the bottom row and ONE cube resting above, no third cube on the bottom row. The RIGHT tray must contain exactly SIX cubes: THREE bottom, TWO middle, ONE on top. Preserve the pose target's other details and existing component designs. No extra cubes, no scattered cubes, no changes outside the trays. Keep the same #F2B530 gold and navy tones. One complete boss, transparent square PNG at least 1024px. No text, numbers, labels, symbols, scenery or logos.
```

### Round 4: maths-advanced-boss-hurt

- Master: `art/masters/bosses/maths-advanced-boss-hurt.png`.
- Web copy: `public/art/bosses/maths-advanced-boss-hurt.webp`.
- Date: 2026-11-17 (Australia/Sydney).
- Tool/model: built-in `image_gen.imagegen`; exact model not exposed.
- Style: 1 (stylised hero); accent `#9B5CFF`.
- Input image 1: `art/masters/bosses/maths-advanced-boss-idle.png` (current idle, exact identity/style reference).
- Exact submitted prompt:

```text
Stylised hero game art for a mature teen audience (16-18). Cel-shaded, crisp dark
outlines, sharp angular silhouette, deep navy/charcoal forms with a single glowing
#9B5CFF accent, light painterly texture, dramatic rim light, readable
at card size. Original design.

Use case: identity-preserve. Input image 1 is this boss's approved idle PNG and is the exact identity, design, proportions, outline-weight, palette and material reference. Produce ONE alternate pose of THIS SAME boss, not a new design. Preserve the exact nested octahedral structure, four large separated navy outer facets, two smaller nested central octahedra and the single violet curved ribbon passing through the centre.

Change ONLY articulation/posture and energy intensity to show the hurt state. Outer four facets recoil asymmetrically away from centre by a small distance and tilt, nested octahedra remain the same size and shape, continuous violet ribbon flexes sharply around core. Unstable but intact. Preserve part count, rendering and original materials exactly.

Invariants: same component shapes/counts, same facet construction and thickness of dark #07080F outlines, same cel-shading, light texture, camera side and neutral highlights. Keep the reference base colours with the sole accent #9B5CFF; no red damage flash, white washout or palette swaps. Do not change it into a humanoid or invent a face.

Composition: one complete full-body boss on square canvas at least 1024px; same camera scale as idle, clear padding all around, no clipping, genuinely transparent background. No scene, floor, ground shadow, labels, UI, motion lines, impact stars or detached decorative particles. No text, numbers, equations, logos, watermark, franchise likenesses, cute or toy styling. Decorative game art, not a scientific diagram.
```

### Round 4: maths-advanced-boss-defeated

- Master: `art/masters/bosses/maths-advanced-boss-defeated.png`.
- Web copy: `public/art/bosses/maths-advanced-boss-defeated.webp`.
- Date: 2026-11-17 (Australia/Sydney).
- Tool/model: built-in `image_gen.imagegen`; exact model not exposed.
- Style: 1 (stylised hero); accent `#9B5CFF`.
- Input image 1: `art/masters/bosses/maths-advanced-boss-idle.png` (current idle, exact identity/style reference).
- Exact submitted prompt:

```text
Stylised hero game art for a mature teen audience (16-18). Cel-shaded, crisp dark
outlines, sharp angular silhouette, deep navy/charcoal forms with a single glowing
#9B5CFF accent, light painterly texture, dramatic rim light, readable
at card size. Original design.

Use case: identity-preserve. Input image 1 is this boss's approved idle PNG and is the exact identity, design, proportions, outline-weight, palette and material reference. Produce ONE alternate pose of THIS SAME boss, not a new design. Preserve the exact nested octahedral structure, four large separated navy outer facets, two smaller nested central octahedra and the single violet curved ribbon passing through the centre.

Change ONLY articulation/posture and energy intensity to show the defeated state. Four same outer facets sag down into a low resting cluster around both same nested octahedra, original violet ribbon lies slack through the structure, light reduced but still violet. Inactive collapsed geometric silhouette, no extra fragments, no new spheres, no missing parts.

Invariants: same component shapes/counts, same facet construction and thickness of dark #07080F outlines, same cel-shading, light texture, camera side and neutral highlights. Keep the reference base colours with the sole accent #9B5CFF; no red damage flash, white washout or palette swaps. Do not change it into a humanoid or invent a face.

Composition: one complete full-body boss on square canvas at least 1024px; same camera scale as idle, clear padding all around, no clipping, genuinely transparent background. No scene, floor, ground shadow, labels, UI, motion lines, impact stars or detached decorative particles. No text, numbers, equations, logos, watermark, franchise likenesses, cute or toy styling. Decorative game art, not a scientific diagram.
```

### Round 4: maths-extension-1-boss-hurt

- Master: `art/masters/bosses/maths-extension-1-boss-hurt.png`.
- Web copy: `public/art/bosses/maths-extension-1-boss-hurt.webp`.
- Date: 2026-11-17 (Australia/Sydney).
- Tool/model: built-in `image_gen.imagegen`; exact model not exposed.
- Style: 1 (stylised hero); accent `#E8447F`.
- Input image 1: `art/masters/bosses/maths-extension-1-boss-idle.png` (current idle, exact identity/style reference).
- Exact submitted prompt:

```text
Stylised hero game art for a mature teen audience (16-18). Cel-shaded, crisp dark
outlines, sharp angular silhouette, deep navy/charcoal forms with a single glowing
#E8447F accent, light painterly texture, dramatic rim light, readable
at card size. Original design.

Use case: identity-preserve. Input image 1 is this boss's approved idle PNG and is the exact identity, design, proportions, outline-weight, palette and material reference. Produce ONE alternate pose of THIS SAME boss, not a new design. Preserve the REVISED idle design exactly: broad solid central body of interlocking large navy tetrahedra, two compact recursive upper branch structures, tapering angular tail and pink trajectory seams with nodes. Do not revert to the earlier thin chain design.

Change ONLY articulation/posture and energy intensity to show the hurt state. Massive central geometric body twists and recoils to the left, two existing recursive branches draw inward, tail curls tighter below; pink seam momentarily uneven but follows the same facets and nodes. Central mass stays solid and substantial. Same part count and scale, no added limbs.

Invariants: same component shapes/counts, same facet construction and thickness of dark #07080F outlines, same cel-shading, light texture, camera side and neutral highlights. Keep the reference base colours with the sole accent #E8447F; no red damage flash, white washout or palette swaps. Do not change it into a humanoid or invent a face.

Composition: one complete full-body boss on square canvas at least 1024px; same camera scale as idle, clear padding all around, no clipping, genuinely transparent background. No scene, floor, ground shadow, labels, UI, motion lines, impact stars or detached decorative particles. No text, numbers, equations, logos, watermark, franchise likenesses, cute or toy styling. Decorative game art, not a scientific diagram.
```

### Round 4: maths-extension-1-boss-defeated

- Master: `art/masters/bosses/maths-extension-1-boss-defeated.png`.
- Web copy: `public/art/bosses/maths-extension-1-boss-defeated.webp`.
- Date: 2026-11-17 (Australia/Sydney).
- Tool/model: built-in `image_gen.imagegen`; exact model not exposed.
- Style: 1 (stylised hero); accent `#E8447F`.
- Input image 1: `art/masters/bosses/maths-extension-1-boss-idle.png` (current idle, exact identity/style reference).
- Exact submitted prompt:

```text
Stylised hero game art for a mature teen audience (16-18). Cel-shaded, crisp dark
outlines, sharp angular silhouette, deep navy/charcoal forms with a single glowing
#E8447F accent, light painterly texture, dramatic rim light, readable
at card size. Original design.

Use case: identity-preserve. Input image 1 is this boss's approved idle PNG and is the exact identity, design, proportions, outline-weight, palette and material reference. Produce ONE alternate pose of THIS SAME boss, not a new design. Preserve the REVISED idle design exactly: broad solid central body of interlocking large navy tetrahedra, two compact recursive upper branch structures, tapering angular tail and pink trajectory seams with nodes. Do not revert to the earlier thin chain design.

Change ONLY articulation/posture and energy intensity to show the defeated state. Broad same tetrahedral core slumps low at an angle, both original recursive branches droop inward beside it and original tail folds around its base. Pink trajectory glow reduced but still pink, core remains solid and intact. Compact heavy inactive silhouette, no new fragments or missing parts.

Invariants: same component shapes/counts, same facet construction and thickness of dark #07080F outlines, same cel-shading, light texture, camera side and neutral highlights. Keep the reference base colours with the sole accent #E8447F; no red damage flash, white washout or palette swaps. Do not change it into a humanoid or invent a face.

Composition: one complete full-body boss on square canvas at least 1024px; same camera scale as idle, clear padding all around, no clipping, genuinely transparent background. No scene, floor, ground shadow, labels, UI, motion lines, impact stars or detached decorative particles. No text, numbers, equations, logos, watermark, franchise likenesses, cute or toy styling. Decorative game art, not a scientific diagram.
```

## Round 5 — brand, home hero, impact and subject emblems (2026-11-17)

Round 4 was approved and integrated. This batch supplies the requested branding, Boss Battle home hero, hit overlay and six subject emblems for review. Style 1 is used for the hero; Style 2 for brand, FX and subject emblems. Brand wordmark text is explicitly authorised for this round; no text appears in the other artwork.

- Date of all generation and authoring: **2026-11-17** (Australia/Sydney).
- Image generation tool: built-in **`image_gen.imagegen`** (`image_gen__imagegen`); exact underlying model/version is not exposed. Each prompt is recorded below, including unused wordmark attempts. Transparent output was requested for every image except the opaque hero.
- Brand finishing: the generated emblem concept was rebuilt with simple original SVG polygons/paths. Raster-generated wordmark attempts had rough lettering and were discarded; the final wordmark uses clean **outlined DejaVu Sans Bold glyph paths** and the same rebuilt emblem. The delivered SVG is genuine geometry, with **no embedded bitmap, external font or external resource**. FontTools creates the outlines, CairoSVG rasterises PNG copies, Pillow produces WebP and app-icon composites. Font attribution/license is embedded in the wordmark SVG and preserved in `art/masters/brand/DEJAVU-LICENSE.txt`.
- Reproducible brand source: `art/masters/brand/build-brand.py` (requires FontTools, CairoSVG, Pillow and system DejaVu Sans Bold). Final brand masters: `art/masters/brand/hsc-legends-wordmark.svg`, `art/masters/brand/hsc-legends-wordmark.png` (2400px wide), `art/masters/brand/hsc-legends-emblem.svg`, `art/masters/brand/hsc-legends-emblem.png` (1024px square). PNG brand masters are rasterisations of the final vectors, not unmodified image-tool outputs.
- Wordmark deliveries: `public/art/brand/hsc-legends-wordmark.svg`, `.png` (1200px wide, transparent) and `.webp` (lossless, transparent).
- Emblem deliveries: **`public/icon-192.png`**, **`public/icon-512.png`**, **`public/apple-touch-icon.png`** (180px), **`public/favicon-32.png`**. These four root public paths were explicitly requested as exceptions to the normal art-only path scope. Each is an opaque square on `#0E1020`, with consistent clear margin and no baked rounded corners. The emblem is also reviewed at 16px by downsampling the 32px delivery.
- Hero, FX and subject-emblem PNG masters are copied unchanged from tool output. Pillow/Lanczos creates web copies: hero **1600 × 900** (centre fitted from near-16:9), impact **256 × 256**, six subject emblems **96 × 96**. All new WebP copies are below 60,000 bytes. Hero uses WebP quality 58, method 6; effect/icons/wordmark use lossless WebP with alpha preserved.
- Review sheet: **`art/review/round5-sheet.png`**, 1800 × 2220 RGB, Pillow composition on **`#0E1020`**, DejaVu Sans labels outside artwork. It shows the wordmark, all app-icon sizes (512px shown at 256px; 192px and 180px native), emblem at **native 32px and 16px**, native 256px impact, delivered hero, and subject emblems enlarged plus native 96px copies.
- Visual review: correct wordmark spelling, sharp geometry, recognisable small emblem, students seen from behind without facial focus, reference-matched towering Chemistry boss, calm dark left hero area for headline, distinct subject motifs, transparent effect/icons and no unintended in-art text. Palette hues in generated art are prompt targets with shading. Decorative game art only, not scientific diagrams. Awaiting owner review; app code is outside this batch.

### Round 5 delivery inventory

| Delivered path | Size | Bytes |
|---|---|---:|
| `public/art/keyart/home-hero.webp` | 1600 × 900 | 58,362 |
| `public/art/fx/impact.webp` | 256 × 256 | 30,952 |
| `public/art/icons/subject-biology.webp` | 96 × 96 | 9,068 |
| `public/art/icons/subject-chemistry.webp` | 96 × 96 | 9,712 |
| `public/art/icons/subject-physics.webp` | 96 × 96 | 8,764 |
| `public/art/icons/subject-maths-standard.webp` | 96 × 96 | 10,054 |
| `public/art/icons/subject-maths-advanced.webp` | 96 × 96 | 7,866 |
| `public/art/icons/subject-maths-extension-1.webp` | 96 × 96 | 8,120 |
| `public/icon-192.png` | 192 × 192 | 4,493 |
| `public/icon-512.png` | 512 × 512 | 12,353 |
| `public/apple-touch-icon.png` | 180 × 180 | 4,390 |
| `public/favicon-32.png` | 32 × 32 | 882 |
| `public/art/brand/hsc-legends-wordmark.svg` | 1822 × 320 (SVG units) | 6,532 |
| `public/art/brand/hsc-legends-wordmark.png` | 1200 × 211 | 25,251 |
| `public/art/brand/hsc-legends-wordmark.webp` | 1200 × 211 | 9,550 |

### Round 5 reference inventory

SHA-256 identifies exact source images supplied to generation calls. Generated brand concepts are not final vector masters.

| Reference | SHA-256 |
|---|---|
| `art/masters/bosses/chemistry-boss-idle.png` | `528d32ee8afe9df8a59e457497844f02ab70492b1726556a78dc5f2b409153f8` |
| `art/masters/bosses/biology-boss-idle.png` | `377579bd276ecf36d25d625a6af45b92c25d7a57e9bf748bb68dc11814c4b859` |
| `art/masters/icons/shield.png` | `a8b7db6191054c3e73631207b5f84f75c5df9733005e0d3b3aa722543d9f2ddf` |
| `art/masters/bosses/physics-boss-idle.png` | `c0b03485772fdc020990033278d9c6b7b9c8ffde00e0a5c5918b333b8b3235bd` |
| `art/masters/bosses/maths-standard-boss-idle.png` | `082bff165d0bc7db9f762e95ee628dfad1cc50b53bf9a8fc96ed7665cac1df80` |
| `art/masters/bosses/maths-advanced-boss-idle.png` | `f2e9fe1712190b5fcda2c56ed737a33c29bc06489cf266e5c67653dd346700ee` |
| `art/masters/bosses/maths-extension-1-boss-idle.png` | `8cadb4a37b98cda50a87a196dd5fbf383efc4d227359f85c24c15d9c885a29ef` |
| `Generated emblem concept` | `78e8348f1ebacbf8039fc7145c24e26d1983ba9086aef82ab2e9a5145d0cae1b` |
| `Discarded initial raster wordmark` | `52799884f263e1591f4b6e3acf97f52f037c035cda12aeb0cdb87ca611c82bd6` |
| `Discarded cleanup raster wordmark` | `c55a1fc5c459fe99796919bc78d2a0bba785f076e31af75423c7528b1f403090` |

### Round 5 brand: emblem concept and final production geometry

- Prompt/tool date: 2026-11-17; built-in `image_gen.imagegen`, exact model not exposed.
- Generated concept: no input images. Not shipped as the final master; its SHA-256 appears in the reference inventory.
- Final geometry: violet `#6E5BFF` angular hexagonal tile, pale `#F2F2FA` mirrored book planes, `#07080F` outline. Hand-authored SVG paths/polygons follow the generated concept and remove gradient/edge noise. Master and delivery paths are listed above.
- Exact concept prompt:

```text
Flat geometric vector emblem, thick #07080F outline, 2-3 flat tones, deep navy base
with a single #6E5BFF accent, angular/hexagonal framing, no gradients beyond one
subtle highlight, readable at 24px. Original design.

Use case: stylized-concept. Mature visual direction for HSC students aged 16–18. Original design only, no franchise characters, logos or signature likenesses. No kawaii/chibi, huge cartoon eyes, smiling objects, toy shapes, candy pastels or primary-school decoration. Neutrals #0E1020 #171A31 #22264A #07080F #9A9CC0 #F2F2FA. Use only the specified saturated accent. No watermarks or signatures. Decorative game art, not scientific diagrams.

Asset type: original HSC Legends square app emblem. One simple powerful geometric mark: a broad solid violet hexagonal shield-like tile with clipped upper corners, containing a single pale #F2F2FA angular open-book/ascending-chevron shape made from TWO thick connected mirrored planes, a clear central V notch. Abstract academic ascent, bold mature competitive-game feel. The two pale planes must be broad and simple, no thin lines, no small cutouts. Violet #6E5BFF body, pale central shape, dark outline only. NOT a lightning bolt, crown, star or a known logo. No letters, initials, numbers or text.

Square canvas at least 1024px. One isolated emblem centered with about 12% clear transparent padding around all sides. Genuinely transparent background outside emblem. Near-flat geometric shapes with crisp edges, no gradients or texture, no shadows, no ornaments, no mockup, no border beyond emblem. Must have a strong recognisable silhouette at 32px AND 16px.
```

### Round 5 brand: HSC Legends wordmark

- Final source: `art/masters/brand/build-brand.py`; true SVG and raster masters/deliveries listed above. Date: 2026-11-17. Tool/model: deterministic FontTools/CairoSVG/Pillow authoring, no image model for final lettering.
- Recipe: reproduce the emblem as original flat polygons; place it left of the exact single-line text **HSC Legends**, with generous separation; convert DejaVu Sans Bold glyphs to SVG paths; pale `#F2F2FA` type, violet emblem, transparent canvas for a dark-background lockup. Rasterise at 2400px for master and 1200px for delivery; create lossless WebP. All lettering is outlined, so no installed font is needed for display.
- Two raster wordmark attempts were generated with built-in `image_gen.imagegen` (exact model not exposed), reviewed and discarded because of rough edges. Initial input: generated emblem concept; cleanup input: initial generated wordmark. Their image hashes are recorded below.
- Exact initial attempt prompt:

```text
Flat geometric vector emblem, thick #07080F outline, 2-3 flat tones, deep navy base
with a single #6E5BFF accent, angular/hexagonal framing, no gradients beyond one
subtle highlight, readable at 24px. Original design.

Use case: logo-brand. Input image 1 is the original HSC Legends emblem; use it as the precise symbol and palette reference. Create a HORIZONTAL dark-background brand lockup: this same simple violet hexagonal emblem with two pale open-book planes at LEFT, followed by the exact text "HSC Legends" in one clean horizontal line to the right. Text must read precisely HSC Legends (H S C, a space, L e g e n d s), no extra text or tagline. Bold slightly condensed angular sans-serif letterforms, mature confident competitive-game branding, crisp geometry, high legibility. Both words are pale #F2F2FA; violet #6E5BFF only on the emblem and one restrained small geometric cut if needed. All letters fully formed and distinct, no overlapping ligatures, no crown, lightning bolt, glow or ornament. Use the supplied emblem unchanged in design. No existing brand or franchise imitation.

Wide 3:1 or wider transparent canvas at least 1800px wide. Balanced proportions: emblem height comparable to letter cap height with a modest gap; single baseline, no wrapping or stacked words. The entire lockup occupies most of width with clear outer margins. Genuinely transparent background; designed to sit on #0E1020. No backdrop, mockup, shadows, watermark or signature. Render only this original emblem plus the exact requested wordmark; this explicit wordmark text is the sole exception to the project's no-text-in-art rule.
```

- Exact cleanup attempt prompt:

```text
Flat geometric vector emblem, thick #07080F outline, 2-3 flat tones, deep navy base
with a single #6E5BFF accent, angular/hexagonal framing, no gradients beyond one
subtle highlight, readable at 24px. Original design.

Use case: precise-object-edit. Input image 1 is the HSC Legends horizontal wordmark edit target. Preserve its exact emblem, lettering, spelling "HSC Legends", single baseline, proportions and layout. Clean the rendering completely: remove ALL stray white flecks, ragged pixels, paint splatter, distress, grunge, rough holes, ghost edges and texture. Letter surfaces must be solid uniform pale #F2F2FA, with perfectly smooth crisp clean geometry and normal counters only. Violet emblem surfaces #6E5BFF and white book planes must be flat clean fills. This is precision flat vector-like logo rendering, NOT distressed game lettering or painted text. Only the exact lockup remains, zero stray pixels around letters. No additional labels, shadows, glow or markings. Genuinely transparent background, preserve transparency. Same wide layout, at least 1800px wide.
```

### Round 5: home-hero

- Master: `art/masters/keyart/home-hero.png`.
- Delivery: `public/art/keyart/home-hero.webp`.
- Date: 2026-11-17 (Australia/Sydney).
- Tool/model: built-in `image_gen.imagegen`; exact model not exposed.
- Style: 1 (stylised hero); accent: `#FF6A2B`.
- Input references: image 1: `art/masters/bosses/chemistry-boss-idle.png`.
- Exact prompt:

```text
Stylised hero game art for a mature teen audience (16-18). Cel-shaded, crisp dark
outlines, sharp angular silhouette, deep navy/charcoal forms with a single glowing
#FF6A2B accent, light painterly texture, dramatic rim light, readable
at card size. Original design.

Use case: stylized-concept. Mature visual direction for HSC students aged 16–18. Original design only, no franchise characters, logos or signature likenesses. No kawaii/chibi, huge cartoon eyes, smiling objects, toy shapes, candy pastels or primary-school decoration. Neutrals #0E1020 #171A31 #22264A #07080F #9A9CC0 #F2F2FA. Use only the specified saturated accent. No watermarks or signatures. Decorative game art, not scientific diagrams.

Use case: illustration-story. Input image 1 is the approved Chemistry boss design reference. Scene: Boss Battle in a monumental industrial containment arena. On the far RIGHT, this exact reaction-vessel crawler is towering at building scale, with orange flames in its hexagonal glass vessel, cubic crystal lattice on its left, two distillation necks, dark ceramic clamps and four articulated legs. Keep its recognisable subject-specific construction, not a humanoid or lava golem. Three small late-teen students/operatives stand in the RIGHT lower foreground with their backs to the viewer, facing the towering boss. Diverse body silhouettes and field gear: one tall figure with tightly curled hair, one shorter broad-shouldered figure and one slender figure with a close-fitting head covering. Confident determined stance, proportional late-teen bodies. Faces never visible or in focus, no portraits, no weapons or violence. Convey teamwork and huge boss scale, not cute mascots.

Composition: exact wide 16:9 full-bleed image, at least 1600px wide. LEFT 45% must be calm nearly uniform dark #0E1020 negative space for a large headline later; keep ALL characters, boss, bright crystals, flames, machinery and focal lighting in RIGHT 55%. No bright horizontal beam crossing left side, no central vanishing-point light, particles or intricate structures in left area. Ground fades to near-dark at left. Camera behind distant students, looking up toward the boss. Restrained orange rim light ties silhouettes to boss; dark navy background and charcoal forms. One saturated accent Chemistry #FF6A2B, pale neutral highlights only.

No text, letters, numbers, equations, logos, brand marks, watermark, UI, labels or headline placeholder. No existing franchise likenesses. Opaque scene background.
```

### Round 5: impact

- Master: `art/masters/fx/impact.png`.
- Delivery: `public/art/fx/impact.webp`.
- Date: 2026-11-17 (Australia/Sydney).
- Tool/model: built-in `image_gen.imagegen`; exact model not exposed.
- Style: 2 (graphic emblem); accent: `#FF6A2B`.
- Input references: none.
- Exact prompt:

```text
Flat geometric vector emblem, thick #07080F outline, 2-3 flat tones, deep navy base
with a single #FF6A2B accent, angular/hexagonal framing, no gradients beyond one
subtle highlight, readable at 24px. Original design.

Use case: stylized-concept. Mature visual direction for HSC students aged 16–18. Original design only, no franchise characters, logos or signature likenesses. No kawaii/chibi, huge cartoon eyes, smiling objects, toy shapes, candy pastels or primary-school decoration. Neutrals #0E1020 #171A31 #22264A #07080F #9A9CC0 #F2F2FA. Use only the specified saturated accent. No watermarks or signatures. Decorative game art, not scientific diagrams.

Asset type: one transparent hit-impact burst overlay for damage on a boss. Angular asymmetric radial impact flash, broad solid white #F2F2FA central flare with six to eight bold sharp irregular wedge rays, three short orange #FF6A2B accents tucked between the main rays, minimal #07080F edge only where needed. No framing badge or filled navy backplate: this is an overlay effect. Bold compact silhouette, clear central impact point, broad rays stay readable at 128px. Original crisp flat Style 2 geometry, not a comic word balloon, not a star currency crystal, no lightning-bolt shape.

Square canvas at least 1024px, centered complete flare occupying about 80% with clear padding. Genuinely transparent background, including gaps between rays. No halo, blur, smoky cloud, background glow, gradients, soft shadow, particles scattered far away, text, letters, numbers, logos, watermarks or signatures. Render exactly one burst.
```

### Round 5: subject-biology

- Master: `art/masters/icons/subject-biology.png`.
- Delivery: `public/art/icons/subject-biology.webp`.
- Date: 2026-11-17 (Australia/Sydney).
- Tool/model: built-in `image_gen.imagegen`; exact model not exposed.
- Style: 2 (graphic emblem); accent: `#1FB070`.
- Input references: image 1: `art/masters/bosses/biology-boss-idle.png`; image 2: `art/masters/icons/shield.png`.
- Exact prompt:

```text
Flat geometric vector emblem, thick #07080F outline, 2-3 flat tones, deep navy base
with a single #1FB070 accent, angular/hexagonal framing, no gradients beyond one
subtle highlight, readable at 24px. Original design.

Use case: stylized-concept. Mature visual direction for HSC students aged 16–18. Original design only, no franchise characters, logos or signature likenesses. No kawaii/chibi, huge cartoon eyes, smiling objects, toy shapes, candy pastels or primary-school decoration. Neutrals #0E1020 #171A31 #22264A #07080F #9A9CC0 #F2F2FA. Use only the specified saturated accent. No watermarks or signatures. Decorative game art, not scientific diagrams.

Input image 1 is the matching approved subject boss, used ONLY as a motif and accent-colour reference. Input image 2 is an approved Style 2 UI icon, used ONLY for flat geometric rendering, dark outline weight and simplicity. Do not copy the shield subject itself.

Subject emblem: A faceted living-cell silhouette containing ONE bold simplified double-helix cutout, plus two small attached spore lobes. Broad green cell forms, navy helix negative space. Echo the Biology boss's membrane/helix/spore identity, not a generic leaf.

Composition: ONE centered subject emblem in a consistent simple flat dark hexagonal backing #171A31, thick #07080F external outline, motif in the single specified subject accent #1FB070 with one restrained pale #9A9CC0 highlight if essential. No miniature whole boss or tiny complex details. Main subject shapes must be broad and readable at 24px and 48px, delivered later at 96px. Square canvas at least 1024px, icon occupies 80% of canvas with clear padding, genuinely transparent outside backing. No 3D bevel, painting texture, glow, gradients, extra border rings, scenery, cast shadow, text, letters, numbers, equations, logos or watermark. Original artwork.
```

### Round 5: subject-chemistry

- Master: `art/masters/icons/subject-chemistry.png`.
- Delivery: `public/art/icons/subject-chemistry.webp`.
- Date: 2026-11-17 (Australia/Sydney).
- Tool/model: built-in `image_gen.imagegen`; exact model not exposed.
- Style: 2 (graphic emblem); accent: `#FF6A2B`.
- Input references: image 1: `art/masters/bosses/chemistry-boss-idle.png`; image 2: `art/masters/icons/shield.png`.
- Exact prompt:

```text
Flat geometric vector emblem, thick #07080F outline, 2-3 flat tones, deep navy base
with a single #FF6A2B accent, angular/hexagonal framing, no gradients beyond one
subtle highlight, readable at 24px. Original design.

Use case: stylized-concept. Mature visual direction for HSC students aged 16–18. Original design only, no franchise characters, logos or signature likenesses. No kawaii/chibi, huge cartoon eyes, smiling objects, toy shapes, candy pastels or primary-school decoration. Neutrals #0E1020 #171A31 #22264A #07080F #9A9CC0 #F2F2FA. Use only the specified saturated accent. No watermarks or signatures. Decorative game art, not scientific diagrams.

Input image 1 is the matching approved subject boss, used ONLY as a motif and accent-colour reference. Input image 2 is an approved Style 2 UI icon, used ONLY for flat geometric rendering, dark outline weight and simplicity. Do not copy the shield subject itself.

Subject emblem: THREE connected isometric cubic crystal volumes emerging above a small angular reaction-chamber cup. Orange crystal faces and a simple dark vessel base. Clear crystalline lattice and reaction-vessel motif from the Chemistry boss, no face or atom badge.

Composition: ONE centered subject emblem in a consistent simple flat dark hexagonal backing #171A31, thick #07080F external outline, motif in the single specified subject accent #FF6A2B with one restrained pale #9A9CC0 highlight if essential. No miniature whole boss or tiny complex details. Main subject shapes must be broad and readable at 24px and 48px, delivered later at 96px. Square canvas at least 1024px, icon occupies 80% of canvas with clear padding, genuinely transparent outside backing. No 3D bevel, painting texture, glow, gradients, extra border rings, scenery, cast shadow, text, letters, numbers, equations, logos or watermark. Original artwork.
```

### Round 5: subject-physics

- Master: `art/masters/icons/subject-physics.png`.
- Delivery: `public/art/icons/subject-physics.webp`.
- Date: 2026-11-17 (Australia/Sydney).
- Tool/model: built-in `image_gen.imagegen`; exact model not exposed.
- Style: 2 (graphic emblem); accent: `#2F7BEA`.
- Input references: image 1: `art/masters/bosses/physics-boss-idle.png`; image 2: `art/masters/icons/shield.png`.
- Exact prompt:

```text
Flat geometric vector emblem, thick #07080F outline, 2-3 flat tones, deep navy base
with a single #2F7BEA accent, angular/hexagonal framing, no gradients beyond one
subtle highlight, readable at 24px. Original design.

Use case: stylized-concept. Mature visual direction for HSC students aged 16–18. Original design only, no franchise characters, logos or signature likenesses. No kawaii/chibi, huge cartoon eyes, smiling objects, toy shapes, candy pastels or primary-school decoration. Neutrals #0E1020 #171A31 #22264A #07080F #9A9CC0 #F2F2FA. Use only the specified saturated accent. No watermarks or signatures. Decorative game art, not scientific diagrams.

Input image 1 is the matching approved subject boss, used ONLY as a motif and accent-colour reference. Input image 2 is an approved Style 2 UI icon, used ONLY for flat geometric rendering, dark outline weight and simplicity. Do not copy the shield subject itself.

Subject emblem: ONE broad toroidal electromagnetic coil with two simple wound-segment divisions, a dark central circular opening and one sparse elliptical field arc with two charge dots. Blue flat coil faces. Echo the Physics boss; no lightning bolt.

Composition: ONE centered subject emblem in a consistent simple flat dark hexagonal backing #171A31, thick #07080F external outline, motif in the single specified subject accent #2F7BEA with one restrained pale #9A9CC0 highlight if essential. No miniature whole boss or tiny complex details. Main subject shapes must be broad and readable at 24px and 48px, delivered later at 96px. Square canvas at least 1024px, icon occupies 80% of canvas with clear padding, genuinely transparent outside backing. No 3D bevel, painting texture, glow, gradients, extra border rings, scenery, cast shadow, text, letters, numbers, equations, logos or watermark. Original artwork.
```

### Round 5: subject-maths-standard

- Master: `art/masters/icons/subject-maths-standard.png`.
- Delivery: `public/art/icons/subject-maths-standard.webp`.
- Date: 2026-11-17 (Australia/Sydney).
- Tool/model: built-in `image_gen.imagegen`; exact model not exposed.
- Style: 2 (graphic emblem); accent: `#F2B530`.
- Input references: image 1: `art/masters/bosses/maths-standard-boss-idle.png`; image 2: `art/masters/icons/shield.png`.
- Exact prompt:

```text
Flat geometric vector emblem, thick #07080F outline, 2-3 flat tones, deep navy base
with a single #F2B530 accent, angular/hexagonal framing, no gradients beyond one
subtle highlight, readable at 24px. Original design.

Use case: stylized-concept. Mature visual direction for HSC students aged 16–18. Original design only, no franchise characters, logos or signature likenesses. No kawaii/chibi, huge cartoon eyes, smiling objects, toy shapes, candy pastels or primary-school decoration. Neutrals #0E1020 #171A31 #22264A #07080F #9A9CC0 #F2F2FA. Use only the specified saturated accent. No watermarks or signatures. Decorative game art, not scientific diagrams.

Input image 1 is the matching approved subject boss, used ONLY as a motif and accent-colour reference. Input image 2 is an approved Style 2 UI icon, used ONLY for flat geometric rendering, dark outline weight and simplicity. Do not copy the shield subject itself.

Subject emblem: A bold simplified geometric balance: horizontal gold lever on a central triangular support, two shallow triangular trays, one solid cube per tray. Symmetric broad gold motif, clear negative space. Echo the Standard boss's proportion and measurement construct.

Composition: ONE centered subject emblem in a consistent simple flat dark hexagonal backing #171A31, thick #07080F external outline, motif in the single specified subject accent #F2B530 with one restrained pale #9A9CC0 highlight if essential. No miniature whole boss or tiny complex details. Main subject shapes must be broad and readable at 24px and 48px, delivered later at 96px. Square canvas at least 1024px, icon occupies 80% of canvas with clear padding, genuinely transparent outside backing. No 3D bevel, painting texture, glow, gradients, extra border rings, scenery, cast shadow, text, letters, numbers, equations, logos or watermark. Original artwork.
```

### Round 5: subject-maths-advanced

- Master: `art/masters/icons/subject-maths-advanced.png`.
- Delivery: `public/art/icons/subject-maths-advanced.webp`.
- Date: 2026-11-17 (Australia/Sydney).
- Tool/model: built-in `image_gen.imagegen`; exact model not exposed.
- Style: 2 (graphic emblem); accent: `#9B5CFF`.
- Input references: image 1: `art/masters/bosses/maths-advanced-boss-idle.png`; image 2: `art/masters/icons/shield.png`.
- Exact prompt:

```text
Flat geometric vector emblem, thick #07080F outline, 2-3 flat tones, deep navy base
with a single #9B5CFF accent, angular/hexagonal framing, no gradients beyond one
subtle highlight, readable at 24px. Original design.

Use case: stylized-concept. Mature visual direction for HSC students aged 16–18. Original design only, no franchise characters, logos or signature likenesses. No kawaii/chibi, huge cartoon eyes, smiling objects, toy shapes, candy pastels or primary-school decoration. Neutrals #0E1020 #171A31 #22264A #07080F #9A9CC0 #F2F2FA. Use only the specified saturated accent. No watermarks or signatures. Decorative game art, not scientific diagrams.

Input image 1 is the matching approved subject boss, used ONLY as a motif and accent-colour reference. Input image 2 is an approved Style 2 UI icon, used ONLY for flat geometric rendering, dark outline weight and simplicity. Do not copy the shield subject itself.

Subject emblem: Two nested violet diamond/octahedron silhouettes, outer four facets separated by broad dark negative-space seams, one smaller central diamond; one short restrained violet curved trajectory cut through centre. Echo the Advanced boss, few bold geometric planes.

Composition: ONE centered subject emblem in a consistent simple flat dark hexagonal backing #171A31, thick #07080F external outline, motif in the single specified subject accent #9B5CFF with one restrained pale #9A9CC0 highlight if essential. No miniature whole boss or tiny complex details. Main subject shapes must be broad and readable at 24px and 48px, delivered later at 96px. Square canvas at least 1024px, icon occupies 80% of canvas with clear padding, genuinely transparent outside backing. No 3D bevel, painting texture, glow, gradients, extra border rings, scenery, cast shadow, text, letters, numbers, equations, logos or watermark. Original artwork.
```

### Round 5: subject-maths-extension-1

- Master: `art/masters/icons/subject-maths-extension-1.png`.
- Delivery: `public/art/icons/subject-maths-extension-1.webp`.
- Date: 2026-11-17 (Australia/Sydney).
- Tool/model: built-in `image_gen.imagegen`; exact model not exposed.
- Style: 2 (graphic emblem); accent: `#E8447F`.
- Input references: image 1: `art/masters/bosses/maths-extension-1-boss-idle.png`; image 2: `art/masters/icons/shield.png`.
- Exact prompt:

```text
Flat geometric vector emblem, thick #07080F outline, 2-3 flat tones, deep navy base
with a single #E8447F accent, angular/hexagonal framing, no gradients beyond one
subtle highlight, readable at 24px. Original design.

Use case: stylized-concept. Mature visual direction for HSC students aged 16–18. Original design only, no franchise characters, logos or signature likenesses. No kawaii/chibi, huge cartoon eyes, smiling objects, toy shapes, candy pastels or primary-school decoration. Neutrals #0E1020 #171A31 #22264A #07080F #9A9CC0 #F2F2FA. Use only the specified saturated accent. No watermarks or signatures. Decorative game art, not scientific diagrams.

Input image 1 is the matching approved subject boss, used ONLY as a motif and accent-colour reference. Input image 2 is an approved Style 2 UI icon, used ONLY for flat geometric rendering, dark outline weight and simplicity. Do not copy the shield subject itself.

Subject emblem: A solid central tetrahedral mass formed by THREE broad interlocking triangular facets, with two short chunky self-similar triangular branches at upper corners; ONE thick pink line joins three pink nodes across central planes. Echo the revised heavy Extension 1 boss, compact substantial triangular/fractal silhouette, not a sparse chain.

Composition: ONE centered subject emblem in a consistent simple flat dark hexagonal backing #171A31, thick #07080F external outline, motif in the single specified subject accent #E8447F with one restrained pale #9A9CC0 highlight if essential. No miniature whole boss or tiny complex details. Main subject shapes must be broad and readable at 24px and 48px, delivered later at 96px. Square canvas at least 1024px, icon occupies 80% of canvas with clear padding, genuinely transparent outside backing. No 3D bevel, painting texture, glow, gradients, extra border rings, scenery, cast shadow, text, letters, numbers, equations, logos or watermark. Original artwork.
```
