# Reactor Clash

A real-time, top-down team game where **questions are energy**. Students move with WASD, aim with the mouse, and fire, sprint and capture reactors. Every action costs energy, and the only way to get energy is answering a question at a terminal. While answering, a student is frozen and exposed.

## Routes

| Route | What |
|---|---|
| `/clash` | Solo practice: you + 3 bots vs 4 bots. No account or server needed. |
| `/clash/host` | Teacher/projector. Creates a match from the practice bank or a saved question set, shows a lobby (code, QR, swappable teams), then runs the match and shows the whole map. Ends with results and a CSV download. |
| `/clash/join` | Students join with a 6-character code and a name (a guest account per tab). |

The multiplayer routes need the `CLASSROOM_STAGING_*` settings (see `docs/LIVE_GAME.md`).

## Rules (lib/clash/sim.ts)

- **Capture:** stand on a reactor to capture it (contested if both teams are on it). Each one held scores 1 point a second.
- **Tags:** tagging an enemy scores 2. They respawn at base after 4 seconds and lose 25% of their energy.
- **Costs:** shots cost 8 energy and sprinting costs 12 per second. A correct answer gives +25, plus a streak bonus. A wrong answer locks that terminal for 6 seconds.
- **Minions:** they drain reactors. Shooting one drops an energy orb.
- **Boss:** Reactor Prime arrives for the final minute. The team that deals the most damage gets +60.
- **Bot balance (bot-only matches):** about 7 questions per player per minute, roughly 28 per 4-minute match.

## Architecture

- **Simulation:** `lib/clash/sim.ts` holds the game rules as a pure, engine-free module. `lib/clash/bots.ts` has bots with grid pathfinding. `components/clash/render.ts` is a Canvas 2D renderer using `public/art/arena`.
- **Host-authoritative:** the projector runs the simulation and sends compact snapshots (about 10 a second, under 4 KB each; `lib/clash/protocol.ts`). Students move their own character locally and report positions, which the host clamps to sprint speed, blocks at walls, and charges sprint energy for. Shots, tags, captures and energy are all decided by the host.
- **Clock and movement.** A dedicated worker wakes the projector, which catches up in 1/30-second simulation steps. Each new student position is applied at most once, using the elapsed time since the previous accepted report. Snapshots acknowledge the report so newer local movement survives correction. The camera and operative ease into corrected positions, and respawns place the student directly at base. After 1.5 seconds without snapshots the student sees “Waiting for the projector…” and prediction pauses until updates resume.
- **Server-owned:** `prototypes/classroom-v2/staging-clash.sql` covers rooms, team-balanced joins, and a per-player secret token that the host checks on every student message. Questions are issued by the server (no answer key sent, no re-rolling), answers are recorded once, and the host only grants energy for answers it reads back from the database (`clash_receipts`).
- **Transport:** `lib/clash/net.ts` uses Supabase Realtime broadcast and is swappable.

## Scaling limit

The Supabase free plan allows about **100 Realtime messages per second** per project, counting each delivery. A full class sends several hundred a second. That's fine for testing with a few tabs, but a real class needs either a dedicated game server (for example Cloudflare Durable Objects) or Supabase Pro (500/s). It's a hosting and cost decision. Only `lib/clash/net.ts` changes.

## Tests

- `tests/offline/clash-sim.test.mjs`: game rules, full bot matches, protocol round-trip, remote-move limits.
- `node prototypes/classroom-v2/test/clash.mjs`: 24 SQL rules (in-memory Postgres).
- `tests/browser/clash-staging.e2e.mjs`: projector plus two students against real staging. Add `HSC_TEST_TAB_VISIBILITY=1` and use a display (on Linux, `xvfb-run -a node tests/browser/clash-staging.e2e.mjs`) for the foreground, background and interrupted-clock checks. This mode uses the Playwright 1.48.2 installation from the handoff.

## Known gaps

- If the host reloads mid-match, the match restarts. The simulation lives in the projector tab, which must stay open. A browser or OS that fully suspends the tab interrupts play until the projector wakes up.
- The boss and minions are always Chemistry-themed. Subject-themed matches are a possible extension.
- There's one map.
- The answer review at the end is the teacher's CSV only.
