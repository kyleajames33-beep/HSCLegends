import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

let db;
const run = '00000000-0000-4000-8000-000000000001';
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const one = async (sql, params=[]) => (await db.query(sql,params)).rows[0].value;
const start = (actor='alice',runId=run) => one('select campaign_lab.start_run($1,$2) as value',[actor,runId]);
const state = (actor='alice') => one('select campaign_lab.get_state($1,$2) as value',[actor,run]);
const lastReceipt = (actor='alice') => one('select campaign_lab.last_receipt($1,$2) as value',[actor,run]);
const act = (n,version,kind,value=null,actor='alice') => one('select campaign_lab.act($1,$2,$3,$4,$5,$6) as value',[actor,run,id(n),version,kind,value]);
const claim = (actor='alice') => one('select campaign_lab.claim($1,$2) as value',[actor,run]);

before(async () => { db = new PGlite(); await db.exec(await readFile(new URL('../schema.sql',import.meta.url),'utf8')); });
beforeEach(async () => {await db.exec('truncate campaign_lab.actions,campaign_lab.awards,campaign_lab.wallets,campaign_lab.runs cascade');});
after(async () => {await db?.close();});

test('guests cannot read keys, invoke gateway functions, or impersonate the owner', async () => {
  await start(); const s=await state();
  assert.equal(s.question.id,1); assert.equal('correct_index' in s.question,false);
  assert.equal(JSON.stringify(s).includes('explanation'),false);
  assert.equal(await lastReceipt(),null);
  await assert.rejects(state('mallory'),/not owner/);
  await assert.rejects(state(null),/not owner/);
  await assert.rejects(act(1,0,'answer',0,'mallory'),/not owner/);
  await db.exec('set role campaign_lab_guest');
  try {
    await assert.rejects(db.query('select * from campaign_lab.question_bank'),/permission denied/);
    await assert.rejects(state(),/permission denied/);
  } finally { await db.exec('reset role'); }
});

test('gateway can call its restricted API but cannot read the private question bank', async () => {
  await db.exec('set role campaign_lab_gateway');
  try {
    await start();
    assert.equal((await state()).question.id,1);
    await assert.rejects(db.query('select * from campaign_lab.question_bank'),/permission denied/);
  } finally { await db.exec('reset role'); }
});

test('server grades answers, validates values and prevents early or late expiry', async () => {
  await start();
  await assert.rejects(act(1,0,'answer',4),/invalid choice/);
  await assert.rejects(act(1,0,'expire'),/not expired/);
  const wrong=await act(1,0,'answer',1);
  assert.equal(wrong.receipt.correct,false); assert.equal(wrong.energy,0); assert.equal(wrong.player_hp,86);
  assert.deepEqual(await lastReceipt(),wrong.receipt);
  await assert.rejects(lastReceipt('mallory'),/not owner/);
  await assert.rejects(act(2,1,'answer',0),/not answering/);
  await db.exec('truncate campaign_lab.actions,campaign_lab.runs cascade'); await start();
  await db.query("update campaign_lab.runs set question_started=clock_timestamp()-interval '16 seconds' where id=$1",[run]);
  await assert.rejects(act(3,0,'answer',0),/deadline passed/);
  const expired=await act(3,0,'expire'); assert.equal(expired.receipt.correct,false); assert.equal(expired.player_hp,86);
});

test('request replay is idempotent, conflicting payloads and stale actions are rejected', async () => {
  await start(); const receipt=await act(1,0,'answer',0);
  assert.equal(receipt.receipt.correct,true); assert.equal(receipt.energy,2);
  assert.deepEqual(await act(1,0,'answer',0),receipt);
  await assert.rejects(act(1,0,'answer',1),/request conflict/);
  await assert.rejects(act(1,2,'answer',0),/request conflict/);
  await assert.rejects(act(2,0,'hit'),/stale version/);
  const hit=await act(2,1,'hit'); assert.equal(hit.boss_hp,14); assert.equal(hit.energy,1);
  assert.deepEqual(await act(2,1,'hit'),hit);
  await assert.rejects(act(3,2,'special'),/insufficient energy/);
  const s=await state(); assert.equal(s.version,2); assert.equal(s.energy,1); assert.equal(s.boss_hp,14);
});

test('concurrent promises against one client leave only one accepted answer', async () => {
  await start();
  const attempts = await Promise.allSettled([act(1,0,'answer',0),act(2,0,'answer',0)]);
  assert.equal(attempts.filter(x => x.status === 'fulfilled').length,1);
  assert.equal(attempts.filter(x => x.status === 'rejected').length,1);
  assert.equal((await db.query('select count(*)::int as n from campaign_lab.actions')).rows[0].n,1);
  assert.equal((await state()).energy,2);
});

test('shield, boss charge and health are owned by the server', async () => {
  await start(); await act(1,0,'answer',0); await act(2,1,'next');
  await act(3,2,'answer',1); await act(4,3,'next');
  let s=await state(); assert.equal(s.charging,true); assert.equal(s.energy,4);
  s=await act(5,4,'block'); assert.equal(s.charging,false); assert.equal(s.shield,true);
  s=await act(6,5,'answer',0); assert.equal(s.receipt.correct,false); assert.equal(s.receipt.damage,0); assert.equal(s.shield,false);
});

test('win is required for claim and repeated claims award exactly once', async () => {
  await start(); await assert.rejects(claim(),/not won/);
  await act(1,0,'answer',0); await act(2,1,'hit'); const last=await act(3,2,'hit'); assert.equal(last.phase,'won');
  await assert.rejects(claim('mallory'),/not owner/);
  const results=await Promise.all(Array.from({length:12},()=>claim()));
  assert.ok(results.every(x=>x.awarded===25));
  assert.equal((await db.query('select balance from campaign_lab.wallets where owner=$1',['alice'])).rows[0].balance,25);
  assert.equal((await db.query('select count(*)::int as n from campaign_lab.awards')).rows[0].n,1);
  await assert.rejects(act(4,3,'hit'),/run finished/);
});

test('rollback removes answer receipt, state changes and reward together', async () => {
  await start();
  await db.exec('begin'); await act(1,0,'answer',0); await db.exec('rollback');
  let s=await state(); assert.equal(s.version,0); assert.equal(s.energy,0); assert.equal(s.phase,'question');
  assert.equal((await db.query('select count(*)::int as n from campaign_lab.actions')).rows[0].n,0);
  await act(1,0,'answer',0); await act(2,1,'hit'); await act(3,2,'hit');
  await db.exec('begin'); await claim(); await db.exec('rollback');
  assert.equal((await db.query('select count(*)::int as n from campaign_lab.awards')).rows[0].n,0);
  assert.equal((await db.query('select count(*)::int as n from campaign_lab.wallets')).rows[0].n,0);
  await claim(); assert.equal((await db.query('select count(*)::int as n from campaign_lab.awards')).rows[0].n,1);
});
