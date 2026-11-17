# Handoff to Codex: Reactor Clash and the live classroom game

Written 18 November 2026 by Claude (Opus 5.5). You are taking over **code and art**. Read this first, then `docs/REACTOR_CLASH.md`, `docs/LIVE_GAME.md` and `docs/ART_DIRECTION.md`.

## Where things are

- **Branch:** `wip/nov-platform-snapshot`. Commit here in focused commits, with tests passing. Do not commit to `main`.
- **Product direction:** students want **real games**, not quizzes with pictures. That means controllable characters, movement and several goals at once, with **questions as the energy** that fuels play. The audience is 16–18 (HSC). Students play on **school laptops** (keyboard and mouse), and the teacher hosts on a **projector**.
- **Reactor Clash** is the main game, a real-time top-down team game. Routes:
  - `/clash`: solo practice against bots.
  - `/clash/host`: teacher/projector.
  - `/clash/join`: students.
- **Live quiz / Boss Battle** (`/live`, `/live/host`): working, but secondary now.
- **Backend:** the disposable Supabase project **HSC Legends Staging** (`xkqeigruzvnudtnmggis`). **Never** touch the shared project HSCScienceSyd (`rerfrskojieacxthfavb`); it's shared with hscscience.com.au. Staging SQL lives in `prototypes/classroom-v2/staging-*.sql`; the Reactor Clash SQL is `staging-clash.sql`. `.env.local` (gitignored) holds the `CLASSROOM_STAGING_*` settings.

## Owner feedback from the first real playtest (fix these first)

1. **"Really buggy: it freezes a lot, and I'd move and then a few seconds later it took me back to where I started."**
   - **Likely root cause:** the owner tested the projector and a student in tabs of the same browser. The **projector tab was in the background**, and browsers throttle background-tab timers (`setInterval`, `requestAnimationFrame`) to about 1 per second. The projector **is** the game server (`components/clash/clash-host.tsx` runs the simulation in a `setInterval`), so the whole match stalls.
   - **Why it snaps back:** the student predicts its own movement locally (`components/clash/clash-play.tsx`), and snaps to the host's position whenever they differ by more than 140px. A stalled host makes them differ, so the student gets pulled back.
   - **Fix direction:**
     - (a) Run the host's simulation tick in a **Web Worker** or on a worker-driven clock. Workers aren't throttled like background tabs.
     - (b) When a tick arrives late, **catch up** with fixed substeps (for example 1/30 s) instead of capping `dt` at 0.1.
     - (c) In `applyRemotePosition` (`lib/clash/sim.ts`), base the movement allowance on real elapsed time since that player's last accepted report, so a late tick doesn't clamp a legitimate move.
     - (d) Replace the hard 140px snap with smooth correction, and only snap after respawns or teleports.
     - (e) Show "Projector paused, keep this tab in front" on the host, and "Waiting for the projector…" on students when snapshots stop arriving.
   - Also check: student messages send only on change or every 400ms. Confirm the host doesn't treat an unchanged position as stale.
2. **"It's really jumpy."**
   - Snapshots are sent at about 10 per second and other players are drawn interpolated about 100ms in the past (`lerpState` in `lib/clash/protocol.ts`).
   - With a throttled host it stutters. After fixing #1, check the interpolation buffer: render about 120–150ms behind, keep 4–5 snapshots, and extrapolate briefly when one is missing.
   - Consider 15 snapshots per second if the transport budget allows (see "Scaling" below).
3. **"You can move without energy."** By design, walking is currently free; only sprinting (12 a second) and shots (8 each) cost energy. The owner wants energy to gate movement. They suggested either *automatically getting a question screen when you run out*, or *going back to the start when you run out*. Recommended:
   - Walking costs a small amount of energy (try 3 a second).
   - At 0 energy you can't move, and an **"Out of energy" question pops up automatically**, wherever you are. A correct answer refuels you. A wrong answer gives you the next question after a short pause.
   - Keep the terminals as the better option: higher reward, plus a streak bonus.
   - Optionally, after a few failed emergency questions, send the player back to base.

   Implement this in `lib/clash/sim.ts` (rules) with tests in `tests/offline/clash-sim.test.mjs`. Then update the practice, host and student screens. The server already issues and records questions independently of terminals (`clash_question`/`clash_answer`), so emergency questions can use the same path. The host needs a rule that grants energy for an emergency answer when the player is at 0 energy, instead of requiring `answering` to be set at a terminal.
4. **"I don't like how dark it is. It needs to be more simple so you can see your character."**
   - **Art:** lighten the floor tiles and simplify them (less detail and pattern noise), so walls and objects separate clearly from the floor.
   - **Players:** make the operatives bigger and higher contrast, for example a bright team-coloured outline or under-glow, with the local player's own marker strongest.
   - **Theme:** keep the locked style (Style 1/2 in `docs/ART_DIRECTION.md`) but allow a lighter, more readable arena palette. Update the brief if you change it.
   - **Code:** `components/clash/render.ts` draws everything. The floor, walls and bases are cached once in `staticLayer()`. Sprites are listed in `SPRITES` / `loadSprites(subject)`.

## How the code fits together

- **`lib/clash/sim.ts`:** pure game rules covering the map, movement and walls, energy, shooting and tagging, terminals, reactor capture, minions, orbs, the final-minute boss and scoring. It has no DOM and no network.
- **`lib/clash/bots.ts`:** bots with grid pathfinding.
- **`lib/clash/protocol.ts`:** compact snapshot encode/decode, interpolation, and student-message validation.
- **`lib/clash/net.ts`:** a Supabase Realtime broadcast wrapper. It's swappable; see "Scaling".
- **`lib/clash/questions.ts`:** the practice question bank.
- **`components/clash/`:**
  - `render.ts`: the shared Canvas 2D renderer.
  - `clash-game.tsx`: solo practice.
  - `clash-host.tsx`: the projector, which runs the authoritative simulation, checks each student's secret token, and grants energy only for answers read back from the database (`clash_receipts`).
  - `clash-play.tsx`: the student screen.
- **Development-only hooks for browser tests:**
  - `window.__clash`: the practice game state.
  - `window.__clashHost`: the host's simulation state.
  - `window.__clashLocal`: the student's local position.

## Tests (run before every commit)

```bash
npx tsc --noEmit -p . && npx eslint components lib app
npm test                                             # offline unit tests (364)
node prototypes/classroom-v2/test/clash.mjs          # Reactor Clash SQL rules, in-memory Postgres
node prototypes/classroom-v2/test/game-layer.mjs     # live-quiz SQL rules
# Browser tests need the dev server (npm run dev) and Playwright:
#   durable install at ~/.hsc-test (node_modules/playwright, browsers in ~/.hsc-test/browsers)
PLAYWRIGHT_BROWSERS_PATH=~/.hsc-test/browsers HSC_PLAYWRIGHT_MODULE=~/.hsc-test/node_modules/playwright/index.mjs node tests/browser/clash-practice.smoke.mjs
# Real-staging multiplayer test (needs an approved test host session):
PLAYWRIGHT_BROWSERS_PATH=~/.hsc-test/browsers HSC_PLAYWRIGHT_MODULE=~/.hsc-test/node_modules/playwright/index.mjs HSC_HOST_SESSION=~/.hsc-test/host.json node tests/browser/clash-staging.e2e.mjs
```

- **The test host:** an anonymous staging account whose session is in `~/.hsc-test/host.json` (user id `dc021d64-c615-466c-b3b2-e6012cf42513`). It **must be in `classroom_v2_private.hosts`** before the real-staging tests can create matches. The owner was asked to run the SQL for that; if creation fails with "not approved", ask them again.
- **Testing the multiplayer fix:** test with the **host in its own browser window** (not a background tab), and *also* with it in a background tab, to prove fix #1.
- **Changing staging SQL:** apply it to staging only, add it to the matching `staging-*.sql` file, and extend `prototypes/classroom-v2/test/clash.mjs`.

## Scaling (a decision for the owner, not a bug)

Supabase's free plan allows about 100 Realtime messages per second per project, counting each delivery. A full class of 30 needs several hundred. It's fine for testing with a few players. A real class needs either a dedicated game server (for example Cloudflare Durable Objects, which suit authoritative rooms well) or Supabase Pro (500 per second). Only `lib/clash/net.ts` should need to change, and the host-authoritative design can stay. Don't sign up for or deploy anything without the owner's OK.

## Known gaps after the fixes above

- If the host reloads mid-match, the match restarts.
- There's only one map.
- Students get no answer review beyond the teacher's CSV.
- The Boss Battle and Reactor Clash "Host" pages need a teacher login. Hosting is authorised by the server's allowlist, `classroom_v2_private.hosts`.

## House rules

- Run tests and type-checks before committing, and commit in small focused steps. Use `git add <paths>`, never `git add -A`. `supabase/.temp/cli-latest` is untracked noise.
- Don't edit production or shared databases. No new paid services without the owner's OK.
- Art changes follow `docs/ART_DIRECTION.md` and are logged in `docs/ART_ASSETS.md`.
- **Next.js 16:** `middleware` is now `proxy.ts`. New public routes must be added to the `publicSamples` list in `proxy.ts`. Read `node_modules/next/dist/docs/` before using unfamiliar APIs.
