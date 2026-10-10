# The Catalyst campaign art sample

A playable, isolated HSC Legends chemistry battle with a matching boss, fighter
and arena. Answer correctly to earn energy, then spend it on Strike, Reactor
burst or Shield. Wrong answers cost HP. Every answer reveals an explanation.

This is a review prototype, not the production campaign. Its eight authored
sample questions cycle; it has no timer, network client, account, database,
saved progression, currency awards or production scoring effect. Mechanics
borrow the existing campaign concept but are intentionally simplified.

## Try it

From the repository root:

```sh
python -m http.server 8000 --directory prototypes/catalyst-battle
```

Open `http://localhost:8000`. For an offline single-file preview:

```sh
node prototypes/catalyst-battle/build.mjs /tmp/hsc-legends-catalyst-preview.html
```

Open that HTML directly in a browser. All assets are embedded; no network is
needed. Do not commit the generated single-file bundle because it duplicates
the asset bytes.

## Art

Generated with the built-in image tool; the tool does not expose the specific
underlying model. `prompts.json` records the prompts and reference relationships.
All eight character poses have real RGBA transparency. Characters were generated
at 1254 × 1254 and resized to 640 × 640 PNGs for the prototype; the opaque arena
was resized to 1440 px wide. Original generated files are preserved outside the
checkout. No rig, sprite atlas, background removal or character training is used.

- Catalyst: idle / attack / hurt / defeat, faces left.
- Spark: idle / attack / hurt / special, faces right.
- Shared plum, bronze, teal and lime palette; polished stylized 3D.

These are reaction poses, not a seamless frame-by-frame animation. Some generated
details and framing vary between poses. Preview at real display sizes before
accepting them for the production roster. Reduced-motion users get static poses
without the bob, lunge, recoil or flash animations.

## Integration boundary

Every change lives under `prototypes/catalyst-battle/`. Existing `app/`,
`components/`, `lib/`, `public/`, production configuration and database files
are untouched. If the art is accepted, the boss PNGs can be copied to a versioned
production asset folder and consumed by `BossArt`; Spark can be added as a new
fighter rather than overwriting an existing option. Arena art can be scoped to
Chemistry campaign battles. This prototype is not connected gameplay proof.

## Validation

```sh
node --test prototypes/catalyst-battle/model.test.mjs
```

See `verification.md` for actual executed checks and limitations.
