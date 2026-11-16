import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadSourceModule } from '../support/source-harness.mjs';

for (const [path, fn, rpcName] of [
  ['lib/knockout.ts', 'koRejoin', 'ko_rejoin'],
  ['lib/gamble.ts', 'gambleRejoin', 'gamble_rejoin'],
]) {
  const rejoin = loadSourceModule(path)[fn];
  test(`${rpcName} accepts only the saved room and player`, async () => {
    let response = { data: [{ room_id: 'room-1', player_id: 'player-1' }], error: null };
    const client = { rpc: async (name, args) => {
      assert.equal(name, rpcName);
      assert.equal(args.p_code, 'ABCD');
      assert.equal(args.p_alias, 'Alex');
      return response;
    } };
    const expected = { room: 'room-1', player: 'player-1' };
    assert.equal((await rejoin(client, 'abcd', 'Alex', expected)).player_id, 'player-1');
    for (const row of [{ room_id: 'room-1', player_id: 'other' }, { room_id: 'other', player_id: 'player-1' }]) {
      response = { data: [row], error: null };
      await assert.rejects(rejoin(client, 'abcd', 'Alex', expected), /saved player could not be matched/i);
    }
    response = { data: [], error: null };
    assert.equal(await rejoin(client, 'abcd', 'Alex', expected), null);
    response = { data: null, error: new Error('temporary failure') };
    await assert.rejects(rejoin(client, 'abcd', 'Alex', expected), /temporary failure/);
  });
}
