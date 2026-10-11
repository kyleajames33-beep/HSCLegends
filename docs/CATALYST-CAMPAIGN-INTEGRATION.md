# Catalyst campaign integration — 11 October 2026

The approved campaign sample now supplies artwork to the existing `/campaign`
route. Chemistry gets a side-by-side laboratory stage, The Catalyst's four
poses and the existing health/energy/combat controls. Spark is a fifth fighter
and the default for users without a previously saved choice. Existing saved
fighter IDs continue to load. Special attacks now use the fighter's existing
`special` pose; critical normal attacks still use `attack`.

`ChemistryCampaignStage` is presentation only. Production question selection,
timers, damage/cost constants, rewards, stage progression and RPC contracts
remain in the existing campaign code. No sample questions or prototype scoring
are imported. Other subjects retain their existing arena and boss artwork;
existing fighters are retained. The Chemistry campaign map opts into the new
boss; weekly boss, home and collectible artwork remain unchanged.

Nine WebP assets live under `public/campaign-art/catalyst-v1/` (1,117,370 bytes
total). All eight 640 × 640 character poses retain alpha; the arena is opaque.
The original PNG sample remains available under `prototypes/catalyst-battle/`.
Versioned paths avoid stale cached artwork. Boss defeat now takes precedence
over a transient attack/hurt pose. Boss idle animation obeys reduced motion.

## Executed checks

- `npx tsc --noEmit`: passed.
- ESLint on campaign page and all three changed/new components: passed.
- Production build with a loopback URL/non-secret placeholder key: passed;
  all 42 routes generated. This does not prove production auth/backend readiness.
- `npm test`: 133/133 passed.
- `npm run test:all`: remains red on the previously documented classroom
  answer-receipt recovery regression; the other two regression tests pass.
  Regression and classroom source files are unchanged by this integration.
- Actual built Next `/campaign` browser test with a local auth/RPC double:
  new fighter roster, Chemistry arena, image loading, attack/special/hurt/defeat
  poses, victory, reduced-motion handling, no horizontal overflow at widths
  320/390/768/1280, Biology fallback, legacy fighter selection and reload
  persistence passed. No JavaScript page errors. Production backend calls and
  rewards were not used; this is client-integration evidence only.
- Actual campaign desktop/phone screenshots were rendered and visually inspected.
- Eight WebP character alpha channels checked. `git diff --check`: passed.

Existing backend/content/classroom blockers remain outside this art integration.
This change is prepared in the existing PR; merge and deployment status must be
reported separately from code integration.
