import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSourceModule, pageHarness, elements, textContent, memoryStorage } from '../support/source-harness.mjs';
import { liveClientDouble } from '../support/live-client-double.mjs';

const live = loadSourceModule('lib/live.ts', {}, { URL, URLSearchParams });
const button = (tree, label) => elements(tree).find(node => node.type === 'button' && textContent(node) === label);
const scheduler = navigator => ({
  location: { origin: 'https://legends.test', search: '?code=lab001' }, navigator,
  setInterval: () => 1, clearInterval() {}, setTimeout: () => 1, clearTimeout() {},
});

test('invite links use a validated, unambiguous code and the current origin', () => {
  assert.equal(live.gameCodeFromSearch('?code=lab001'), 'LAB001');
  assert.equal(live.gameCodeFromSearch('?code=ABC123&code=OTHER1'), null);
  assert.equal(live.gameCodeFromSearch('?code=%3Cscript%3E'), null);
  assert.equal(live.gameCodeFromSearch('?code=ABC'), null);
  assert.equal(live.makeGameInvite('https://legends.test', ' lab001 '), 'https://legends.test/join?code=LAB001');
  assert.equal(live.makeGameInvite('javascript:alert(1)', 'LAB001'), null);
  assert.equal(live.makeGameInvite('https://legends.test', 'bad!'), null);
});

test('actual join form prefills a shared code, trims the name, and submits only once while joining', async () => {
  const sb = liveClientDouble(); const rpc = sb.rpc; let resolveJoin, joinCalls = 0, params;
  sb.rpc = (name, args) => {
    if (name !== 'join_game') return rpc(name, args);
    joinCalls++; params = args;
    return new Promise(resolve => { resolveJoin = resolve; });
  };
  const page = pageHarness('app/join/page.tsx', sb, memoryStorage(), { user: null, loading: false }, { scheduler: scheduler({}) });
  try {
    let tree = await page.render();
    const code = elements(tree).find(node => node.type === 'input' && node.props['aria-label'] === 'Game code');
    assert.equal(code.props.value, 'LAB001');
    elements(tree).find(node => node.type === 'input' && node.props['aria-label'] === 'Your name').props.onChange({ target: { value: '  Test Finch  ' } });
    tree = await page.render();
    const form = elements(tree).find(node => node.type === 'form');
    const first = form.props.onSubmit({ preventDefault() {} });
    await form.props.onSubmit({ preventDefault() {} });
    assert.equal(joinCalls, 1);
    assert.equal(params.p_code, 'LAB001'); assert.equal(params.p_alias, 'Test Finch');
    resolveJoin({ data: [{ session_id: 'synthetic-room-1', player_id: 'synthetic-player-1', status: 'lobby' }], error: null });
    await first;
    assert.match(textContent(await page.render()), /Waiting for the host/i);
  } finally { page.unmount(); }
});

test('actual host copies a working invite and reports clipboard rejection accurately', async () => {
  for (const allowed of [true, false]) {
    let copied = '';
    const nav = { clipboard: { async writeText(value) { if (!allowed) throw new Error('denied'); copied = value; } } };
    const page = pageHarness('app/host/page.tsx', liveClientDouble(), memoryStorage(), undefined, { scheduler: scheduler(nav) });
    try {
      const setup = await page.render(); await button(setup, 'Y11').props.onClick();
      let lobby = await page.render();
      await button(lobby, 'Copy join link').props.onClick();
      lobby = await page.render();
      if (allowed) { assert.equal(copied, 'https://legends.test/join?code=LAB001'); assert.match(textContent(lobby), /Join link copied/); }
      else assert.match(textContent(lobby), /Could not copy the link/);
    } finally { page.unmount(); }
  }
});
