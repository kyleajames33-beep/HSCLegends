# Reactor Clash

A real-time, top-down team game where **questions are energy**. Students move with WASD, aim with the mouse, and fire, sprint and capture reactors. Walking, sprinting and shooting spend energy. At zero, an emergency question opens wherever the player is. Terminals give a larger refuel. While answering, a student is frozen and exposed.

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
- **Energy.** Walking costs 3 energy per second at full walking speed, sprinting costs 12, and shots cost 8 each. Movement costs scale with distance travelled. At zero, the player stops in place and gets an emergency question. A correct answer restores 15 energy. A wrong answer gives another question after a short pause.
- **Terminals.** A correct terminal answer gives 25 energy plus a streak bonus. A wrong answer locks that terminal for 6 seconds. Emergency answers earn the flat refuel and do not build a terminal streak.
- **Minions:** they drain reactors. Shooting one drops an energy orb.
- **Boss:** Reactor Prime arrives for the final minute. The team that deals the most damage gets +60.
- **Bot matches.** Three seeded four-minute matches with eight bots averaged 37–42 answers per bot, counting terminal and emergency questions.

## Architecture

- **Simulation:** `lib/clash/sim.ts` holds the game rules as a pure, engine-free module. `lib/clash/bots.ts` has bots with grid pathfinding. `components/clash/render.ts` is a Canvas 2D renderer using `public/art/arena`.
- **Host-authoritative:** the projector runs the simulation and sends compact snapshots (about 10 a second, under 4 KB each; `lib/clash/protocol.ts`). Students move their own character locally and report positions, which the host clamps to sprint speed, blocks at walls, and charges movement energy for. Shots, tags, captures and energy are all decided by the host.
- **Clock and movement.** A dedicated worker wakes the projector, which catches up in 1/30-second simulation steps. Each new student position is applied at most once, using the elapsed time since the previous accepted report. Snapshots acknowledge the report so newer local movement survives correction. The camera and operative ease into corrected positions, and respawns place the student directly at base. After 1.5 seconds without snapshots the student sees “Waiting for the projector…” and prediction pauses until updates resume.
- **Remote movement.** Students keep five snapshots and render other players 150 ms behind the estimated host timeline. During a delivery gap, moving operatives can continue for up to 65 ms before holding position. Shots interpolate between confirmed positions of the same projectile. The projector targets 10 snapshots per second to stay within the existing transport budget for small matches.
- **Server-owned:** `prototypes/classroom-v2/staging-clash.sql` covers rooms, team-balanced joins, and a per-player secret token that the host checks on every student message. Questions are issued by the server (no answer key sent, no re-rolling), answers are recorded once, and the host only grants energy for answers it reads back from the database (`clash_receipts`).
- **Transport:** `lib/clash/net.ts` defaults to Supabase Realtime. Staging can opt into the [WebSocket relay](../prototypes/clash-relay/README.md), which sends student controls only to the projector and sends projector updates to the room. The seat and answer RPCs are the same in either mode.

## Scaling limit

The projector and all students share one broadcast channel. For 30 students, the projector's 10 snapshots per second account for about 310 events per second, including one send and 30 deliveries per snapshot. Student inputs also fan out to the entire channel, even though only the projector uses them.

A six-second loopback test with one projector, two student browsers and 28 synthetic input senders produced 61 snapshots while the simulation clock kept pace. At that input rate, fanning every broadcast out to a 30-student room would generate about 10,400 deliveries per second. The test estimates delivery volume and does not measure hosted service throughput.

Supabase publishes limits of [100 events per second on Free and 500 on capped Pro](https://supabase.com/docs/guides/realtime/limits), and counts [each send and each recipient](https://supabase.com/docs/guides/realtime/settings). The opt-in relay delivered all 2,160 controls and 1,800 snapshot updates in a separate six-second test with 30 real WebSocket clients. That's about 660 deliveries per second versus 11,100 with everyone receiving the same traffic. The relay still needs a hosted staging test before a classroom pilot.

## Tests

- `tests/offline/clash-sim.test.mjs`: game rules, full bot matches, protocol round-trip, remote-move limits.
- `node prototypes/classroom-v2/test/clash.mjs`: 24 SQL rules (in-memory Postgres).
- `tests/browser/clash-staging.e2e.mjs`: projector plus two students against real staging. Add `HSC_TEST_TAB_VISIBILITY=1` and use a display (on Linux, `xvfb-run -a node tests/browser/clash-staging.e2e.mjs`) for the foreground, background and interrupted-clock checks. This mode uses the Playwright 1.48.2 installation from the handoff.

## Known gaps

- If the host reloads mid-match, the match restarts. The simulation lives in the projector tab, which must stay open. A browser or OS that fully suspends the tab interrupts play until the projector wakes up.
- The boss and minions are always Chemistry-themed. Subject-themed matches are a possible extension.
- There's one map.
- The answer review at the end is the teacher's CSV only.
