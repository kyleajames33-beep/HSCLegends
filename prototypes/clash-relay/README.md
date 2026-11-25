# Reactor Clash WebSocket relay

This prototype runs alongside the app. The projector still runs the simulation and Supabase still verifies seats and records answers. The relay checks each new connection using the caller's staging session and existing seat RPC. It forwards student controls to the projector and projector updates to the students in that room.

## Local setup

Use Node.js 24 and the dedicated classroom staging settings documented in [the classroom staging lab](../../docs/CLASSROOM_STAGING_LAB.md). Set `CLASSROOM_STAGING_RELAY_URL=ws://127.0.0.1:3042/clash` for Next.js and start the app at `http://127.0.0.1:3000`. The existing Realtime transport is selected when the relay URL is absent.

Run the relay from the repository root in a second terminal.

```sh
npm --prefix prototypes/clash-relay ci
CLASSROOM_STAGING_RELAY_ORIGIN=http://127.0.0.1:3000 \
  node --env-file-if-exists=.env.local prototypes/clash-relay/run.mjs
```

The relay listens on IPv4 loopback and accepts browser upgrades at `/clash` from the configured app origin. `CLASSROOM_STAGING_RELAY_PORT` overrides the default port 3042. Keep the backend URL and publishable key on the same dedicated staging project as the app.

## Verification

```sh
npm --prefix prototypes/clash-relay test
```

The test suite opens actual loopback WebSockets. It checks seat ownership and expiry against an HTTP fixture, room separation, seat replacement and message routing. The class-size case uses 30 students at 12 controls per second and a projector sending 10 snapshots per second. It checks every delivery to the intended recipient.

The [Clash browser smoke](../../tests/browser/README.md#reactor-clash-multiplayer-smoke) also runs the Next.js host and two students through the actual relay, with simulated Supabase responses and an interrupted socket. It then adds 28 WebSocket clients to that match and verifies the running projector receives controls from all students while continuing to send snapshots.

## Hosted staging

A hosted test needs a trusted `wss://…/clash` endpoint forwarding to a single relay process and the exact app origin configured at that process. Use the dedicated staging project and an approved test teacher. Relay rooms are in memory, and students reconnect and reverify their seats if the relay restarts. Projector reload recovery continues to depend on the game simulation in the projector browser.
