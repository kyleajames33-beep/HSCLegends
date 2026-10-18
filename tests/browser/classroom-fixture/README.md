# Synthetic browser hydration diagnostic

This diagnostic imports the actual secure join page, recovery controller, countdown hook,
AnswerTile and MathText. It renders real React 19.2.4 server markup with `renderToString`
and runs real `hydrateRoot`, effects, external-store subscriptions and browser events.
No React hooks are mocked. It does **not** activate the classroom feature gate or transport.

Only these application dependencies are replaced at bundle resolution:
- `use-user`: an in-memory `useSyncExternalStore` synthetic identity provider.
- `classroomTransport`: an in-memory synthetic service, retaining the actual controller.

The synthetic service starts with a predetermined committed receipt for the committed
and historical scenarios. Nothing is restored from localStorage, browser receipts, a
real account or a live backend. The source page still performs its response-binding checks.
The fixtures demonstrate UI identity isolation, not hosted authentication correctness.

All content and account IDs are synthetic. There are no secrets. Page CSP prohibits
connections; instrumentation also blocks fetch, XHR, WebSocket, EventSource and beacon.
The only server needed is a local static-file server. Tailwind and KaTeX CSS/fonts are
omitted in favor of small diagnostic CSS; this is not a production styling or math-font
verification. The actual MathText implementation is bundled, with plain-text questions.

## Reproduce

Prerequisite: the app's dependencies are installed. Use an already installed esbuild
module, or install the official registry package into a separate tools directory:

```sh
npm install --prefix /tmp/classroom-browser-tools --no-audit --no-fund esbuild@0.25.0
CLASSROOM_ESBUILD_PATH=/tmp/classroom-browser-tools/node_modules/esbuild \
  node tests/browser/classroom-fixture/build.mjs ../classroom-browser-output
python3 -m http.server 8781 --bind 127.0.0.1 --directory ../classroom-browser-output
```

If esbuild is already resolvable in the repository, omit `CLASSROOM_ESBUILD_PATH`.
The builder never installs anything or changes app dependencies. Output must be outside
the source tree. Nothing is written to `app`, `public` or a live route. Open
`http://127.0.0.1:8781/fresh.html` in the browser on the same machine as that server.

Observed toolchain: Node 24.19.0, esbuild 0.25.0, React/ReactDOM 19.2.4. Esbuild
parses the unchanged TypeScript application source. Browser verification used the existing native cloud
Chromium via its desktop localhost. No Chromium launch or security flags were changed.

## Click checks

1. Fresh page: verify diagnostics show hydrated=true, nodeRetained=true,
   mainRetained=true, and empty recoverable/errors/warnings/unhandled arrays.
2. Enter code `SYN123`, name `Synthetic guest`, click Join, Larger text, then answer 3.
   The fixture commits the answer and throws to simulate a lost acknowledgement.
   Expect Not quite, accepted choice 3, verified answer 4, zero points, submits=1.
3. Click Try again, unscored, then 4. Expect no score changed, submits still 1, and
   large-text styling on the practice option. Complete synthetic game in Fixture
   controls: expect own rank #2, 450 pts and explicitly unavailable XP saving.
4. Uncached committed link: Reconnect my game must show Correct and 450 recorded points,
   with submits=0. Reload, reconnect and refresh again: same result, no extra submit.
5. With the committed result visible, switch to the synthetic anonymous account.
   The page must reset before another restore. Restore; sign in synthetic account;
   again reset then restore. Switching to the second signed-in account resets again.
6. After restoring, Queue one stale read, Refresh game state, Sign out synthetic
   account, Release stale response. The old response must not restore old UI state.
7. Historical missing content link, Reconnect: Answer recorded with 450 points, no
   verified answer key or learning retry.
8. Fresh link, Reconnect, Queue one stale read, Refresh game state, Advance and notify,
   Release stale response: stay on question 2, not question 1.
9. With a committed result visible, Leave current game on this device must show an
   explicit confirmation without removing the result. Keep current game cancels with
   leaves=0. Confirm leave resets to Join, increments leaves/revocations once, and permits
   joining again. Submitted score/answer evidence is never deleted by the fixture.
10. Select Lose next leave acknowledgement, then confirm leave. Expect a locked safe
   failure rather than active question controls. Explicitly confirm leave again: leave
   succeeds with one revocation across both calls. This is an in-memory outcome model,
   not an actual browser HTTP cookie test.
11. Select Reject server leave and confirm leave. Expect safe failure with no revocation.
   Separately select Forget recovery on this browser: the confirmation must say server
   session will not be revoked. Cancel preserves state; Confirm forget returns to Join
   without a server revocation. This also works from the pre-binding form.
12. Corrupt next ownership binding, Refresh: show safe verification failure, no answer
   tiles. This response error is contained and does not create an unhandled exception.

## Deliberate hydration detector control

Rebuild with `CLASSROOM_HYDRATION_NEGATIVE_CONTROL=1` to additionally generate
`hydration-negative.html`. This opt-in, test-only artifact changes one server-rendered
heading without changing the browser component. It must report one recoverable hydration
mismatch and nodeRetained/mainRetained=false. This confirms the detector can fail.
It is never a production path. Normal pages must remain clean after returning to them.

## Evidence scope and limitations

The 2026-10-18 browser run completed all checks above with clean page diagnostics on normal
pages. Browser console capture also contained unrelated `chrome-extension://...` metadata
errors. Report those separately; do not describe the whole browser console as error-free.

This does not test Next routing/streaming, production CSS, hosted auth, real cookie
issuance/refresh, browser HTTP transport, CSP deployment, real-time subscriptions,
shared distributed rate limiting or XP claims. The HTTP boundary, auth verifier and
SQL adapters have independent offline/Request-Response/PGlite tests. This fixture does
not join those tests into an end-to-end deployed-system claim.
