# HSC Legends

An HSC game platform in active development. The local preview includes two account-free Chemistry samples:

- `/demo` — Lab Rush, a timed lab-building boss game.
- `/arena` — Knockout Solo, timed rounds against simulated rivals. A run can be resumed in the same browser tab after a refresh; an active round's clock continues while away.

The sample questions cover selected Year 12 Chemistry equilibrium fundamentals and have not yet had educator review. They are not a complete HSC course.

Teachers can use `/question-import` to check a CSV or JSON file, download an unreviewed draft and preview it in the solo arena. It does not upload questions or create a live game; its format and limits are described in [teacher question drafts](docs/TEACHER_QUESTION_DRAFTS.md).

A separate, disabled-by-default `/classroom-staging` test interface exercises the in-development host and student flow. It requires its own disposable Supabase project and explicitly configured test credentials; see [the staging lab guide](docs/CLASSROOM_STAGING_LAB.md). It is not the live classroom.

## Run locally

Use Node.js 24 and the committed lockfile:

```sh
npm ci
npm run dev
```

Open `http://localhost:3000`. The two samples and game hub work without backend settings. Connected account, classroom and progression routes require a configured Supabase project; when settings are absent they show an unavailable page. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in an untracked `.env.local` for an appropriately isolated project. Do not put service-role or secret keys in public environment variables.

## Checks

```sh
npm test
npm run lint
npm run build
npm run test:regressions
```

The standalone browser checks and their local setup are in [tests/browser/README.md](tests/browser/README.md). The known classroom regression for recovering an uncached answer receipt currently fails because the legacy server does not return the required receipt. See [implementation status](docs/IMPLEMENTATION_STATUS.md) for the security findings, verification boundaries and remaining work before connected classroom release. A successful build or local simulated game is not evidence that live multiplayer is ready.
