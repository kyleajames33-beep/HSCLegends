# Historical Content QA Report: HSC Legends question bank

> Scope correction (2026-10-04): the figures below are historical reports, not current database counts. This offline source audit made no database reads. The `verified` flag checks exclusion and explanation length, not scientific correctness, syllabus alignment or human review. See [the question-integrity audit](./QUESTION-INTEGRITY-AUDIT.md).

_Run 2026-07-03 against the shared production bank (`public.questions`, 9,395 rows). This bank is shared with hscscience.com.au, so only conservative, reversible fixes were applied._

## Historical structural results
| Check | Result |
|---|---|
| `correct_index` out of range | **0** ✅ |
| Options missing / < 2 choices | **0** ✅ |
| Empty / tiny stems | **0** ✅ |
| Missing `module` | **0** ✅ |
| Missing `topic` | **0** ✅ |

These reported structural checks cannot establish whether an answer is scientifically correct, whether an explanation is meaningful, or whether the question matches the syllabus.

## Fixes applied (migration `20260703_content_qa.sql`)
1. **130 questions — stripped leftover option labels.** Options like `"A) foo"` / `"b. bar"` had an MCQ label baked into the text, which double-renders since the app already prepends A/B/C/D. Stripped the `^[A-Ea-e][).:] ` prefix; array order preserved so `correct_index` stays valid. (0 remain.)
2. **53 questions — excluded byte-identical duplicates.** 35 groups had exact-identical rows (same stem + options + answer). Kept the earliest `id`, set `excluded = true` on the rest → **zero information loss** (an identical copy remains live). Excluded count: 779 → **832**.
3. **Added a legacy `verified` flag.** The retained SQL sets it when `excluded IS NOT TRUE` and `length(trim(explanation)) >= 3`. **7,766 / 9,395 (82.6%)** were historically reported to pass this length heuristic: Bio 1455 · Chem 1528 · Physics 1392 · Maths Adv 1479 · Maths Std 1112 · Ext1 800. Indexed `(subject, verified)`.

## Findings NOT auto-fixed (need a decision / can't do here)
- **899 questions were historically reported without an explanation** (~9.6%). Their current count is unknown. They cannot power the "explanation reveal" learning moment, and they're excluded from `verified`. **Fix path:** generate concise explanations via the Claude API — blocked on `ANTHROPIC_API_KEY` (see NEEDS-HUMAN-TESTING.md). Cheap on Haiku; can batch.
- **~757 same-stem "variant" questions** (same stem, *different* options or answer). These were labelled variants by the bank generator (`quality = 'variant'`), **left untouched** — deliberately not deduped.

## How to interpret `verified`
Do not display "scientifically verified", "syllabus-checked" or equivalent labels from this flag. A three-character placeholder can satisfy it. The later retained migration `20260703_prefer_verified.sql` states that four selectors prefer flagged rows, but omits their complete SQL bodies; it cannot establish current selector behavior. No database field, grant, selector or RPC was changed by the offline audit.
