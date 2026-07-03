# Content QA Report — HSC Legends question bank

_Run 2026-07-03 against the shared production bank (`public.questions`, 9,395 rows). This bank is shared with hscscience.com.au, so only conservative, reversible fixes were applied._

## Headline: the bank is structurally sound
| Check | Result |
|---|---|
| `correct_index` out of range | **0** ✅ |
| Options missing / < 2 choices | **0** ✅ |
| Empty / tiny stems | **0** ✅ |
| Missing `module` | **0** ✅ |
| Missing `topic` | **0** ✅ |

Nothing is broken enough to serve a wrong answer. Good foundation.

## Fixes applied (migration `20260703_content_qa.sql`)
1. **130 questions — stripped leftover option labels.** Options like `"A) foo"` / `"b. bar"` had an MCQ label baked into the text, which double-renders since the app already prepends A/B/C/D. Stripped the `^[A-Ea-e][).:] ` prefix; array order preserved so `correct_index` stays valid. (0 remain.)
2. **53 questions — excluded byte-identical duplicates.** 35 groups had exact-identical rows (same stem + options + answer). Kept the earliest `id`, set `excluded = true` on the rest → **zero information loss** (an identical copy remains live). Excluded count: 779 → **832**.
3. **Added a `verified` trust flag.** `verified = (not excluded AND has a real explanation)`. **7,766 / 9,395 (82.6%)** are verified, well spread: Bio 1455 · Chem 1528 · Physics 1392 · Maths Adv 1479 · Maths Std 1112 · Ext1 800. Indexed `(subject, verified)`.

## Findings NOT auto-fixed (need a decision / can't do here)
- **899 questions have no explanation** (~9.6%). Not broken, but they can't power the "explanation reveal" learning moment, and they're excluded from `verified`. **Fix path:** generate concise explanations via the Claude API — blocked on `ANTHROPIC_API_KEY` (see NEEDS-HUMAN-TESTING.md). Cheap on Haiku; can batch.
- **~757 same-stem "variant" questions** (same stem, *different* options or answer). These are legitimate variants from the bank generator (`quality = 'variant'`), **left untouched** — deliberately not deduped.

## How to use `verified`
Nothing reads it yet (kept isolated from the parallel session's work). Suggested next step: have the learning/quiz selectors *prefer* `verified` questions (or add a small "✓ syllabus-checked" badge on verified questions) — a one-line `order by verified desc` in the selector RPCs, or a `p_verified_only` flag. Deferred to avoid colliding with concurrent edits to the shared question selectors.
