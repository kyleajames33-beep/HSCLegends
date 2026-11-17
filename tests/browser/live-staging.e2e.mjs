// Live game end-to-end against the REAL staging project (not mocked).
// A scripted host (an approved anonymous test account) drives the game through
// the API; a student plays in a laptop-sized browser.
//
// Requires: the dev server running with the CLASSROOM_STAGING_* settings, and a
// host session file (JSON {session:{access_token,refresh_token}}) for an account
// listed in classroom_v2_private.hosts.
//   HSC_PLAYWRIGHT_MODULE=<playwright/index.mjs> HSC_HOST_SESSION=<file> node tests/browser/live-staging.e2e.mjs
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const { chromium } = await import(process.env.HSC_PLAYWRIGHT_MODULE ?? 'playwright');
const BASE = process.env.HSC_BASE_URL ?? 'http://localhost:3000';
const URL = process.env.CLASSROOM_STAGING_URL ?? 'https://xkqeigruzvnudtnmggis.supabase.co';
const KEY = process.env.CLASSROOM_STAGING_PUBLIC_KEY ?? 'sb_publishable_L84-xhPuY-zeVLBfwyZBGA_jiVOz2UF';
const SHOTS = process.env.HSC_SCREENSHOT_DIR;
const sessionFile = process.env.HSC_HOST_SESSION;
if (!sessionFile) throw new Error('Set HSC_HOST_SESSION to a host session JSON file.');

const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) process.exitCode = 1; };
const host = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const saved = JSON.parse(fs.readFileSync(sessionFile, 'utf8')).session;
const { error: sessionError } = await host.auth.setSession({ access_token: saved.access_token, refresh_token: saved.refresh_token });
if (sessionError) throw new Error('Host session expired: ' + sessionError.message);
const call = async (n, a) => { const { data, error } = await host.rpc(n, a); if (error) throw new Error(`${n}: ${error.message}`); return data; };
const view = room => call('classroom_v2_game_host', { p_room: room });
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/e2e-${name}.png` }); };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
const errors = [];
const open = async () => { const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message)); return p; };

try {
  // Boss Battle, keyboard answering, rejoin, early close, report.
  const qs = [
    { stem: 'Which base pairs with adenine in DNA?', options: ['Cytosine', 'Guanine', 'Uracil', 'Thymine'], correct_index: 3, content_revision: 'e2e' },
    { stem: 'What is the SI unit of force?', options: ['Joule', 'Watt', 'Newton', 'Pascal'], correct_index: 2, content_revision: 'e2e' },
    { stem: 'Third question?', options: ['a', 'b'], correct_index: 0, content_revision: 'e2e' },
  ];
  const [room] = await call('classroom_v2_create', { p_request_id: crypto.randomUUID(), p_questions: qs, p_seconds: 30 });
  ok(await call('classroom_v2_game_configure', { p_room: room.room_id, p_mode: 'boss', p_boss: 'biology' }), 'boss mode configured');
  let hv = await view(room.room_id);

  let page = await open();
  await page.goto(`${BASE}/live?code=${hv.short_code}`);
  await page.getByPlaceholder('Nickname').fill('E2E Student');
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await page.getByText("You're in!").waitFor({ timeout: 15000 });
  ok(true, 'student joined by code');

  await page.close(); // accidental tab close
  page = await open();
  await page.goto(`${BASE}/live`);
  await page.getByRole('button', { name: 'Rejoin as E2E Student' }).click();
  await page.getByText("You're in!").waitFor({ timeout: 15000 });
  hv = await view(room.room_id);
  ok(hv.players.length === 1, 'rejoin kept the same player');

  await call('classroom_v2_start', { p_room: room.room_id, p_expected_version: hv.version });
  await page.getByText('Which base pairs').waitFor({ timeout: 15000 });
  await shot(page, 'question');
  await page.keyboard.press('4');
  await page.getByText('Direct hit').waitFor({ timeout: 15000 });
  await shot(page, 'hit');
  hv = await view(room.room_id);
  ok(hv.boss && hv.boss.damage > 0 && hv.boss.hp === 450 * 1 * 3, `boss took damage (${hv.boss?.damage} of ${hv.boss?.hp})`);

  await call('classroom_v2_next', { p_room: room.room_id, p_expected_version: hv.version });
  await page.getByText('What is the SI unit').waitFor({ timeout: 15000 });
  hv = await view(room.room_id);
  ok(await call('classroom_v2_game_close', { p_room: room.room_id, p_question: hv.question.id }), 'host ended question early');
  await page.getByText("Time's up").waitFor({ timeout: 15000 });
  ok(true, "student saw Time's up after early close");

  hv = await view(room.room_id);
  await call('classroom_v2_finish', { p_room: room.room_id, p_expected_version: hv.version });
  await page.getByText('Final place').waitFor({ timeout: 15000 });
  await shot(page, 'final');
  const report = await call('classroom_v2_game_report', { p_room: room.room_id });
  ok(report.players[0].alias === 'E2E Student' && report.players[0].answers.length === 1 && !report.questions[2].opened, 'report correct');
} finally {
  await browser.close();
  const { data } = await host.auth.getSession();
  if (data.session) fs.writeFileSync(sessionFile, JSON.stringify({ session: data.session }), { mode: 0o600 });
}
ok(errors.length === 0, `no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
