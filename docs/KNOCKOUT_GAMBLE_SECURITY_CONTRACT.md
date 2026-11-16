# Knockout and Gamble: security remediation contract

Status: source review and proposed contract, updated 3 November 2026. This document is a release blocker and an implementation guide. It does not establish that the live system matches the retained migrations.

## Deployed execute-grant observation

A separate read-only deployed metadata check reported that migration `20260922210008 sec_lockdown_unused_game_estate` was applied. For the inspected `ko_submit`, `ko_rejoin`, `gamble_submit` and `gamble_rejoin` functions, `has_function_privilege` returned **false** for both `anon` and `authenticated`. These four inspected execute paths are therefore closed to those roles in that observation; the local client calls that require them may fail. The bodies and vulnerabilities described below are retained-source findings and would matter if equivalent functions were re-exposed without appropriate fixes.

This is a point-in-time, four-function observation passed to this review; it does not establish the function signatures inspected here, current live function bodies, other roles, other RPCs, table grants, views, Realtime publications, RLS policies or alternate access paths. It is not a full deployment security audit, exploit test, or proof that every Knockout/Gamble operation is closed. No database write, migration or deployment was performed for this documentation update.

**Keep the observed lockdown in place. Do not grant access to the legacy functions to make a mode appear playable.** Re-exposure requires the reviewed ownership and private-read contracts below, deployment-specific grant inspection and staging verification first.

## Findings in retained source

The latest retained `ko_submit` body is in `supabase/migrations/20260622035416_knockout_powerups.sql`: it accepts a player UUID, looks up that row, and does not verify that the caller owns it. `ko_powerup` and `ko_use_powerup` use the same caller-supplied ID pattern. The later `20260705_arena_robustness.sql` replaces other Knockout functions, but does not replace these. `ko_players` and `ko_answers` have unconditional `anon`/`authenticated` select policies in `20260611_knockout.sql`; whether the Data API currently grants access must be verified against staging. Publicly readable choice and correctness can leak an answer. `ko_rooms.question_ids` also exposes the current and future question identities if the room table is selectable, so access to the underlying question bank and its selectors must be reviewed as part of answer secrecy.

`ko_rejoin` in `20260705_arena_robustness.sql` matches on room code and alias; ordering a matching `auth.uid()` first does not prohibit returning a different user's row. A room code and alias identify a seat but do not prove its ownership. `arena_heartbeat` accepts player IDs across multiple modes and also needs ownership validation; changing it requires coordinating Heist and classroom callers.

`20260706_gamble_base.sql` has unconditional select policies on `gamble_rounds`, `gamble_submissions` and `gamble_choices` for both anon and authenticated. `gamble_rounds` contains `correct_index` for every stored question, and `gamble_choices` contains the pre-reveal share/steal choice. A policy allowing selection is not itself proof that deployed table grants or Realtime publication expose those rows; verify the actual API and realtime channels independently. Its `gamble_state` function is invoker, so simply denying table reads without changing that function can break the client. The existing client also subscribes to room, player and results tables, and reads results directly.

The retained `gamble_submit` function does not verify participant ownership, room membership, current phase/round, deadline or choice bounds. On conflict it updates an existing answer and randomly recalculates the stake. It returns the answer key immediately. `gamble_decide` accepts player and partner IDs without verifying the caller or the pairing. Rejoin uses code and alias only. `gamble_populate_questions` accepts client-supplied question text and answer keys; `gamble_start`, `gamble_advance`, pairing/default/bot functions and `gamble_reveal_round` need a complete caller/grant and transition audit. The retained reveal function performs `insert ... on conflict do nothing`, followed by unconditional balance updates: simultaneous callers may race past the pre-insert existence check, so the later conflicting transaction can still pay. Verify with real concurrent transactions.

Apart from the limited execute-grant observation above, retained migrations do not establish the complete production schema, grants, default privileges, database configuration, current question bank policies, or deployed function bodies. Anonymous players are deliberately supported, with `user_id = null`; simply adding `auth.uid() = user_id` would reject them. Do not substitute a public player UUID, alias or room code for a credential.

## Target participant identity

Prefer a Supabase anonymous Auth session for every guest, subject to confirming that anonymous sign-ins are enabled, supported by the product, and compatible with existing auth/account linking. Then every player row has a non-null `user_id` bound to `auth.uid()`. Retain the same guest session on refresh, and check the specific player row and room for every mutation. Anonymous Auth uses the `authenticated` Postgres role; role membership alone does not prove participant ownership or a permanent account. A separate host capability/owner must be checked for host operations.

If anonymous Auth cannot be used, design an opaque high-entropy guest capability, delivered only to the owning client, with a server-side hash, expiration, revocation, safe transport and recovery model. A guest secret cannot be recovered from a room code/alias; an explicit reconnect mechanism and its cross-device limits are required. Do not store raw capabilities in broadly selectable tables, send them through Realtime or include them in logs.

Do not attempt to claim or migrate an existing unowned guest seat using alias matching. Existing sessions can finish under a controlled old-version policy or be drained and restarted; a security boundary cannot be inferred retroactively from identity-free records.

## Safe read and realtime contract

1. Remove direct client access to answer keys, private choices and raw submissions; test both table and function privileges. Publish only public room state and scoped player state. Do not rely on column omission in one UI call while a table or alternate function remains readable.
2. Expose a room-scoped current-question endpoint returning stem/options, phase, server timestamps and a version, with no correct key before the allowed reveal. Keep underlying question IDs and future answers private where alternate selectors expose keys.
3. Return the caller's answer receipt only after authenticated ownership validation. Choose an explicit reveal rule; if early feedback is allowed, never let a participant submit for another seat to harvest the key.
4. Return share/steal decisions only after the relevant pair has locked and server reveal is complete. Realtime should signal that a state changed; clients fetch an authorized snapshot. Audit publications, row policies, views and functions for equivalent leakage.
5. Preserve reconnect through an authenticated snapshot including the caller's own receipt and authorized revealed state. A roster may show public aliases and scores but must not expose identities or fields beyond what that room requires.

## Authoritative action contract

All privileged functions need an explicit `search_path`, minimal execute grants and internal ownership checks; internal helper functions should not be callable by arbitrary clients. Validate nulls, ranges and types before use.

- Join returns a participant handle bound to the caller's session; enforce room limits, alias rules and unique/stable ownership. Rejoin uses the existing session/capability, not alias alone.
- Question selection and correct keys come from the reviewed server-side bank. Remove the untrusted client question-population path from public clients.
- Submit takes expected room/round and choice; lock/read authoritative room and player, check ownership, membership, active phase, deadline and option bounds. First submission wins. Retry returns the original receipt, with no reroll, new points or changed answer.
- Power-up purchase/use validates ownership, amount, allowed phase and inventory, and applies once in the same transaction as any spend. Validate the relevant target and protect other players' inventory.
- Start/advance must either verify a host or use a narrowly defined participant-triggered, deadline-guarded state transition. Clients cannot choose arbitrary future rounds; repeated or concurrent attempts are idempotent.
- Gamble pairing is generated server-side. The decision endpoint accepts the caller's own choice and derives the partner from the authoritative pairing; lock the first decision and never return the other choice before reveal. Timeout defaults require a server-owned deadline, not a client's claim that time expired.
- Resolve a pair only once, in one transaction: lock a canonical pair or use a unique insert whose successful `RETURNING` gates all payouts and stats. Verify both participants belong to the exact pairing. A conflicting insert must not pay again.
- Any account XP, Sparks or leaderboard results must derive from server-owned receipts and be awarded once under a uniqueness constraint, not directly from client-reported counts.
- Internal bot actions run server-side against an actual bot pairing and cannot be invoked to write arbitrary player decisions.

## Staging validation and rollout

Before code: capture the current staging schema, exact function bodies, ownership, policies, grants, default privileges and Realtime publication with an authorized read-only inventory. Compare against retained migrations. Read current Supabase auth/RLS documentation and the installed Next.js docs for any changed frontend interfaces. Use a separate isolated staging database and synthetic users; never test exploits against the shared production question bank.

Implement the identity and authorized snapshot boundary first, then one complete Knockout vertical slice, then Gamble. Keep the legacy execute lockdown in force throughout this work; do not restore legacy execute privileges as an integration shortcut. Make changes through locally validated migrations and client adapters together. The migration must state how old clients, in-flight rooms, and account linking are handled; use a maintenance drain/feature flag if incompatible. Keep rollback instructions and verify security under both old/new client compatibility conditions. No incomplete migration should be advertised as securing a mode.

Required integration checks using distinct signed-in users, anonymous-auth guests, unauthenticated callers and two simultaneous database connections:

1. Another player cannot submit, rejoin, read a private receipt, use power-ups, buy or choose on someone else's behalf, even with their UUID, alias and room code.
2. Wrong-room, stale-round, early, late, invalid-option and ended-game actions fail without side effects. Future question IDs, keys and choices are unavailable before authorized reveal through table reads, RPCs, views and Realtime.
3. Same answer retry returns the same receipt and stake; changed-answer retry cannot change it. Simultaneous requests award once. Server-generated questions cannot be replaced by a client.
4. Only the assigned partner pair resolves; decisions remain hidden until both are locked or a server deadline has passed. Concurrent reveal requests create one result and one payout per player.
5. Duplicate/reordered events, dropped sockets and refresh restore the exact own receipt and revealed result. Guest identity survives allowed reconnect scenarios; identity loss never takes over another seat.
6. Repeated start, advance, expiry and reward claims cannot skip rounds or duplicate XP/currency. Unauthorized heartbeat and bot/default actions fail.
7. Verify that existing UI flows and Realtime updates still work on phone and desktop, plus a 30-player staging load. Run database advisors and inspect least-privilege grants after migration.

Until those checks pass, treat competitive leaderboards, persistent rewards and secret-choice fairness in these modes as unverified. Hiding or relabeling a link alone does not secure a reachable RPC or deployed service.
