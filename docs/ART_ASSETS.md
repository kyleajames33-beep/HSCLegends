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
