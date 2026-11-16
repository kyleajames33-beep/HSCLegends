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
