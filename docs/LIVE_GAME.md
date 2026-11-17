# Live classroom game (staging)

A Kahoot-style live game. The teacher hosts from a projector and students play on their phones. It runs only against the dedicated **HSC Legends Staging** Supabase project (`xkqeigruzvnudtnmggis`), never the shared HSCScienceSyd project.

## Routes

| Route | Who | What it does |
|---|---|---|
| `/live/host` | Teacher | Sign in, choose the sample set or upload a CSV/JSON file, create the game. Then the lobby (code + QR), questions with a countdown, the reveal with answer counts, the leaderboard, and the podium. |
| `/live` | Students | Join with a 6-character code and a name (one step, no account). Then the answer tiles, the result after each question (points, streak, rank), and the final place. |

Both routes are disabled unless the four `CLASSROOM_STAGING_*` variables are set (see `docs/CLASSROOM_STAGING_LAB.md`). Locally they live in `.env.local`, which is gitignored.

## Modes

- **Boss Battle** (default): the whole class fights one subject boss. Every point scored is damage. Boss health is fixed when the game starts, at 450 × players × questions, so a class answering about two-thirds correctly at a fair pace wins near the end. The projector shows a health bar during questions, the boss taking the round's damage at each reveal, and a win or escape banner at the end. Students see the health bar, their "+N damage", and the outcome. Bosses and art are in `components/live/boss.tsx` and `public/art/bosses/`. The mode is set by host-only, lobby-only `classroom_v2_game_configure` (`prototypes/classroom-v2/staging-boss-battle.sql`).
- **Classic**: everyone for themselves, with a leaderboard and podium.

Students on laptops can answer with number keys 1–6.

## Teacher tools

- **End question now**: closes the current question immediately (`classroom_v2_game_close`, host-only). Answers arriving after the close are rejected, and both screens move to the reveal.
- **Download results (CSV)** on the final screen: one row per student with their score, number correct, and their answer to each question played (`classroom_v2_game_report`, host-only). Cells that would start a spreadsheet formula are escaped.

## Rejoining

A student who closes the tab by accident can reopen `/live` in the same browser within 6 hours and click **Rejoin as <name>**. They keep the same player and score. The session is mirrored to localStorage for this; "Leave game" and finished games clear it.

## Running a test game

1. `npm run dev`, then open `/live/host` and sign in with an approved teacher account.
2. Open `/live` in other tabs. Each tab is a separate player, so no incognito window is needed.
3. Hosting needs an approved account: insert its auth user id into `classroom_v2_private.hosts`. Clients cannot approve themselves.

## How it works

- **Server.** `prototypes/classroom-v2/staging-candidate.sql` is the engine: rooms, frozen questions, answer windows, receipts, host-only transitions. `staging-game-layer.sql`, `staging-boss-battle.sql` and `staging-host-tools.sql` (same folder) add:
  - short codes;
  - speed scoring: 1000 points for an instant correct answer, falling linearly to 500 at the deadline; wrong answers score 0;
  - late joins and unique names;
  - two JSON views, `classroom_v2_game_host` and `classroom_v2_game_player`.
- **What the server guarantees.** It decides scores and deadlines. A student never receives the answer key for a question they haven't answered, and cannot read another student's view or the host view.
- **Client.** `lib/live-game.ts` provides the client, polling (1 s, stale responses dropped) and the clock offset. `lib/live-sound.ts` holds the synthesized sound cues. The screens are in `components/live/`. Sessions are stored per tab.
- **When results appear.** The reveal shows when time runs out or every player has answered. Students who answer early see "Locked in" until then, so they can't tell their neighbours the answer.
- **Your own questions.** Upload a CSV/JSON set on `/live/host` (same format as `/question-import`, up to 300 questions). It's saved to the teacher's private library (`classroom_v2_set_*`, `staging-question-sets.sql`), and each game draws a random 5–20 questions from it. Example file: `docs/examples/live-game-questions.csv`. A single game holds at most 20 questions. Explanations show to students only after they answer.

## Tests

- `node prototypes/classroom-v2/test/game-layer.mjs`: the SQL rules in an in-memory Postgres with a mock `auth.uid()`.
- `tests/browser/live-host.smoke.mjs`: the projector screens against a mocked network.
- Verified once against the real staging project (16 November 2026): real anonymous auth, a host and two guests, the permission checks, a full game, and a headless-browser student run.

## Known limits

- Rejoining only works in the same browser. On a different laptop, the student has to join as a new player.
- Updates come from 1-second polling, not Supabase Realtime. That's fine for one class; revisit before large-scale use.
- There are no rate limits or abuse controls on anonymous sign-in or joins yet.
- Questions are text only (no images).
- Home → "Host a game" / "Join a game" and the Join tab now point to `/live/host` and `/live`. The old `/host` and `/join` pages still exist but aren't linked.
- Boss hurt and defeated poses use CSS effects on the idle art until Codex delivers the dedicated poses.
- Production rollout needs: a reviewed migration path, a decision about the shared database, and real-device testing over the internet. A codespace port is private to your GitHub login.
