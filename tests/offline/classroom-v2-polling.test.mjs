import test from 'node:test';
import assert from 'node:assert/strict';
import { createSnapshotPoller } from '../../lib/classroom-v2/polling.ts';

const deferred = () => { let resolve, reject; const promise = new Promise((ok, fail) => { resolve = ok; reject = fail; }); return { promise, resolve, reject }; };
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const flush = () => new Promise(resolve => setImmediate(resolve));

test('polls successful snapshots and stops all updates on disposal', async () => {
  let calls = 0; const snapshots = [], statuses = [];
  const poller = createSnapshotPoller({ read: async () => ++calls, onSnapshot: value => snapshots.push(value), onStatus: value => statuses.push(value), intervalMs: 100 });
  poller.start(); await wait(130); poller.dispose(); const count = calls; await wait(120);
  assert.ok(count >= 2); assert.equal(calls, count); assert.deepEqual(snapshots, Array.from({length: count}, (_, i) => i + 1)); assert.ok(statuses.includes('live'));
});

test('retries ordinary read failures without inventing a snapshot', async () => {
  let calls = 0; const values = [], statuses = [];
  const poller = createSnapshotPoller({ read: async () => { if (++calls === 1) throw Error('offline'); return 'restored'; }, onSnapshot: x => values.push(x), onStatus: x => statuses.push(x), intervalMs: 100 });
  poller.start(); await wait(240); poller.dispose();
  assert.ok(statuses.includes('retrying')); assert.ok(statuses.includes('live')); assert.deepEqual(values, ['restored']);
});

test('an obsolete null snapshot never reports a live connection', async () => {
  let calls = 0; const values = [], statuses = [];
  const poller = createSnapshotPoller({ read: async () => ++calls === 1 ? null : 'restored', onSnapshot: x => values.push(x), onStatus: x => statuses.push(x), intervalMs: 100 });
  poller.start(); await flush();
  assert.deepEqual(values, []); assert.equal(statuses.at(-1), 'retrying'); assert.equal(statuses.includes('live'), false);
  await wait(130); poller.dispose();
  assert.deepEqual(values, ['restored']); assert.ok(statuses.includes('live'));
});

test('refresh invalidates stale replies; timeout stops automatic requests and caps unresolved reads', async () => {
  const pending = [], values = [], statuses = [];
  const poller = createSnapshotPoller({ read: () => { const d = deferred(); pending.push(d); return d.promise; }, onSnapshot: x => values.push(x), onStatus: x => statuses.push(x), intervalMs: 100, timeoutMs: 100 });
  poller.start(); await flush(); poller.refresh(); await flush(); poller.refresh(); await flush();
  assert.equal(pending.length, 2); assert.equal(statuses.at(-1), 'stalled');
  pending[0].resolve('old'); await flush(); assert.deepEqual(values, []);
  poller.refresh(); await flush(); assert.equal(pending.length, 3);
  await wait(120); assert.equal(statuses.at(-1), 'stalled'); await wait(130); assert.equal(pending.length, 3);
  pending[2].resolve('late'); await flush(); assert.deepEqual(values, []);
  poller.dispose(); pending[1].resolve('also late'); await flush(); assert.deepEqual(values, []);
});

test('disposed or superseded callbacks cannot schedule more work', async () => {
  const pending = deferred(), values = [];
  const poller = createSnapshotPoller({ read: () => pending.promise, onSnapshot: value => values.push(value), onStatus: () => {}, intervalMs: 100 });
  poller.start(); await flush(); poller.dispose(); pending.resolve('late'); await flush(); await wait(120); assert.deepEqual(values, []);
});

test('disposal before the deferred read starts prevents the request', async () => {
  let reads = 0;
  const poller = createSnapshotPoller({ read: async () => ++reads, onSnapshot: () => {}, onStatus: () => {} });
  poller.start(); poller.dispose(); await flush();
  assert.equal(reads, 0);
});
