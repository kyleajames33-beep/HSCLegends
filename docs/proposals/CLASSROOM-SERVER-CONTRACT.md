# Classroom server contract: unexecuted review candidate

Date: 2026-10-04. This is an API proposal, not an implemented migration or a claim about the deployed database. Do not execute it. No SQL, RPC, grant, authorization or schema was changed in this programme branch.

## Why client work stops here

The repository omits the complete foundational definitions for `game_sessions`, `game_players`, `game_answers`, `create_game`, `start_game`, `next_question`, `get_live_question`, `submit_answer` and `claim_game_xp`. TypeScript return types do not establish runtime semantics. Retained migrations are incomplete/additive and are not a verified database snapshot.

The retained `20260705_arena_robustness.sql` rejoin function uses code/alias matching (preferring a matching signed-in user) and excludes completed games. It is not evidence of a private, owner-bound receipt read. Its `live_answer_count` numerator is all submitted answers while `total` is recently present players; they are different populations. The client cannot calculate missing responses or declare “all in” from those fields. The older count migration had different denominator semantics. Neither file establishes which definition is deployed.

Before SQL can be authored safely: obtain an authorized, versioned baseline without production/student data; review host and guest ownership, RLS and explicit grants; define a disposable local database reset/seed contract; agree the exact scoring and accommodation policy. Guest ownership cannot be an alias alone. Any credential, grant or authentication change requires separate authorization and review. No new credential mechanism is proposed as already available.

## Proposed interface, version 1

These names are deliberately new and are NOT called by the app. Every endpoint derives the caller from an approved server-verifiable host/participant identity. A client-supplied `player_id` is a selector, never proof of ownership. An unauthorized caller receives a uniform `forbidden` response and no room, answer or roster disclosure.

### 1. `classroom_snapshot_v1`

Input: `{ session_id: UUID, player_id?: UUID }`.

Output:

```
{
  schema_version: 1,
  session_id: UUID,
  session_version: integer >= 0,
  server_now: ISO8601,
  state: 'lobby' | 'reading' | 'answering' | 'paused' | 'review' | 'complete',
  question: null | {
    instance_id: UUID, index: integer >= 0, total: integer > 0,
    stem: string, options: string[],
    opens_at: ISO8601 | null, closes_at: ISO8601 | null,
    remaining_ms_when_paused: integer >= 0 | null,
    content_revision: string, syllabus_tier: 'core' | 'extension'
  },
  own_receipt: null | {
    receipt_id: UUID, question_instance_id: UUID,
    accepted_choice: integer, accepted_at: ISO8601,
    is_correct: boolean, correct_index: integer,
    awarded_points: integer >= 0, player_total: integer >= 0,
    explanation: string | null, explanation_revision: string | null,
    explanation_review: 'unassessed' | 'reviewed'
  },
  final_standing: null | { score: integer >= 0, rank: integer >= 1 },
  scoring_policy: { id: string, revision: string, speed_bonus: boolean }
}
```

A valid lobby returns a row with `question: null`; it never disappears because there is no question join yet. `own_receipt: null` means the authenticated participant has no committed answer for that instance, not that another participant did not answer. Correct indices/explanations are omitted until this caller's answer is committed or a host-controlled review phase permits reveal. An empty/malformed response is not interpreted as deletion or zero score. Completed participants can retrieve their own final receipt/standing under a separately reviewed retention policy.

### 2. `classroom_submit_v1`

Input: `{ session_id, player_id, question_instance_id, choice: integer, request_id: UUID }`.

Output: `{ receipt: <exact own_receipt shape above>, session_version }`.

In one transaction: authenticate participant ownership; lock the authoritative session/question; validate the active instance, answer window and choice bounds; atomically insert one answer and update the total. Unique identity is `(session_id, player_id, question_instance_id)`. Retrying the same request returns the identical committed receipt. A changed-choice retry after commitment returns that original receipt without another award, clearly retaining its original accepted choice. Different participants cannot read/replay each other's receipts. Cross-device recovery is a snapshot read, not a fabricated or replayed score award.

### 3. `classroom_host_command_v1`

Input: `{ session_id, expected_version: integer, request_id: UUID, command }`, where command is exactly one of:

- `{ type: 'start' }`
- `{ type: 'open_answers', question_instance_id }`
- `{ type: 'pause', question_instance_id }`
- `{ type: 'resume', question_instance_id }`
- `{ type: 'extend', question_instance_id, extra_seconds: integer > 0 }`
- `{ type: 'reveal', question_instance_id }`
- `{ type: 'next', question_instance_id }`
- `{ type: 'finish' }`

Output: `{ snapshot, applied: boolean }`. Authenticate host ownership and perform expected-version comparison plus state transition under one lock. A version conflict returns `stale_version` with no mutation; the client rereads before asking the teacher again. The same successful `request_id` is idempotent. A double click or second tab cannot skip a question.

Pause/resume operate on server-owned remaining answer time; a local frozen countdown is insufficient. Reading phase gives everyone the stem before the answer window opens. Extension caps, whether a teacher can reopen a closed window, late-join treatment, and opt-in individualized adjustments are explicit product-policy decisions still required. They must be frozen/versioned in the room policy and included in the snapshot. This document does not silently select those policies.

### 4. `classroom_report_v1`

Input: `{ session_id }`, host only, completed session only.

Output: `{ session_id, terminal_version, generated_at, policy_revision, questions: [...] }`, with each question containing:

```
{
  question_instance_id, index, content_revision, syllabus_tier,
  eligible_participants: integer >= 0,
  accepted_answers: integer >= 0,
  correct_answers: integer >= 0,
  unanswered: integer >= 0,
  excluded_or_late: integer >= 0,
  choices: [{ option_index: integer, count: integer >= 0 }],
  explanation: string | null,
  misconception_tags: [{ option_index, tag, source_revision, review_status }]
}
```

These counts must share a documented population fixed by the room policy, not a live-presence denominator. Preserve late/excluded participants separately. Do not count a disconnected/nonresponding pupil as incorrect. Tags require reviewed, versioned pedagogical evidence; absence is explicit. A wrong choice alone cannot diagnose an individual misconception. Default report is aggregate only, with no student names or sensitive accommodation reasons.

## Migration obligations, deliberately not SQL

The future migration must be authored against the approved baseline, with a reversible development migration and independently reviewed deployment plan. It must establish unique committed answer identity, host ownership, participant ownership, versioned question instances, frozen scoring/accommodation policies, server deadline/paused-time fields, one immutable award ledger entry per accepted answer, and one idempotent completion claim. It must specify indexes/locking, retention, export/audit boundaries, least-privilege reads, and explicit grants. It must not discard source curriculum identity, extension tier or explanation-review provenance.

No current claim can be made that RLS, concurrency, deadlines, receipt secrecy or award idempotency satisfy these obligations.

## Required disposable-database tests: NOT EXECUTED

The following are acceptance candidates, not passing tests:

1. Create `room-A` as `host-A`; snapshot before start returns a lobby row. `host-B` receives forbidden for snapshot, roster and every command.
2. Bind `player-A` and `player-B` to distinct approved principals; A cannot select B's receipt, submit for B or claim B's XP, even with known identifiers/alias.
3. Submit the same A/question choice concurrently 30 times with the same request ID; exactly one answer and award row exist and all receipts match. Repeat with different request IDs/choices; the original accepted answer remains authoritative.
4. Commit an answer, discard the response, clear all browser storage, then snapshot as the same principal on another client. Recover the real receipt with no additional award.
5. Fire two host `next` calls at the same expected version from separate clients. Exactly one question advance succeeds; the other is stale, and retrying its original request does not skip another question.
6. Send answers around reading/open/close/pause/resume boundaries using database time. Enforce the chosen versioned policy under transaction ordering; a changed local clock does not change eligibility.
7. Drop Realtime entirely, reconnect via snapshot, and recover the current version, deadline, committed receipt and score. A delayed older response cannot rewind the client.
8. Finish concurrently, then repeat `claim_game_xp` under the approved ownership contract. Exactly one completion award exists. Claims from a foreign principal fail.
9. Disconnect an answered participant. Existing `live_answer_count` can have answered greater than recently present. The final report instead has a fixed eligible population and partitions correct, incorrect, unanswered and excluded/late without overlap.
10. Read a complete report before and after reopening a browser. Terminal version and counts match; unrevealed keys never appear in an unowned/pre-answer snapshot; missing explanation/misconception review is explicitly absent.
11. Verify the 430 source extension declarations remain labeled and excluded from core mastery calculations, with XP policy preserved only as explicitly approved. Verify every target module has a matching selector or is blocked before seeding, including the 246 Maths Module 7–8 rows.

Only after these backend checks and independent review should real-browser/device tests, accessibility tests and a consented synthetic classroom test be planned. No live student data is needed for any of them.
