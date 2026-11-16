# Shared wallet credit exposure and compatibility plan

Read-only production catalog and relevant wallet-function-definition inspection on 2026-11-03; no account, ledger or other user rows were read, no RPC was invoked, and nothing was written or deployed. This is a point-in-time observation and must be revalidated before any change.

## Confirmed behavior

`public.credit_coins(p_amount integer, p_reason text, p_meta jsonb default null)` is `SECURITY DEFINER`, owned by `postgres`, with `search_path=public`. Catalog reports EXECUTE granted effectively to `authenticated` but not `anon`. Its deployed body checks `auth.uid()` and that `p_amount > 0`, then increments that user's `user_stats.coins` and inserts the supplied amount/reason/meta into `coin_ledger`. There is no source proof, per-call maximum, per-user quota, idempotency key or uniqueness condition in that function. A caller with a valid authenticated context can issue repeated positive requests; the database's integer/BigInt limits are not a meaningful award policy. This is a static, read-only analysis, not an exploit test and not a claim about the extent of historical abuse.

`public.increment_quest(p_metric text, p_amount integer)` is executable by authenticated users and updates matching active quest progress based on the supplied metric/amount, capped at each quest's target. This means the quest reward path needs its own proof-of-completion review; blocking direct credit alone does not establish trustworthy quest earnings. `record_quick_game` and `record_daily_quiz` also accept a client-supplied `p_correct` and derive XP/boss effects from it. Their bodies do not establish server-verified answers. These are distinct endpoints and must not be treated as fixed by a wallet change.

`grant_welcome_bonus` checks the ledger for `welcome_bonus` and then calls `credit_coins`. The observed `coin_ledger` has a primary key on ID and a non-unique `(user_id, created_at)` index; no observed unique `(user_id, reason)` constraint prevents two concurrent check-then-insert calls. Duplicate welcome credit is a **race hypothesis**, not a verified production result; prove it with separate staging connections before choosing a repair. Do not retroactively alter balances or historical rows as part of this work.

`user_stats`, `coin_ledger`, `xp_events` and `user_quests` have RLS enabled. Both roles have broad table-level grants reported for these tables, but observed policies are owner-only SELECT policies and no direct INSERT/UPDATE policy was returned for these tables. Table grants alone do not prove direct mutations succeed; test effective RLS and column privileges in isolated staging. Privileged functions can bypass RLS and require independent authorization checks.

## Known consumers and dependency limits

The current HSC Legends checkout directly invokes `credit_coins` in:

| UI | Reason | Client-derived amount |
| --- | --- | --- |
| `app/play/page.tsx` | `quick_game` | correct count and streak bonus |
| `app/tycoon/page.tsx` | `tycoon` | correct count |
| `app/match/page.tsx` | `match` | elapsed time |
| `app/type/page.tsx` | `type_game` | score |

Those code paths cannot prove answers or score to the server. The application also directly calls `increment_quest` from multiple quiz/arena modes. Some current result screens display an expected reward while Supabase RPC errors can resolve in `{ error }`; absence of a thrown promise rejection is not confirmation that a credit happened.

A read-only name search over deployed public function bodies found references to `credit_coins` in `base_collect`, `campaign_attack`, `campaign_defeat`, `campaign_loot`, `claim_event_reward`, `claim_quest`, `claim_season_tier`, `grant_welcome_bonus`, `open_pack`, `sell_dupe` and `spin_daily`. Each observed function is `SECURITY DEFINER`, owned by `postgres`, and currently executable by authenticated clients. This is a textual call-graph hint, not a complete dependency proof; dynamic SQL, indirect wrappers, triggers, jobs, Edge Functions, external clients and stale deployments may add consumers. Functions that call `spend_coins` include base upgrades, power-up purchases, freezes and card packs. Never revoke or replace functions on the strength of this list alone.

The shared HSC Science Teaching-APP source searched via GitHub at commit `a342328b4dfdbf4fbcebcf8e4072f79e4035a627` calls `award_xp` and `record_study_action` and reads the same `user_stats.total_xp, coins` from [`economy.js`](https://github.com/kyleajames33-beep/Teaching-APP/blob/a342328b4dfdbf4fbcebcf8e4072f79e4035a627/economy.js); its dashboard also reads those values. A bounded indexed code search found no direct non-documentary `credit_coins` caller in that repository; it cannot rule out unindexed files, other branches, cached clients, deployed assets or external integrations. `award_xp`'s observed body has reason rules, per-user idempotency and daily caps; replacing it with this older generic coin flow would strip existing behavior. Preserve the HSC Science action/outbox and wallet read paths throughout any rollout.

## Is there a nonbreaking fix?

There is **no proven change that both preserves arbitrary client-supplied credits exactly and prevents forged credits**: the server currently receives no authoritative game-result evidence that distinguishes the two. Removing direct client access without a replacement will stop the four Legends reward calls; changing `user_stats`, `award_xp`, wallet reads, or shared grants can affect HSC Science as well. UI-only removal does not close the exposed RPC. Per-call caps, reason whitelists, browser-generated IDs and rate limits can limit damage but do not establish that a game was played; retries and concurrent calls still need transactional controls. Any temporary containment needs an explicit product/incident decision, scoped operational review, monitoring and a tested rollback, with clear disclosure if rewards pause.

The observed credit helper and its listed server wrappers share owner `postgres` and the wrappers are SECURITY DEFINER. It is plausible that owner-invoked calls could remain executable after restricting client roles, but this is **not a nonbreaking guarantee**: verify the exact function owner/privileges, nested auth context, all call paths, feature behavior and other consumers in a staging clone, then independently review the full migration. Do not blindly revoke or rewrite production functions.

## Proposed server-owned contract and cutover

1. Establish an authorized, schema-only staging baseline and complete dependency inventory across both applications, deployed clients, jobs, functions, privileges, triggers, column grants, RLS, and the actual real-time release. Do not copy sensitive student rows or credentials.
2. Introduce a separate versioned reward ledger/receipt with stable server-issued event ID, owner, source mode, source instance, versioned policy, computed amount, and unique source/event ownership. Derive the amount from authoritative completed game state or trusted question-attempt receipts; never accept a client amount, correctness count or arbitrary reason as proof. Check ownership/status under transaction locks, insert the unique event and credit once in the same transaction; return the original committed receipt on retries. Fixed legitimate rewards need equivalent server-owned entitlement and uniqueness.
3. Move each of the four direct Legends UI paths to a tested mode-specific completion contract, not to `award_xp` as a generic workaround. Validate their answer and run integrity first; a wrapper around `credit_coins` accepting the same client amount merely moves the vulnerability. Display persistent Sparks only after a confirmed receipt; show pending/error distinctly and retain a bounded, user-bound retry where appropriate.
4. Inventory and review the nested owner-executed wrappers individually, especially `grant_welcome_bonus`, quest progress/claim, campaign and daily reward concurrency. Migrate them to server-derived entitlements and atomic idempotency. Test that trusted existing flows and HSC Science's independently governed `award_xp` / `record_study_action` and wallet reads behave unchanged; inventory both currency and XP writes to `user_stats`.
5. Once all legitimate direct consumers and compatibility windows are addressed, use an independently reviewed staging migration to limit client EXECUTE of the unsafe primitive and keep only narrowly authorized server wrappers. Verify effective `PUBLIC`, `anon`, `authenticated`, owner and service-role privileges and SECURITY DEFINER ownership/search paths. Feature-flag/drain cached clients and test the precise client-visible failure mode and rollback. A generic `(user_id, reason)` unique index is not appropriate: different legitimate game runs can share a reason and historical duplicates may exist.
6. Preserve ledger history, define a source-specific reconciliation/incident process, monitor counts and failures without exposing personal data, and require an explicitly reviewed rollout. A schema or privilege change is not authorized by this plan.

## Required acceptance tests

Against disposable synthetic accounts and real Postgres transactions, with real distinct Supabase JWT roles in a separate test environment:

- `anon`, unauthenticated, wrong owner and a caller invoking the internal credit primitive directly receive permission errors; a user cannot award a different user or submit arbitrary amounts/reasons.
- A valid server-owned game result generates the policy-computed award once; fabricated score, altered difficulty, incomplete/foreign/replayed result, stale or conflicting request is rejected without balance or ledger mutation.
- Two concurrent duplicate claims (including changed payload and lost response) return one committed receipt and exactly one balance/ledger increment; forced failure between insertion and update rolls back both.
- Two concurrent welcome claims yield at most one welcome award; repeated daily, quest, season, pack, refund and base paths remain correct and cannot be triggered from fabricated progress. Test deadlines and timezone rules where relevant.
- Test each actual function owner, all nested wrappers, grants to PUBLIC and client/service roles, RLS, pinned search paths, storage/realtime interactions, and direct table/column writes. Include adversarial negative controls that demonstrate each boundary fails if intentionally removed.
- HSC Science and Legends compatibility: action/outbox retry, `award_xp` caps/reason rules, `record_study_action`, wallet balance reads, signed-out behavior, coins/XP/streak UI, every legitimate server-side earning/spending wrapper, old cached client behavior and rollback. Check real concurrency in Postgres rather than interpreting a single-connection model as proof.

No isolated wallet implementation is claimed here, and no production mutation has been performed.
