# Specimen and lesson-video release check (14 October 2026)

PR #5 carries authoritative lesson routing. PR #6 builds on it and carries server-graded specimen rewards. Merge #5 first, then retarget #6 to main and merge. Neither PR was merged or deployed by this work.

## Database state and deployment

Read-only inspection of HSCScienceSyd on 14 October found all 17 specimen catalogue rows and the vulnerable `claim_specimen_card(text)` function, callable by authenticated users. The earlier statement that the migration was unapplied is stale. Production was not modified by this work.

- Existing installations: apply `20261014091846_authoritative_lesson_ids.sql` and `20261014092022_verified_specimen_answers.sql` before deploying these frontend changes. Do not rerun the original specimen seed merely to upgrade an installation that already has it.
- Fresh installations: the original specimen migration now fails closed at its claim endpoint. Apply it, then both new migrations before deploying the frontend.
- Do not blindly replay all historical repository migrations against the shared production project. Establish the actual migration history first; some historical files are placeholders for migrations applied outside this repository.
- The new migrations are prepared and locally verified only. No production SQL writes, migration applications, audio/video changes or releases were performed.

The correct-answer key and evidence live in `legends_private`, with RLS and no anonymous/authenticated table or schema access. `submit_specimen_answer(question_id, answer_index)` grades the submitted option against the stored key, records evidence for `auth.uid()`, and awards the mapped card in one transaction. The legacy claim endpoint requires that same user-owned server evidence. Client-supplied correctness and the existing general-purpose `record_attempt` RPC are never accepted as evidence.

Repeated submissions cannot create duplicate cards or refunds. Pack probabilities, campaign probabilities, coins and original campaign rewards are preserved. Existing cards are not deleted, and historical grants without answer evidence cannot be retrospectively certified. This verifies submitted answers; the study bank still reveals answer keys and supports retrying, so it is not an anti-bot or exam-integrity system.

Review, Exam and Topic RPCs return the stored `questions.lesson_id`; missing identity suppresses the video link. The selector migration retains live filtering, verified-first ordering, defaults and role grants (Review is authenticated only).

## Validation

- `npm run test:db`: 4/4 pass in PGlite PostgreSQL, executing the actual migrations and functions.
- `npm test`: 144/144 offline tests pass.
- `npx tsc --noEmit`: pass.
- ESLint on changed TypeScript, JavaScript and test files: pass.
- `npm run build` with placeholder public Supabase URL/key: pass; no production credentials or live backend validation used.
- `npm run test:regressions`: 2/3 pass; the existing student-rejoin answer-receipt regression also fails identically on unchanged main `0fa54e7`. No classroom runtime files changed.

Database tests cover all 17 direct claims, wrong submissions, missing/invalid answers, unknown question IDs, private-evidence forgery, direct collection writes, anonymous callers, missing auth, another user's evidence, correct submissions and repeated claims. Both fresh installation and upgrade from the live vulnerable signature are tested. Selector tests exercise both mismatch directions through Review, Exam and Topic RPCs. Pack/campaign bodies are compared with the originals, allowing only `source = 'pack'` filtering. Client tests verify the chosen index and question ID are submitted, and errors/missing acknowledgements never become awards.

PGlite is an isolated PostgreSQL engine, not the hosted PostgREST service. Production deployment still needs the usual RPC schema-cache and signed-in browser smoke check after the migrations are explicitly deployed.
