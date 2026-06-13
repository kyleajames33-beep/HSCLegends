# HSC Legends × Higgsfield — Art & Media Plan

**What Higgsfield is:** an AI image/video generation studio, drivable from Claude Code via MCP
(`https://mcp.higgsfield.ai/mcp`). It makes **raster images and short video** — it does **not** build
game logic, multiplayer, or backend. We use it purely as our **art + trailer pipeline**.

**MCP tools it exposes:** image gen (up to 4K), Soul Character Training (consistent characters),
Cinematic Image-to-Video (animate stills), Marketing Video Generator, Viral Clip Generator, Virality Prediction.

---

## 0. Setup (one-time)

1. MCP server already added to Claude Code (`higgsfield`, HTTP transport).
2. Run `/mcp` → select **higgsfield** → sign in with Higgsfield account (no API key).
3. Once authenticated, Claude can fire generations directly in-session.

---

## 1. What we WILL make with Higgsfield (priority order)

| # | Asset | Surface | Type | Count | Fit |
|---|-------|---------|------|-------|-----|
| 1 | **Boss monsters** | `boss-art.tsx` | transparent PNG | 6 × 4 = 24 | ⭐ strongest |
| 2 | **Arena backgrounds** | `/duel` `/heist` `/knockout` `/play` | image | ~4–6 | ⭐ strong |
| 3 | **Hero / welcome splash** | `/welcome` `/` | image | 1–2 | strong |
| 4 | **Power-up / item icons** | gameplay (Rocket, Golden Bomb, Mega Bomb) | transparent PNG | ~6–10 | strong |
| 5 | **Share cards** | `/share` `share-button.tsx` | image template | 1–3 | strong |
| 6 | **Showcase imagery** | `/showcase` | image | a few | marketing |
| 7 | **Launch trailer** | marketing (the Instagram-ad style promo) | video ≤15s | 1 | ⭐ marketing |
| 8 | **KO-flash / celebration clips** | supplement Lottie | short video/GIF | 2–3 | optional |

## What we will NOT move to Higgsfield (keep as-is)

- **User avatars** — DiceBear is procedural + deterministic per user. Keep it.
- **League badges** — crisp SVG, scales to any size. Keep it (illustrated upgrade optional).
- **Lottie micro-animations** — Higgsfield makes video, not Lottie JSON. Keep Lottie; only add video where a richer moment is wanted.

---

## 2. Production workflow (how, not just what)

1. **Lock a style bible first.** One art direction for the whole game so the roster feels cohesive.
   Proposed: *stylized 3D toon character art, vibrant, clean rim lighting, mobile-game hero render,
   bold silhouette readable at small sizes.* (Tune to match the app's warm parchment/plum/berry UI,
   not the neon ad.)
2. **Soul Character Training per boss.** Generate one hero `idle` per boss, register it as a Soul
   character, then generate `attack`/`hurt`/`defeat` *from that reference* so each frame is the same creature.
3. **Static assets** (backgrounds, items, share cards) via plain image gen with the shared style prefix.
4. **Animation** via Cinematic Image-to-Video (animate a boss idle, build the KO clip).
5. **Trailer** via Marketing Video Generator, fed the app URL + key screens.
6. **Post-process sprites:** boss/item PNGs need **transparent cutouts**. Generate on a flat solid
   background, then background-remove. Verify alpha before dropping into `/public`.

### Technical constraints for sprites (bake into every prompt)
- 1:1 square canvas, character centered, full-body, consistent scale + headroom across all 4 states.
- Flat solid neutral background (easy matte) → background removal → transparent PNG.
- Output 4K, downscale for the app.
- File layout already in place: `public/bosses/<subject>/{idle,attack,hurt,defeat}.png`.

---

## 3. Prompt Pack

### 3.1 Master style prefix (prepend to every boss + item prompt)

```
Stylized 3D toon character art for a mobile study-battle game called "HSC Legends".
Vibrant saturated colours, clean rim lighting, soft ambient occlusion, bold readable silhouette,
playful-but-epic tone. Single character, centered, full body, facing camera, slight low angle.
Flat solid pale-grey background (#dddddd) for clean cutout. Square 1:1, 4K, no text, no logos,
no ground shadow baked in.
```

### 3.2 Bosses — 6 subjects × 4 states

Each boss = one Soul character; generate `idle` first, then the other 3 states from that reference.
State direction (append to the per-boss concept):

- **idle** — `full health, proud confident stance, calm menacing power, glowing softly.`
- **attack** — `enraged, lunging forward mid-attack, arms/energy thrust toward viewer, dramatic.`
- **hurt** — `damaged and staggering, cracked/dimmed, recoiling, sparks or fragments breaking off.`
- **defeat** — `defeated, collapsing/dissolving, slumped, energy fading out, faint.`

**Boss concepts:**

| Subject (folder) | Concept |
|---|---|
| `biology` | **The Mitochondrion Monarch** — towering mutant cell-creature, translucent membrane body, glowing nucleus core, writhing flagella/cilia limbs, organelle details, bioluminescent green-teal. |
| `chemistry` | **The Catalyst** — alchemist golem built from bubbling beakers and glass tubing, hexagonal molecule crown, acid-green and violet reactive glow, dripping reagents. |
| `physics` | **The Singularity** — cosmic energy entity, crackling electric-blue limbs, small orbiting planets, glowing event-horizon core in the chest, sparks of lightning. |
| `maths-standard` | **The Geometer** — crystalline golem of clean cubes, spheres and prisms, angular body, polished facets, cool blue-white with gold edges. |
| `maths-advanced` | **The Derivative** — fractal calculus entity, swirling continuous curves forming limbs, integral-sign tendrils, deep indigo with luminous gold curve-traces. |
| `maths-ext1` | **The Vectorlord** — being made of glowing arrows and graph axes, parametric spiral torso, directional-vector limbs, electric magenta on dark. |

Example full prompt (biology / attack):
```
<master style prefix>
The Mitochondrion Monarch — towering mutant cell-creature, translucent membrane body, glowing
nucleus core, writhing flagella limbs, bioluminescent green-teal. Enraged, lunging forward
mid-attack, limbs thrust toward viewer, dramatic energy burst.
```

### 3.3 Arena backgrounds (one per mode, 16:9 and/or 9:16)

```
<style colours only, no "single character"> Wide game-arena background for "HSC Legends".
Empty stage, no characters, designed so UI and a boss composite cleanly on top.
- duel:     a focused 1v1 dueling arena, two podiums facing off, spotlight, tense.
- heist:    a glowing vault chamber, laser grid, treasure/score core, team-vs-team heist vibe.
- knockout: a tournament bracket stage with tiers/seats, elimination-show energy, dramatic lights.
- play:     a friendly quiz-show stage, warm parchment/plum palette, inviting.
16:9 and 9:16 variants. Leave central area uncluttered for gameplay overlay.
```

### 3.4 Power-up / item icons (transparent)

```
<master style prefix> Game power-up icon, single object, glossy, glowing, iconic, no character:
- Rocket:      a sleek cartoon rocket, speed trail.
- Golden Bomb: a shiny gold bomb with lit fuse, sparkle.
- Mega Bomb:   a large menacing bomb, red glow, danger.
```

### 3.5 Launch trailer (Marketing Video Generator)

Feed the deployed app URL + 4–6 key screens. Brief:
```
15-second vertical (9:16) launch trailer for "HSC Legends", a real-time multiplayer HSC study-battle
game. Energetic game-show tone. Beats: hook ("study like it's a game show") → quick cuts of Duel,
Heist, Knockout modes → a boss battle → leaderboard/win moment → call to action. Punchy captions,
upbeat music. Match the in-app warm parchment/plum/berry palette.
```

---

## 4. First sprint (once `/mcp` is authenticated)

1. Generate all 6 boss **idle** frames (style bible check — do these look cohesive?).
2. Train Soul characters from the 6 idles.
3. Generate the remaining 18 frames (attack/hurt/defeat).
4. Background-remove → drop into `public/bosses/<subject>/`.
5. Eyeball in-app at the real sizes (`boss-art.tsx` swaps by HP). Iterate prompts as needed.
6. Then move to backgrounds → items → trailer.

Boss frames are the highest-leverage, lowest-risk win — they replace the placeholder Kenney sprites
with a custom, consistent, branded roster. Start there.
