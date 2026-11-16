# Wallet award boundary: deployed finding and cutover plan

Status: point-in-time read-only metadata inspection, 3 November 2026. No student records, coin balances, secrets or application data were queried; no function was invoked and no production change was made. This is not a live exploit test or a complete audit of wallet interfaces.

## Observed deployed function

The connected HSCScienceSyd project reported a `public.credit_coins(integer,text,jsonb)` function with `SECURITY DEFINER`, `anon` execute privilege **false**, and `authenticated` execute privilege **true** (`has_function_privilege`, including inherited privileges). Its body obtains the recipient from `auth.uid()` and rejects a null actor and null/nonpositive `p_amount`. For a positive amount it increments that actor's `user_stats.coins` and inserts a ledger entry using caller-provided `p_amount`, `p_reason` and `p_meta`.

The inspected body contains no link to an authoritative game receipt, per-award maximum, replay/idempotency key, or rule limiting the submitted amount to a game result. **Inference:** an authenticated caller able to invoke this endpoint can request an arbitrary positive integer award to their own balance; the body does not authorize crediting another user. The query did not test execution, external rate limiting, wallet UI, deployed callers or activity logs. This finding alone does not establish actual exploitation. `p_amount` is a PostgreSQL `integer`; actual end-to-end bounds may also depend on other layers not inspected.

The local Tycoon UI sends the client-computed `correctCount * 2 + 5` to this function. Hiding the UI call, reducing a display amount or relying on a client-side cap would not close a reachable caller-supplied credit endpoint. Supabase anonymous Auth users, if enabled, also use the `authenticated` database role and require explicit policy evaluation; the observation does not establish whether anonymous Auth is enabled on this project.

## Local call inventory

The following is a search of local source and retained migrations, **not** a claim that every retained routine is currently deployed or that the list covers external clients or dynamically generated calls.

| Local location | Caller/reason |
| --- | --- |
| `app/play/page.tsx` | Quick Game: client-computed `quick_game` amount |
| `app/tycoon/page.tsx` | Tycoon: client-computed `tycoon` amount |
| `app/match/page.tsx` | Match: client-computed `match` amount |
| `app/type/page.tsx` | Type mode: client-computed `type_game` amount |
| `supabase/migrations/20260614_campaign.sql`; `20260616062519_campaign_defeat_unlock.sql` | Campaign reward, with later retained replacement |
| `supabase/migrations/20260613_legend_cards.sql`; `20260616085738_campaign_loot_card.sql` | Duplicate-card refund and sell-back; later retained campaign loot replacement |
| `supabase/migrations/20260613_retention.sql` | Daily spin and quests |
| `supabase/migrations/20260703_seasons.sql`; `20260703_events.sql` | Season and event rewards |
| `supabase/migrations/20260622013753_research_hq_base.sql` | Research HQ reactor |

The repository describes this Supabase project, authentication and progression as shared with hscscience.com.au. That is a material compatibility risk: external clients, triggers, scheduled jobs or `SECURITY DEFINER` functions may rely on the same signature. Their current call paths were not inspected here. Revoking execute, deleting or changing the signature without a complete caller/grant inventory can break those features. Conversely, keeping a known callable arbitrary-credit function during an extended migration retains the exposure; prioritize an owner-led, coordinated containment/cutover.

## Bounded migration and cutover proposal

1. **Inventory before changes.** On authorized staging and by scoped production metadata review, inventory function overloads, effective grants for every relevant role, function callers/dependencies, direct clients, account types and the shared site's contracts. Confirm whether anonymous Auth is enabled and how users retain sessions. Do not inspect individual student data to establish the contract. Establish a rollback and monitoring plan and identify who owns each caller.
2. **Server-owned reward sources.** Define one authoritative receipt per game completion with actor, mode, version, verified event/attempt history, server deadlines and server-calculated reward. Use a uniqueness constraint on the run/completion identity. The client sends only an authenticated run identifier and expected action/idempotency identifiers; it never submits the reward amount, grade, score, question keys or recipient. Any external or administrative credit path must have a separate narrow privilege and explicit audit trail, not reuse a broadly callable arbitrary amount function.
3. **Atomic credit once.** In one short database transaction, validate actor ownership and session eligibility, lock the completion, insert a unique ledger claim and update balance only if that insert succeeds. Retrying the same claim returns the recorded result. Reject malformed/foreign/stale actions; protect totals against numeric overflow. A changed-parameter retry must not alter the old award. Server time, session length, per-run question count and reward rules need explicit caps. Also address repeated legitimate run farming and rate/abuse controls; an idempotent *single* run is insufficient as an account-wide limit.
4. **Migrate each caller, including external clients.** Implement replacement RPCs and client adapters in staging, migrate Quick, Tycoon, Match, Type and each verified server-side reward feature to their own server-calculated claims. Coordinate the shared site's rollout and old client cache/service-worker expiry. Audit card refunds and other server-origin rewards separately; their eligibility rules and failure handling differ from games. Never invent or backfill claims for historic client-reported awards.
5. **Close the old entry point after compatibility readiness.** Once all known callers use verified replacements and old clients have a controlled upgrade path, revoke direct execution of the legacy function for untrusted roles, preserving narrowly scoped server-only use if independently justified. Coordinate the moment of restriction with service owners and an incident-response decision; do not deploy this proposal or unilaterally disrupt the shared application. Verify effective privileges and reachable wrappers, not just a direct grant statement. Confirm that no privileged wrapper forwards caller-controlled amounts.
6. **Test and monitor.** In isolated staging with synthetic users and distinct database connections, prove foreign-run denial, no key leak, forged scores/amounts ignored or rejected, deadline/phase checks, deterministic retries, concurrent duplicate claim gives one ledger row and one balance increment, rollback after ledger insertion restores all state, and old-client error/recovery. Test both account and guest identities and every migrated shared-site reward. Record metrics and alerts for failed/duplicate/unusual award attempts without logging secrets or unnecessary student data.

Rollback must not reopen unrestricted credits as an automatic response to unrelated UI failures; restore a known safe compatible release or use an audited, narrow server-owned fallback. Any emergency containment or deployment remains an operational decision requiring review of shared-service impact.

## Local prototype and limits

[`prototypes/tycoon-security`](../prototypes/tycoon-security/README.md) is a separate synthetic SQL experiment for server-selected questions, capped per-run upgrades, checked answers and one completion/ledger credit. It does not use the deployed function or project. Its synthetic actor is not a credential, its question and economy rules are proposed examples, and it is not a deployable migration. Real authenticated/anonymous roles, complete source and schema inventory, account-wide farming limits, browser access, shared-service cutover and connected staging tests remain open. Keep the existing unrelated multiplayer lockdown intact.
