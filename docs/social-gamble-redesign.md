# Social-Gamble Redesign — "Trust or Bust"

Status: **design + working vertical slice** (2026-07-06). Fast, punchy rounds of Prisoner's Dilemma powered by HSC science questions. Designed for remote-primary, zero dead time, sub-30s round pacing.

---

## 1. The problem & design goal

Gimkit's classroom deduction modes fail because **they're slow** — discussions, voting phases, slow reveals create dead time and kill energy. Trust or Bust inverts the strategy: **eliminate discussion, force simultaneity, and drive replayability through randomness and reputation**.

Core bet: Kids love betrayal moments (Among Us, Mafia, social-deduction). The tension in Trust or Bust comes *not* from figuring out who's lying, but from committing to share/steal with someone you've seen betray before — and maybe being wrong about them. Reputation is the texture; speed is the engine.

**Platform:** Same as Heist (laptop-primary, WASD/mouse capable, but fully playable with buttons). Remote-viable: no verbal discussion required; all interaction is UI-driven.

---

## 2. The core mechanic

### 2.1 Round loop (~25s target)

1. **Question (18s)** — Synced quiz round, self-driving clock. Correct answers = points earned (50–100, speed-scaled). Wrong = small trickle (+5). Points accumulate into a personal pool.

2. **Pairing (instant)** — Server randomly assigns a partner (rotating to avoid repeats). Brief reveal: "You're paired with **Alice** this round" + optional reputation hint (e.g., "Alice has **stolen 3 times** from you").

3. **Pot calculation (instant)** — Each player's *pending points this round* become the **shared pot** (both players' points pooled). Secret modifiers may change the pot math (e.g., Forced Cooperate: you keep your points; Double Steal: pot is 2x if stealing).

4. **Decision window (5s)** — Simultaneous choice screen: **SHARE** (both gain equal split) vs **STEAL** (you take the whole pot, partner gets 0). Buttons lock at 5s or immediately on choice. Display: a timer, flavor text ("Choose wisely..."), and the pot size.

5. **Simultaneous reveal (2s)** — Server collects both choices, reveals outcome to both players + room:
   - Both SHARE → each gets `pot / 2` (trust rewarded)
   - One STEAL → stealer gets `pot`, partner gets 0 (betrayal payoff)
   - Both STEAL → both get 0 (mutual destruction; "nobody wins")
   
   Juice Kit fires on each outcome: green burst + float for mutual share, red flash for theft, grey shake for mutual steal.

6. **Reputation update (instant)** — Each player's betrayal/trust record updates visible to the room (e.g., "*Alice* stole from *Bob* this round").

7. **Loop (repeat) or Finish** — If match has rounds remaining, loop back to step 1; if not, tally final scores and show leaderboard.

### 2.2 Individual-now / teams-later seam

**Now (this build):** Players are individuals. Reputation is per-player. Pairing is random. Points are personal.

**Later (extensible):** Swap the pairing logic to assign each team a fixed pair slot (e.g., Crimson A pairs with Violet A each round, Crimson B with Violet B). Reputation becomes team-level. Economy stays the same. **The server RPC doesn't change — only the pairing algorithm and the leaderboard aggregation.**

---

## 3. Points & economy

### 3.1 Income sources

| Source | Amount | Who | Notes |
|---|---|---|---|
| Correct answer | +50–100 gold | Personal pool | Speed-scaled (faster = more) |
| Wrong answer | +5 gold | Personal pool | Inclusivity trickle |
| Mutual share | +`pot/2` | Personal pool | Next round |
| Solo steal | +`pot` | Personal pool | Next round |
| Mutual steal | 0 | — | Round is washed |

**Energy** is NOT used here (unlike Heist's raid cost). Power-ups are purchased with points directly, making points a **points sink** that prevents runaway wealth.

### 3.2 Power-ups (purchasable mid-match)

Purchasable with points *after* a decision reveals. Cost is immediate; effect is next round or this-round-override.

| Power-up | Cost | Effect | Why | Max per match |
|---|---|---|---|---|
| **Peek** | 50 | See partner's choice 2s before you lock | Reduce uncertainty; gating on reputation | 1 |
| **Shield** | 30 | Next steal against you is negated (you keep half pot) | Insurance against betrayal | 2 |
| **Double Pot** | 40 | Your pending points are 2x this round | High-risk gamble | 2 |
| **Reputation Wash** | 25 | Hide your betrayal record for this round from your partner | Deception tactic | 1 |
| **Ally Lock** | 35 | Force next partner to be someone you name (if they're in the room) | Coalition building | 1 per match |

These are extensible: new power-ups plug in as new rows in the `power_ups` table + RPC validation.

---

## 4. Secret modifiers (server-side, hidden until reveal)

Each round, the server optionally selects a **modifier** that twists the math or rules. Invisible to players until after both choices lock. Modifiers drive replayability: "One more round to see if the Betrayal Tax turns the tables."

| Modifier | Probability | Effect | Reveal timing | Why |
|---|---|---|---|---|
| **Forced Cooperate** | 20% | STEAL buttons are disabled; both can only SHARE | At decision start (grayed out) | Forces trust; breaks revenge cycles |
| **Double Steal** | 15% | If you STEAL, you get 2x the pot instead of 1x. Others see it. | At reveal | Tempts high-risk plays; reputation tax is visible |
| **Spy Mode** | 10% | One random player sees both choices 2s before reveal | 2s pre-reveal | Creates alliances; unpredictable advantage |
| **Betrayal Tax** | 18% | If you STEAL, you lose 10% of personal points | At reveal | Punishes betrayal; protects the weak |
| **Blind Round** | 15% | No reputation is shown for this round (fresh slate) | At decision start | Resets grudges; prevents vendetta spirals |
| **Sympathy Bonus** | 12% | If you SHARE and partner STEALS, you get 50% of pot (not 0) | At reveal | Rewards trust even in betrayal |
| **None** | 10% | Standard rules (no modifier) | — | Baseline |

**Modifier selection:** Server picks one per round (weighted random, ensuring variety). Shown after the round reveal, not before, so it doesn't influence the choice.

---

## 5. Leaderboard & progression

### 5.1 Live match board

During a match, each player's current score is visible. Post-reveal, the room sees:
- Player name
- Points this round
- Decision (SHARE / STEAL)
- Outcome
- Running total

### 5.2 Persistent leaderboard (season-based)

When a match finishes, each player logs a `gamble_match_log` row:
- `user_id`, `match_id`, `finished_at`
- `points_earned`, `rounds_played`, `shares`, `steals`, `caught_steals`

`gamble_leaderboard(p_days)` ranks players by:
- **Primary:** Total points (all-time engagement)
- **Secondary:** Win rate (shares vs steals ratio, how often you correctly read your partner)
- **Tertiary:** Games played (consistency)

Variants (future):
- "Most Trusted" (highest share % from others)
- "Most Betrayed" (most steals against you)
- "Comeback Kings" (largest single-round steal)

---

## 6. Multiplayer architecture (reusing Heist's 3-layer pattern)

### 6.1 Layer split

| Layer | What | Transport | Authority |
|---|---|---|---|
| **Engine** | Synced rounds, questions, clock | `gamble_rooms` / `gamble_players` rows + `postgres_changes` | Postgres RPCs |
| **Economy** | Points, power-ups, choices (share/steal), match log | new RPCs: `gamble_decide` (submit choice), `gamble_power_up` (buy), `gamble_me` (get state), `gamble_leaderboard`; new tables: `gamble_choices`, `gamble_power_ups` | Postgres RPCs — server validates costs, modifier logic, loot clamps |
| **Action** | Partner identity, reputation hints, modifier reveal, live scores | `sb.channel('gamble-live:{room}')` **broadcast** ≤10Hz — reveal events, score ticks, reputation updates | Ephemeral broadcast, never persists |

### 6.2 Simultaneous reveal integrity (critical)

**Problem:** If the server reveals one player's choice before the other submits, the second player can react. Clients can't be trusted to not peek at network traffic.

**Solution:**
1. Client submits `gamble_decide(choice: 'share' | 'steal')` RPC.
2. Server writes to `gamble_choices` with `status='locked'`, `chosen_at=now()`.
3. When both players in the pair have locked (or 5s timeout fires), server:
   - Calculates outcome using *both* locked choices
   - Writes outcome row to `gamble_results` (this triggers the broadcast event)
   - Broadcasts both choices + outcome to the room
4. Clients receive both at the same time; neither could peek.

**Broadcast message** (one payload per pair reveal):
```json
{
  "type": "reveal",
  "pair": ["player_a_id", "player_b_id"],
  "choices": { "player_a_id": "share", "player_b_id": "steal" },
  "outcome": { "a_points": 0, "b_points": 150 },
  "modifier": "none"
}
```

### 6.3 Latency rules

- **No live positioning**: Unlike Heist (raider position broadcast), there's no 10Hz stream. Decisions are atomic: locked or not locked.
- **Modifier reveal is post-hoc**: Modifier is calculated server-side, never transmitted until the round is done. Clients cannot predict or game it.
- **Reputation is eventual**: Partner identity + rep hints are sent *after* the previous round finishes. No information leakage during decision.

### 6.4 Robustness

- **Abandoned decision:** If a player's heartbeat fails during the decision window, the 5s timeout fires. Their choice defaults to SHARE (risk-averse), and the round proceeds. On rejoin, they see the outcome.
- **Power-up purchase rejection:** If a power-up purchase hits an error (insufficient points), the client retries with visual feedback; economy is atomic (RPC succeeds or fails cleanly).
- **Drop mid-match:** `startHeartbeat` + `gamble_rejoin` recovery restore the player to their current round and pending points.

---

## 7. Round timing (pacing is the constraint)

Target: **25s per round** → **6 rounds = 150s (~2.5 min) per match**.

| Phase | Duration | Why |
|---|---|---|
| Question | 18s | Synced self-driving clock (from Heist) |
| Pairing reveal | 0.5s | Instant RPC + broadcast |
| Decision window | 5s | Hard deadline (forces commitment) |
| Reveal animation | 1s | Juice flash/shake |
| Reputation update | 0.5s | Instant RPC |

Leeway: 0–2s between rounds (power-up purchases, UI transitions). Total: ~25–27s per round.

**Why this matters:** If a round is 60+ seconds (like a classroom discussion), kids tune out, side conversations start, momentum dies. 25s is fast enough that waiting for the next round feels natural; the fun is in the *repetition* with the same cohort, not in each individual round.

---

## 8. Numbers (first-pass tuning, all server-side)

| Knob | Value |
|---|---|
| Points per correct answer | +50–100 (speed-scaled, same as Heist) |
| Points per wrong answer | +5 |
| Mutual SHARE payout | `pot / 2` each |
| Solo STEAL payout | `pot` to stealer, 0 to partner |
| Mutual STEAL payout | 0 to both (washed) |
| Decision window | 5s (hard timeout) |
| Peek power-up reveal delay | 2s before lock (gives false security) |
| Shield power-up (negated steal) | Partner gets `pot / 2`, you keep `pot / 2` |
| Rounds per match | 6 (scalable) |

---

## 9. File map (vertical slice)

- `supabase/migrations/20260706_gamble_base.sql` — schema: `gamble_rooms`, `gamble_players`, `gamble_choices`, `gamble_results`, `gamble_match_logs`, `gamble_power_ups`; RPCs: `gamble_quick_join`, `gamble_join`, `gamble_state`, `gamble_submit` (question answer), `gamble_decide` (share/steal), `gamble_power_up` (buy), `gamble_me`, `gamble_leaderboard`.
- `lib/gamble.ts` — client bindings (matching Heist's pattern): types, RPCs, broadcast channel helper.
- `app/gamble/page.tsx` — active screen: question pane + decision pane, partner/reputation display, power-up shop, reveal animations.
- `components/gamble-ui.tsx` — isolated button/modal components for decision, power-up purchase, reputation hints.

---

## 10. Extension contract — the social-game pattern

### 10.1 Individual → teams variant (plug-in)

**Change:** Pairing algorithm + leaderboard aggregation. Economy stays the same.

1. **Pairing RPC:** Instead of random per-player, assign fixed pair slots per team. E.g., `gamble_team_decide` specifies your team slot (A / B), and you're always paired with the other team's same slot.
2. **Leaderboard:** Aggregate `gamble_match_logs` by team, not player.
3. **Reputation:** Per-team, not per-player. "Team A has stolen 5 times."

**Code seam:** The decision RPC doesn't change; only `gamble_decide_pair` (which selects the opponent) swaps logic.

### 10.2 Add a new power-up

1. Add a row to `gamble_power_ups` table (name, cost, description, effect_type).
2. Update `gamble_power_up` RPC to handle the new effect_type and validate cost.
3. Add UI in the power-up shop modal.
4. Test by purchasing and verifying the next-round effect.

Example: "Copycat" (cost 60): Your next choice matches your partner's (mirrored). Server tracks this as a power-up flag on the player row, and `gamble_decide` checks it.

### 10.3 Add a new secret modifier

1. Add a row to `gamble_modifiers` table (name, weight, rule_json).
2. `gamble_decide_pair` (or a helper) runs the modifier logic when calculating outcomes.
3. Include the modifier name in the broadcast reveal so the UI can show flavor text.

Example: "Revenge Mode": If you've been stolen from in the last 3 rounds, STEAL costs 10 fewer points (discount). Server calculates this in the outcome RPC.

---

## 11. Vertical slice — in / out

**In (this build):**
- Question engine (same as Quick Game, self-driving clock)
- Pairing RPC + partner reveal
- Decision window (SHARE / STEAL buttons, 5s timeout)
- Simultaneous reveal via RPC + broadcast
- 1–2 working power-ups (Peek, Shield)
- 2–3 working modifiers (Forced Cooperate, Betrayal Tax, Blind Round)
- Live score display + reputation tracking
- Juice Kit wiring (flash/burst on reveal)
- Finished-screen with match results + season leaderboard

**Out (deliberate):**
- Sound
- Spectator UX (who's paired, reputation hints for observers)
- Chat/emotes (structured input only — may add reactions later)
- Team variant code (seam defined, not implemented)
- Advanced power-ups (Ally Lock, Reputation Wash)
- Rare modifiers (Spy Mode, Sympathy Bonus)
- Anti-cheat beyond RPC validation
- Art (placeholder buttons/text, no sprites)

---

## Key decisions protecting pacing & integrity

1. **5s decision window is hard.** No negotiation phase. No discussion. The tension is in committing without knowing what your partner will do — just like the real Prisoner's Dilemma. Once time's up, you're locked in.

2. **Server-authoritative reveal.** Clients submit choices to the RPC; the server collects both and reveals them atomically. No peeking at network logs, no race conditions.

3. **Modifiers are server-picked and post-hoc.** They're revealed *after* the choices lock, so they don't influence the decision. This makes them purely for variety and replayability, not strategy.

4. **Reputation is eventual.** Your partner's betrayal history is shown *after* the previous round ends, not during the next decision. Gives time for emotional processing and revenge planning without creating a discussion window.

5. **No dead time.** Everyone plays every round. If you lose on a round, you still answer the next question and get a fresh pot. No elimination, no spectating.

6. **Power-ups are a points sink.** Without power-ups, points only flow out as revealed payouts. Power-ups create a choice: spend points now for an edge, or save for later. This prevents one player from dominating by points alone.

---

## Playtest focus

- **Pacing:** Do 25s rounds feel snappy enough to want to play 6+ more?
- **Betrayal tension:** Does seeing a partner's name + reputation create enough anxiety to *want* to betray or trust?
- **Modifier delight:** Do hidden modifiers feel fair when revealed, or frustrating?
- **Power-up balance:** Are Peek and Shield fun without breaking the game?
- **Teams-later seam:** Does the architecture feel like it could plug in a team variant without major refactors?
