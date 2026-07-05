# Live-game robustness — presence, late-join, drop recovery

> Foundation C of [`games-to-gimkit-plan.md`](./games-to-gimkit-plan.md), for Knockout,
> Heist and the Live Class Game. Built + multi-client-verified 2026-07-05.

## Files

| File | Role |
|---|---|
| [`supabase/migrations/20260705_arena_robustness.sql`](../supabase/migrations/20260705_arena_robustness.sql) | Applied to live DB (via MCP). Presence table + heartbeat, late-join, rejoin RPCs, present-only counts, `ko_advance` shield bugfix |
| [`lib/presence.ts`](../lib/presence.ts) | Client: `startHeartbeat`, arena-session stash (localStorage), `arenaPresences`/`isPresent` |
| `lib/knockout.ts` / `lib/heist.ts` / `lib/live.ts` | `koRejoin` / `heistRejoin` / `liveRejoin` wrappers |
| `app/knockout/page.tsx` / `app/heist/page.tsx` / `app/join/page.tsx` | Heartbeat lifecycle + "↩️ Rejoin" offer card |
| [`app/host/page.tsx`](../app/host/page.tsx) | Lobby presence: "N in · M disconnected", greyed 📴 chips |
| [`scripts/test-arena-robustness.mjs`](../scripts/test-arena-robustness.mjs) | 15-assertion multi-client REST simulation (rerunnable) |

## How presence works

- One shared table, **`arena_presence`** `(player_id pk, room_id, mode, last_seen)` —
  **deliberately NOT in the `supabase_realtime` publication**. 30 players beating every
  10s would otherwise broadcast ~3 events/s to every subscriber and each would trigger a
  full state re-sync. Presence is *polled* where it's displayed (host lobby, 10s), and
  folded into counts server-side everywhere else.
- Clients call **`arena_heartbeat(mode, player_id)`** every 10s (plus immediately on join
  and on `visibilitychange`, which is what snaps a phone back to "present" after unlock).
  The RPC derives `room_id` server-side from the player row — clients can't spoof rooms.
- **Present** = `coalesce(presence.last_seen, player.joined_at) > now() - 25s` (two missed
  beats). The `joined_at` fallback covers the moments before a first beat lands and keeps
  pre-heartbeat clients countable for 25s.
- What uses it: `ko_state.players`, `heist_state.players`, lobby auto-start **arming**
  (`_ko_add_player` / `_heist_add_player` — a ghost row can no longer arm a countdown and
  start a 1-player game), `live_answer_count.total` (host's "18/30 answered" isn't held
  hostage by ghosts), host lobby display.
- What does NOT use it: Knockout `alive`, elimination, scoring. Disconnected players die
  organically by not answering — deliberately no auto-prune, so a wifi blip at round end
  can't kill a live player.

## Late-join

`ko_join` / `heist_join` / `join_game` now accept games with `status='active'`
(finished/complete/expired still reject; KO caps at 60 players, Heist at 40).
- Knockout late-joiners enter **alive** at the current round; `ko_advance` skips
  eliminating anyone with `joined_at > round_started_at`, so the round in progress can't
  kill them before they've seen a question.
- Live Class `join_game` returns `status` as before — the join page's `loadState` already
  routes 'active' straight to the current question. Zero client change needed for this.

## Drop recovery

- On every join, the page stashes `{code, room, player, alias, team}` per mode in
  localStorage (`legends_arena_<mode>`, 3h TTL — matches room expiry).
- On landing back on the pick screen, a stash produces a **"↩️ Rejoin game CODE"** card.
  Clicking calls `ko_rejoin` / `heist_rejoin` / `live_rejoin(code, alias)` which return
  the **existing player row** (same `player_id` → score/alive/team/gold all intact),
  matched case-insensitively by alias, preferring a row owned by the caller's `auth.uid()`.
- The stash is cleared on Leave, on game finish, and when a rejoin fails.

## Bugfix folded in (found during Juice-Kit browser testing)

`ko_advance` eliminated wrong-answer players with
`not (powerup = 'shield' and powerup_used_round = p_round)`. For a player **holding an
unused shield**, `powerup_used_round` is NULL → the clause evaluates NULL → the row fails
the WHERE → **never eliminated**. Half of all players draw a shield, so any of them who
never spent it was silently immortal. Fixed with `coalesce(powerup_used_round, -1)`.
Regression-tested in `scripts/test-arena-robustness.mjs` §4.

## Verified (2026-07-05)

- **REST simulation** (15 assertions, all passing): ghost lobby dropped from counts +
  can't arm auto-start · KO/Heist/Live late-join into active games · late-join round grace ·
  all three rejoins restore the same player (case-insensitive; unknown alias → empty) ·
  shield regression · present-only answer denominator.
- **Browser simulation** (Playwright, multiple contexts): Knockout player answered
  (score 144), hard-reloaded the tab, got the Rejoin card, clicked, and was back in the
  same game with the same player id + score. Host lobby showed "1 player in ·
  1 disconnected" with the dead student greyed out ~40s after their tab closed.

## Still needs a real-device pass (flagging honestly)

- iOS Safari/Android Chrome heartbeat behaviour on **locked phones** (browsers throttle
  timers aggressively; the visibilitychange beat handles re-entry but the disconnect
  window on a locked phone may run longer than 25s).
- Real classroom wifi drops (vs. simulated tab-close).
- **Deploy-order caveat**: the DB is already migrated; until the client with heartbeats is
  deployed, lobby "players in" counts fall back to the 25s `joined_at` grace — a lobby
  where one old-client player waits >25s before the second joins will show 1 and won't arm
  auto-start until someone (re)joins. Ship the client promptly after merging.
