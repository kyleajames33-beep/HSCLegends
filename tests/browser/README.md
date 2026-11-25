# Optional Lab Rush browser smoke

These checks cover the self-contained sample, the logged-out campaign entry, hub keyboard navigation and iOS install dismissal at desktop, phone and narrow-phone widths. It does not require Supabase data and must not be interpreted as a production multiplayer test.

Use an already-running local app with the sample available. To avoid changing project dependencies, install Playwright in a temporary directory and provide its module path:

```sh
npm install --prefix /tmp/hsc-browser --no-save --no-audit --no-fund playwright
PLAYWRIGHT_BROWSERS_PATH=/tmp/hsc-browser-cache /tmp/hsc-browser/node_modules/.bin/playwright install chromium --only-shell
PLAYWRIGHT_BROWSERS_PATH=/tmp/hsc-browser-cache HSC_PLAYWRIGHT_MODULE=/tmp/hsc-browser/node_modules/playwright/index.mjs node tests/browser/lab-rush.smoke.mjs
PLAYWRIGHT_BROWSERS_PATH=/tmp/hsc-browser-cache HSC_PLAYWRIGHT_MODULE=/tmp/hsc-browser/node_modules/playwright/index.mjs node tests/browser/game-hub.smoke.mjs
PLAYWRIGHT_BROWSERS_PATH=/tmp/hsc-browser-cache HSC_PLAYWRIGHT_MODULE=/tmp/hsc-browser/node_modules/playwright/index.mjs node tests/browser/ios-install.smoke.mjs
PLAYWRIGHT_BROWSERS_PATH=/tmp/hsc-browser-cache HSC_PLAYWRIGHT_MODULE=/tmp/hsc-browser/node_modules/playwright/index.mjs node tests/browser/solo-arena.smoke.mjs
PLAYWRIGHT_BROWSERS_PATH=/tmp/hsc-browser-cache HSC_PLAYWRIGHT_MODULE=/tmp/hsc-browser/node_modules/playwright/index.mjs node tests/browser/solo-arena-recovery.smoke.mjs
PLAYWRIGHT_BROWSERS_PATH=/tmp/hsc-browser-cache HSC_PLAYWRIGHT_MODULE=/tmp/hsc-browser/node_modules/playwright/index.mjs node tests/browser/teacher-question-import.smoke.mjs
```

On a fresh Linux host Chromium also needs system libraries; use Playwright's documented system dependency setup. Set `HSC_BASE_URL` to a different local preview URL if needed. These checks run without backend settings by default. To additionally check the logged-out Campaign entry, run the Lab Rush smoke with `HSC_TEST_CONNECTED_ENTRY=1` against a preview with backend environment variables configured. These tests start a headless browser, but do not start the app server or create accounts. The committed `npm test` suite remains offline and does not invoke these checks.

For the unconfigured preview smoke, start the local app with `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` unset, then run:

```sh
PLAYWRIGHT_BROWSERS_PATH=/tmp/hsc-browser-cache HSC_PLAYWRIGHT_MODULE=/tmp/hsc-browser/node_modules/playwright/index.mjs node tests/browser/unconfigured-preview.smoke.mjs
```

That check confirms the sample remains playable while connected routes return unavailable; it does not verify a connected production game.

For installed offline play, build and start a **production** preview (development deliberately unregisters the worker):

```sh
npm run build
npm run start -- --hostname 127.0.0.1 --port 3001
```

Then, in another terminal:

```sh
PLAYWRIGHT_BROWSERS_PATH=/tmp/hsc-browser-cache HSC_PLAYWRIGHT_MODULE=/tmp/hsc-browser/node_modules/playwright/index.mjs node tests/browser/offline-play.smoke.mjs
```

This test installs the worker, disables network access, visits an account route and verifies that only the public offline landing appears. It then opens the cached standalone Lab Rush and answers a question. It does not claim offline account or classroom support. The `/arena` smoke exercises simulated solo rivals, not real multiplayer.

## Reactor Clash multiplayer smoke

Run the Next.js dev server against a loopback fixture configuration. The test intercepts Supabase requests and Realtime messages in Chromium, so no backend or credentials are required.

```sh
CLASSROOM_STAGING_ENABLED=true \
CLASSROOM_STAGING_PROJECT_REF=local \
CLASSROOM_STAGING_URL=http://127.0.0.1:54321 \
CLASSROOM_STAGING_PUBLIC_KEY=sb_publishable_ClashSmokeFixture \
npm run dev -- --hostname 127.0.0.1
```

Run the smoke in a second terminal using Playwright 1.48.2 or newer and its matching Chromium. For Playwright 1.48.2, install Chromium without `--only-shell`.

```sh
PLAYWRIGHT_BROWSERS_PATH=/tmp/hsc-browser-cache HSC_PLAYWRIGHT_MODULE=/tmp/hsc-browser/node_modules/playwright/index.mjs node tests/browser/clash-multiplayer.smoke.mjs
```

The smoke covers a projector and two students, theme and sound changes, a late lobby response after start, keyboard movement, and recovery after dropped snapshots. Hosted Realtime delivery and background-tab throttling are covered separately by `clash-staging.e2e.mjs`.
