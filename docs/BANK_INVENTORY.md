# P0-2 / P0-3 — Question bank inventory & normalisation

Source: `Teaching-APP` clone at `/workspaces/Teaching-APP`.
Normaliser: [`scripts/normalise-banks.mjs`](../scripts/normalise-banks.mjs) → `out/questions.json`.
Run: `node scripts/normalise-banks.mjs [repo] [out]`.

## Headline

**9,395 normalised HSC questions** — 8,299 original / 1,096 variant — across all 6 subjects, both years, **0 malformed, 0 duplicate ids**. Pulled from **two sources**:
- **6,639** from `question-bank-data.js` (the curated quiz banks)
- **2,756** from `*.review.json` (per-lesson review questions — a second corpus that nearly doubled coverage)

## Two question sources (both ingested)

The repo has **two parallel question corpora**, which is why the first count was low:
1. **`question-bank-data.js`** — one aggregator file per module. 50 HSC files.
2. **`*.review.json`** — one file per lesson (656 HSC files), each `{lessonId, title, questions:[…]}`. Different ids (`-mc-001` vs `-qb-01`), so additive, not duplicate. **This is the only source for maths-advanced Y12** (its `.js` aggregators are empty stubs — the content was always there, just in the review files).

## Four source schemas (all handled)

| | Container / file | Stem | Options | Correct |
|---|---|---|---|---|
| **A** | `window.HSCQuestionBankData["id"]={questions:[…]}` | `prompt` | array | `correctIndex` |
| **A′** | `const lessonQuestionBanks={"id":[…]}` | `text` | object `{A,B,C,D}` | `correctAnswer:'C'` |
| **A″** | `const lessonQuestionBanks={"id":[…]}` | `question` | array | `answer:1` |
| **D** | `*.review.json` | `stem` | array | `correct:1` |

`.js` files are executed in a sandboxed fake-`window` (node:vm); review.json is `JSON.parse`d. `coerce()` maps any schema → `{stem, options[], correctIndex}`. Short-answer (`type:'sa'`) review questions are filtered out (MC only). Every record carries a `source` field (`question-bank` | `review`).

## Final counts (question-bank + review = total)

| subject | Y11 | Y12 |
|---|---|---|
| biology | 542+321 = 863 | 606+284 = 890 |
| chemistry | 884+7 = 891 | 476+293 = 769 |
| physics | 660+264 = 924 | 400+275 = 675 |
| maths-standard | 604+298 = 902 | 275+245 = 520 |
| maths-advanced | 820+349 = 1169 | **0+420 = 420** |
| maths-ext1 | 480+0 = 480 | 892+0 = 892 |
| **TOTAL** | | **9,395** |

## Data repairs applied (in the normaliser, documented & reversible)

1. **2 syntax-broken `.js` files** (`maths-advanced/year11/module4`, `…/extension1/year11/module1`) — unescaped LaTeX primes (`\\'`, `f'(`) and a missing comma. Recovered ~220 q.
2. **79 questions with empty source ids** — given stable synthesised ids, recovered.
3. **LaTeX escape recovery (319 questions):** review.json and Schema A″ files were authored with lossy single-backslash LaTeX (`\frac`), which parsing turned into control characters (formfeed/tab). The normaliser re-inserts the backslash → `\frac` restored. **0 control chars remain.**

## Residual data-quality items (non-blocking; for QA / later)

| Item | Scope | Note |
|---|---|---|
| Fully-stripped LaTeX commands | a few hundred maths questions | Some commands lost their backslash entirely at authoring (`\cup`→`cup`); not mechanically recoverable. Mitigate by preferring `source:'question-bank'` for maths in the selector, or a targeted QA pass. |
| 378 duplicate ids across review files | deduped (first kept) | Worth checking upstream for accidental id reuse. |
| Content-level overlap qb↔review | unknown | Different ids; possible same-question overlap. Acceptable for MVP; refine later. |
| Inconsistent topic naming | all subjects | `topic` is kebab-normalised; build a taxonomy map for boss theming. |
| Junior (Y7–10) banks | out of scope | Schemas `mc`/`sa` + Y10 array; normalise in Phase 2. |

## Feeds Phase 0 next steps

- **P0-4** seeds Supabase `questions` from `out/questions.json` (canonical subjects: `biology, chemistry, physics, maths-standard, maths-advanced, maths-ext1`); keep the `source`, `quality`, `difficulty` columns for selection tiers.
- **P0-5** selector: prefer `quality:'original'`, and for maths prefer `source:'question-bank'` until the LaTeX QA pass is done.
