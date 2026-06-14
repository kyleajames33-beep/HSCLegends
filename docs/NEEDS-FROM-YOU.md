# Things I need from you (Kyle) — running list

Updated 2026-06-13. None of these block the build; they unblock specific features or are hygiene.

## To unlock features
1. **Boss art (5 subjects)** — generate OpenArt sets for Chemistry, Physics, Maths Standard, Maths Advanced, Maths Ext 1 (idle/attack/hurt/defeat each), drop into `public/bosses/<subject>/`. Biology's done. Guide: `docs/openart-boss-art-guide.md`. (Cosmetic placeholders work meanwhile.)
2. **AI "Quiz My Notes"** — add an `ANTHROPIC_API_KEY` to the app env/secrets. I'll build it with a hard **3-generations/day per-user cap**, cheapest model (Haiku), and a `max_tokens` ceiling so cost is bounded. Confirm you want that cap.
3. **Smart notifications — deploy + schedule the dispatcher** (built: `supabase/functions/notify-streaks/`). Steps:
   1. Set secrets: `supabase secrets set VAPID_PUBLIC_KEY=… VAPID_PRIVATE_KEY=… CRON_SECRET=<make-a-random-string>` (use the same VAPID pair as send-push).
   2. Deploy: `supabase functions deploy notify-streaks` (or I can deploy it via MCP once secrets exist).
   3. Schedule it daily ~6pm AEST: Dashboard → Edge Functions → notify-streaks → **Schedules** → cron `0 8 * * *` (UTC ≈ 6pm Sydney). It only fires for users with an *active streak who haven't played today* and sends **one** nudge/day max. Or point any external cron at the function URL with header `x-cron-secret: <CRON_SECRET>`.
   - It's safe to deploy now; it just won't send until scheduled and won't run without the right `x-cron-secret`.
4. **Web Push for prod** — confirm the VAPID keys are set as Supabase secrets (not inline) before relying on notifications; needs a real installed PWA on a phone to truly test.

## Testing (only you can, signed in on a real device)
5. **Play-test the new flows**: open a pack (`/collection`), daily spin + buy a power-up + claim a quest (`/rewards`), a review session (`/review`), a campaign boss (`/campaign`), climb a division (`/league`), profile (`/profile`). Report anything broken.
6. **Two-device live test** for Knockout/Heist/Live Game (need 2 players).
7. **Seed the leagues** — get a few friends (or test accounts) playing so divisions feel alive.

## Security / hygiene
8. **Rotate the Supabase `service_role` key** — it was pasted in an earlier chat. Rotate it in the dashboard and update any deployed function env.

## Decisions (later, no rush)
9. Monetisation stance — if ever, **cosmetics only, flat price, never randomised, never sell currency** (keeps us clear of loot-box / minor-gambling regulation). Confirm when relevant.
10. Whether to gate any content behind a free hscscience.com.au account (funnel mechanic).
