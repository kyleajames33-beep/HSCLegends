# Isolated classroom staging lab

`/classroom-staging` is a **test-only** host/student interface for the classroom v2 candidate. It is disabled by default and does not use the application's shared Supabase client or shared account session. It is not a production feature or a release-ready classroom.

The server must explicitly receive all four variables:

```text
CLASSROOM_STAGING_ENABLED=true
CLASSROOM_STAGING_PROJECT_REF=<dedicated project ref, or local>
CLASSROOM_STAGING_URL=https://<dedicated project ref>.supabase.co
CLASSROOM_STAGING_PUBLIC_KEY=<that project's publishable or legacy anon key>
```

Only for a local stack, the project ref `local` and URL `http://127.0.0.1:54321` or `http://[::1]:54321` are accepted. The gate rejects the known shared production project, the configured main application's Supabase hostname, arbitrary URLs, HTTP remote hosts, and keys recognisable as secret or service-role keys. The check is a safeguard, **not proof** that a different hosted project is disposable, that a key is authentic, or that its database is secure. Never put a service key in this variable; the supplied public key is sent to browsers. The server renders this route dynamically. The proxy exception for this exact GET/HEAD path is not authorization.

A dedicated environment must have the reviewed matching classroom-v2 candidate and capabilities, verified identity and grants, anonymous sign-in explicitly configured for that environment only, and a server-provisioned enabled host account. Anonymous users use authenticated database roles; role alone is not authorization. Provide abuse controls and retention before wider access. The local SQL candidate and simulated tests are not a production migration.

A staging host signs in with its own test account, creates a two-question synthetic room, and shares the long UUID join code or copies a join link. The link contains only the room code and prefills the join form; it does not authenticate its recipient. The updated candidate returns the room code to its verified owning host on recovery, so it can be shared again. Older candidates omit the code; in that case the saved code remains labelled unverified and cannot be copied as a link. Alternatively, a teacher can explicitly choose the unreviewed draft last previewed in the same tab; it is revalidated before being sent to the matching staging candidate, and an invalid or missing draft never falls back to the sample. An unconfirmed creation retains the original prepared request for an identical retry during the current page session. A student signs in explicitly as a guest and joins with that code and alias. The host starts, advances, or finishes; students submit choices and see their own server-returned receipt. For teacher-draft questions, the candidate supplies the frozen explanation only once that student has a committed receipt. Polling supplies room updates; timers estimate time from a server snapshot but the server decides acceptance. Session-scoped storage saves only room selectors so the same verified actor can request a fresh server snapshot to resume; it does not restore a lost authentication session or authorize a user. Uncertain requests require refresh before a teacher retries; unconfirmed success is never inferred locally.

Students can paste either a UUID code or a join link from the same site into the join field. Invalid, ambiguous and off-site links are rejected before contacting the classroom server.

The host can choose 15, 20, 30, 45, 60, 90 or 120 seconds per question before creating a room. The selected duration is locked into the creation request, including retries after an uncertain response. At least one student must join before the host can start. The teacher can advance early; this setting does not pause or extend the server's clock. Joined does not mean a student is currently connected.

The host can end a lobby before the first question; the student sees that the lobby ended and receives no placing for an unplayed game. Known server responses for an expired room, forbidden action, closed answer window or stale question are shown explicitly. An unknown or transport failure remains unconfirmed and should be checked by refreshing the room.

If the browser blocks session storage, the staging sign-in uses temporary in-memory storage and displays a warning. It will not survive a refresh, and a lost anonymous session cannot be recovered from a room code. The fallback is local to the page and does not alter the main application's session.

If authentication refreshes while the page is open, the room is cleared while the identity is checked. When the same actor is verified again, the page attempts to restore that actor's saved room through a fresh server snapshot. A changed or signed-out actor does not inherit the room. An uncertain host-creation request is retained for the same actor so a retry uses the same id and settings; it is discarded for a different actor. A page reload can still lose an unconfirmed creation request, and real Supabase authentication remains unverified in this lab.

Once the server marks a game complete, the updated candidate returns each student's placing based on the number of participants with a higher score; equal scores share a place. Older candidates omit this result. No persistent wallet reward is claimed by this flow.

After completion, a student can also review their own submitted answers, including the correct choice and any teacher-provided explanation. The updated snapshot includes only that participant's committed answers, never another player's answers or questions they did not answer. The review is limited to the room's lifetime and requires the same verified identity; older candidates omit it.

The owning host also receives an aggregate question summary after completion: correct answers and submitted answers for each played question, with unplayed questions identified separately. The host can download these aggregate counts as CSV; it contains question text but no student names or answer keys. Counts do not infer that absent submissions were incorrect, and do not constitute an individual student report. Older candidates omit this summary.

This is still missing classroom-grade deployment, short join codes, detailed individual classroom reports, a reviewed question-bank selection workflow, host enrollment UI, cross-device guest recovery, rate limiting, launch review and verified content. Browser- or network-level failures and a lost room-creation response can require manual reconciliation. No production database configuration is changed by the page.
