# OpenArt → HSC Legends Boss Art — Step-by-Step

Goal: replace the placeholder boss sprites with a custom, consistent roster.
You'll do this in the **OpenArt web UI** (openart.ai). No coding — just generate, cut out, save.

Each boss needs **4 images**: `idle`, `attack`, `hurt`, `defeat`.
There are **6 bosses**, so **24 images total**. Do them **one boss at a time** — fully finish boss #1
before starting boss #2.

---

## PART 0 — Settings to use every time

- **Model:** choose **FLUX** (or the highest-quality model OpenArt offers in the dropdown — avoid the "fast/turbo" cheap ones; they look generic).
- **Aspect ratio:** **1:1 (square)**.
- **Resolution:** highest available (you can downscale later; the app doesn't need huge files).

---

## PART 1 — Generate Boss #1's IDLE image

1. Go to **openart.ai** and log in.
2. Click **Create** (image generation).
3. Set **model = FLUX**, **aspect ratio = 1:1**.
4. Paste this **exact prompt** (this is Biology, the first boss):

```
Stylized 3D toon character art for a mobile game, vibrant saturated colours, clean rim lighting,
soft ambient occlusion, bold readable silhouette, playful but epic. Single character, centered,
full body, facing camera, slight low angle. Plain flat light-grey studio background, no scenery,
no text, no logos, no shadow on the ground.
CHARACTER: "The Mitochondrion Monarch" — a towering friendly-but-menacing mutant cell-creature,
translucent glowing membrane body, a bright nucleus core in the chest, writhing flagella and cilia
limbs, organelle details, bioluminescent green-teal colour scheme.
POSE: idle, full health, proud confident stance, calm powerful, glowing softly.
```

5. Generate. Make **4 options** if OpenArt lets you (more to choose from).
6. Pick the best one. **This is your master image** — the other 3 poses must match it.

---

## PART 2 — Lock it as a consistent Character

This is the key step that keeps all 4 poses looking like the SAME creature.

1. Find OpenArt's **Characters / Consistent Character** feature (look for "Characters" in the left
   menu, or a **"Create character from this image"** option on the image you just made).
2. Create a character using your chosen **idle** image as the reference.
3. Give it a name like `bio-boss`.

> If you can't find the Character feature: alternative is to use **"Edit → Variations"** or
> **image-to-image** with the idle image as the input for the next 3 poses. Same idea — feed it the
> idle so it stays consistent.

---

## PART 3 — Generate the other 3 poses (using the character / idle as reference)

For each of the 3 below: use the **same character** (or feed the idle image as reference), keep
**model FLUX, 1:1**, and use the **same CHARACTER description** as above, only changing the POSE line.

**ATTACK:**
```
POSE: attacking, enraged, lunging forward mid-attack, limbs and energy thrust toward the viewer,
dramatic energy burst, aggressive.
```

**HURT:**
```
POSE: hurt and staggering, damaged, body cracked and dimmed, recoiling backward, sparks and small
fragments breaking off, weakened.
```

**DEFEAT:**
```
POSE: defeated, collapsing and slumping down, energy fading out, dim and faint, beaten.
```

You now have 4 images for Boss #1.

---

## PART 4 — Remove the background (all 4 images)

The game floats these over a background, so they MUST be transparent PNGs.

1. Open each image in OpenArt's **Edit** canvas.
2. Use **Remove Background**.
3. Confirm the background is now transparent (checkerboard pattern), subject cleanly cut out.

---

## PART 5 — Download & put the files in the right place

1. **Download each image as PNG** (transparent).
2. Rename them **exactly** (lowercase, no spaces):
   - `idle.png`
   - `attack.png`
   - `hurt.png`
   - `defeat.png`
3. Put Boss #1's four files into this folder, replacing the placeholders:
   ```
   public/bosses/biology/idle.png
   public/bosses/biology/attack.png
   public/bosses/biology/hurt.png
   public/bosses/biology/defeat.png
   ```

> Tip: in VS Code you can just drag the 4 files into the `public/bosses/biology/` folder and
> choose "replace" when asked.

---

## PART 6 — See it in the game

The app already uses these files (`components/boss-art.tsx` picks the pose by the boss's HP).
Run the app, start a Biology boss battle, and watch it swap idle → attack → hurt → defeat as HP drops.
If a pose looks off, just re-generate that one image and re-drop the file.

---

## PART 7 — Repeat for the other 5 bosses

Same exact process. Only the CHARACTER block changes. Folder name in brackets.

**CHEMISTRY**  → folder `public/bosses/chemistry/`
```
CHARACTER: "The Catalyst" — an alchemist golem built from bubbling glass beakers and tubing,
a hexagonal molecule crown, acid-green and violet reactive glow, dripping luminous reagents.
```

**PHYSICS**  → folder `public/bosses/physics/`
```
CHARACTER: "The Singularity" — a cosmic energy entity, crackling electric-blue limbs, small planets
orbiting its body, a glowing event-horizon core in the chest, arcs of lightning.
```

**MATHS STANDARD**  → folder `public/bosses/maths-standard/`
```
CHARACTER: "The Geometer" — a crystalline golem made of clean cubes, spheres and prisms, an angular
faceted body, polished surfaces, cool blue-white colour with glowing gold edges.
```

**MATHS ADVANCED**  → folder `public/bosses/maths-advanced/`
```
CHARACTER: "The Derivative" — a fractal calculus entity, swirling continuous curves forming its
limbs, integral-sign tendrils, deep indigo body with luminous gold curve-traces.
```

**MATHS EXT1**  → folder `public/bosses/maths-ext1/`
```
CHARACTER: "The Vectorlord" — a being made of glowing arrows and graph axes, a parametric spiral
torso, directional-vector limbs, electric magenta glow on a dark body.
```

For each: keep the same opening style sentence + the 4 POSE lines from Parts 1 & 3. Make a character,
generate 4 poses, remove backgrounds, save into that boss's folder.

---

## Quick reference — the 6 folders

| Boss | Folder | Theme |
|------|--------|-------|
| Biology | `public/bosses/biology/` | green-teal cell creature |
| Chemistry | `public/bosses/chemistry/` | beaker alchemist golem |
| Physics | `public/bosses/physics/` | cosmic energy entity |
| Maths Standard | `public/bosses/maths-standard/` | crystalline geometric golem |
| Maths Advanced | `public/bosses/maths-advanced/` | fractal calculus entity |
| Maths Ext1 | `public/bosses/maths-ext1/` | arrows & vectors being |

Each folder = 4 transparent PNGs named `idle.png`, `attack.png`, `hurt.png`, `defeat.png`.

---

## If you want my help mid-way

Save any generated image into the repo (e.g. drop it in `public/bosses/<subject>/`) and tell me —
I can open it, tell you if it'll read well at game size, and suggest prompt tweaks. I just can't
click inside OpenArt for you (no integration), so you drive the generation; I review and adjust.
