# XP integration contract, verified 2026-10-18

Read-only catalog inspection followed confirmation that repository project-ref matches the connected active project. No player, student, account or ledger rows were read. This document contains schema/function behavior only.

The deployed `claim_game_xp(uuid)` returns `awarded integer, total_xp bigint` and:
- requires `auth.uid()`;
- reads the player's score, user_id and room subject;
- treats any non-null player user_id as already saved;
- assigns the caller user_id;
- inserts xp_events with reason_key `live_game:<player UUID>`, amount `greatest(score,0)`, kind `xp`;
- retains subject only for biology, chemistry, physics, maths, science, maths-standard, maths-advanced, maths-ext1; otherwise NULL;
- inserts or increments user_stats.total_xp and updates updated_at, returning the total.

The existing function does not establish participant ownership, completion or a safe concurrent claim marker. Calling it from the replacement would reintroduce those defects. Signed-in joins already populate user_id, so ownership must remain separate from the new claim marker.

Catalog-confirmed ledger shape:
- xp_events: id UUID default gen_random_uuid; user_id UUID; reason_key text; amount integer; kind text default xp; nullable subject text; created_at timestamptz default now. All except subject are NOT NULL.
- xp_events primary key id; UNIQUE(user_id,reason_key); amount >= 0; kind in xp/bonus_coin; subject NULL or the eight values above; user_id references user_profiles(user_id) ON DELETE CASCADE.
- user_stats: user_id UUID primary key referencing user_profiles(user_id) ON DELETE CASCADE; total_xp and coins bigint NOT NULL default0; updated_at timestamptz NOT NULL default now.
- Neither table has non-internal triggers at inspection time.

Replacement claim requirements: hold room/player and claim locks, independently verify the signed-in destination and guest possession, require completion, preserve existing owner, insert immutable player-scoped claim and matching ledger event plus aggregate in one transaction. Never increment on an already matching event; a conflicting existing event or inconsistent amount must fail closed for reconciliation. Return the original award and authoritative account total with explicit bigint transport validation. A global unique claim per player is required because the legacy ledger unique key alone permits the same player reason across two users.

The reviewed scoped adapter keeps claim blocked, rather than substituting the test_xp accumulator or invoking the unsafe legacy RPC. A separate local ledger implementation now passes 18 tests and independent review against this recovered contract, including a clearly labeled minimal synthetic user_profiles identity dependency. Production role/schema/auth integration, native contention and retirement of the unsafe legacy RPC remain prerequisites. No production permissions or credentials are configured.
