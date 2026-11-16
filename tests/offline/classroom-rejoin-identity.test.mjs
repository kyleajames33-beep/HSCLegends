import test from 'node:test';
import assert from 'node:assert/strict';
import { pageHarness, elements, textContent, memoryStorage } from '../support/source-harness.mjs';
import { liveClientDouble } from '../support/live-client-double.mjs';

for (const replacement of [
  { session_id: 'synthetic-room-1', player_id: 'other-player' },
  { session_id: 'other-room', player_id: 'synthetic-player-1' },
]) {
  test(`rejoin rejects a mismatched saved player or room: ${JSON.stringify(replacement)}`, async () => {
    const storage = memoryStorage();
    const saved = JSON.stringify({ code: 'LAB001', room: 'synthetic-room-1', player: 'synthetic-player-1', alias: 'Test Finch', ts: Date.now() });
    storage.setItem('legends_arena_live', saved);
    const sb = liveClientDouble({ status: 'active' });
    const rpc = sb.rpc.bind(sb);
    sb.rpc = async (name, args) => {
      const response = await rpc(name, args);
      if (name === 'live_rejoin') return { ...response, data: [{ ...response.data[0], ...replacement }] };
      return response;
    };
    const page = pageHarness('app/join/page.tsx', sb, storage);
    try {
      const initial = await page.render();
      const button = elements(initial).find((element) => element.type === 'button' && /Rejoin game/.test(textContent(element)));
      assert.ok(button);
      await button.props.onClick();
      const after = await page.render();
      assert.match(textContent(after), /saved player could not be matched/i);
      assert.match(textContent(after), /Rejoin game/);
      assert.equal(storage.getItem('legends_arena_live'), saved, 'mismatch must not erase recovery data');
      assert.equal(sb.calls.filter((call) => call.name === 'get_live_question').length, 0, 'must not connect to a mismatched identity');
      assert.equal(sb.calls.filter((call) => call.name === 'arena_heartbeat').length, 0, 'must not heartbeat as another player');
    } finally { page.unmount(); }
  });
}
