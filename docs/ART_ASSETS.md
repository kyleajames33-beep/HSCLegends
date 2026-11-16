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
