# Pinned question-source fixtures

These fixtures test ingestion and course identity. They are not a reviewed HSC teaching set or a scientific-accuracy certification.

Source repository: `kyleajames33-beep/Teaching-APP`, commit `99d107b14e525ef538448bf9260af2b51e453865`.

- `ext1-module9.source.txt` is the **complete, byte-exact** [Extension 1 Module 9 bank](https://github.com/kyleajames33-beep/Teaching-APP/blob/99d107b14e525ef538448bf9260af2b51e453865/subjects/maths-advanced/extension1/year12/module9/question-bank-data.js). The test checks Git blob `55de724610072a84f0b5ba08aa7e97a875b5839c`, executes it only in the trusted offline fake-window loader, and requires 40 runtime questions plus 120 omitted legacy questions. The `.txt` extension keeps original upstream JavaScript outside application lint/build discovery.
- `pinned-rows.json` contains 18 unmodified raw question objects selected from 12 bank files, with original file, lesson, row index and full-source Git blob. Expected answer positions/text are an independent reading of the source-declared keys. They do not verify subject matter. Included curriculum-map entries preserve source unit paths, labels, names, outcomes and lesson hrefs; unrelated fields are omitted. Tests reconstruct small containers around the raw rows rather than claiming those snippets are complete banks.
- The documented source answer adapters are [question-bank.js lines 60–86](https://github.com/kyleajames33-beep/Teaching-APP/blob/99d107b14e525ef538448bf9260af2b51e453865/question-bank.js#L60-L86) and [lines 138–174](https://github.com/kyleajames33-beep/Teaching-APP/blob/99d107b14e525ef538448bf9260af2b51e453865/question-bank.js#L138-L174). Numeric keys, letter `answer` with labelled option maps, and letter `correct` with array options are distinct supported source formats.

Run from the repository root:

```sh
node --import ./tests/support/deny-network.mjs --test tests/offline/question-coverage.test.mjs
```

No source fixtures fetch assets, load credentials or connect to a database. `node:vm` is not a security sandbox; do not substitute untrusted uploads. The broader source ledger and audit are described in `docs/QUESTION-COVERAGE-AUDIT.md`.
