# Preparing a teacher question draft

The local `/question-import` page validates a CSV or JSON file entirely in the browser and can download an **unreviewed** JSON draft or preview it in Knockout Solo. It does not upload a file, write to a database, change the question bank or start a live classroom game. It remains available when account services are not configured.

For a structurally valid draft, expand each question to review the marked answer, explanation, course mapping and source. Optional checkboxes help track this review while the file is open. These marks are session-only: loading another file or leaving the page clears them, and they do not certify content or change the exported draft's unreviewed status.

Use up to 20 questions per file, under 1 MB. Each needs 2–6 distinct text answers, a correct answer, an explanation and explicit subject, year, module, syllabus version and source. Imported questions require educator and syllabus review before release. The checker verifies structure, not scientific accuracy or rights to reuse content. Images and questions that rely on missing diagrams cannot be included yet.

## CSV

Download the template from the page. Its example contains a `TODO` explanation so that it cannot accidentally pass as a reviewed question. Replace it and save the file as UTF-8 CSV. The required headers are:

```text
stem,option_a,option_b,answer,explanation,subject,year,module,syllabus_version,source
```

Optional headers are `id`, `option_c`, `option_d`, `option_e` and `option_f`. Answer letters are `A` to `F` and must refer to a non-empty option. Optional choices must be contiguous; an empty B followed by C is not valid. Quote fields containing commas or newlines; use two double quotes for a quote inside a quoted field. Blank, duplicate or unknown headers are rejected rather than guessed.

## JSON

Upload either an array in the following form or a previously exported draft. `correctIndex` is **zero-based** (`0` is the first option). Unknown fields, including media, are rejected so they cannot disappear silently.

```json
[
  {
    "id": "teacher-1",
    "stem": "Which option is correct?",
    "options": ["First option", "Second option"],
    "correctIndex": 1,
    "explanation": "Replace this with an explanation of the correct answer.",
    "subject": "chemistry",
    "year": 12,
    "module": "module-5",
    "syllabusVersion": "2017",
    "source": "Teacher-created"
  }
]
```

Subject IDs are `biology`, `chemistry`, `physics`, `maths-standard`, `maths-advanced` and `maths-ext1`; year is 11 or 12. A missing ID becomes a local `draft-N` identifier. These identifiers are not a published or versioned content identity. A downloaded draft is always marked `unreviewed`, even if an input file claims otherwise.

## Solo preview

After all structural checks pass, **Preview in solo arena** starts the existing simulated-rival game with the draft in the same browser tab. A run draws up to eight distinct questions, and can end earlier if the player is knocked out or all simulated rivals are eliminated. Answer explanations and missed-question review use the supplied draft. Refresh recovery keeps the active deadline and revalidates the question set. A draft too large for this preview can still be downloaded.

The preview uses tab-scoped browser storage for the draft, including answer keys. It is local practice with simulated rivals, not a way to share a private classroom set or conceal keys from a student using that device. Browser storage can be unavailable or cleared; download your draft to keep a copy. No account rewards are awarded.

## Next steps before classroom use

Review keys, explanations, provenance and syllabus mapping with an educator. A future reviewed import must preserve that information, create stable question versions and use an isolated staging environment before any shared-database rollout. An isolated classroom v2 candidate preserves teacher draft metadata in private synthetic question rows and permits the owning host to read it back. It has no reviewed content workflow and is not connected to this page or deployed. Its version marker is a compatibility check, not proof of a trustworthy server. Live classroom hosting and answer-receipt recovery remain blocked by the issues in [implementation status](IMPLEMENTATION_STATUS.md).

For maintainers, `node scripts/seed-rest.mjs --input path/to/normalized.json` is a dry run. It checks the existing normalizer/preflight format, not this teacher draft format. Applying that separate seed path requires `--apply`, an explicit `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`; the known shared production project additionally requires `--allow-shared-production`. No seed command is run by the teacher page. Preflight does not substitute for content review.
