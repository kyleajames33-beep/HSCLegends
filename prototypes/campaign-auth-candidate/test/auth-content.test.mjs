import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

let db;
const alice='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const bob='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const run='00000000-0000-4000-8000-000000000001';
const req=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const one=async (sql,params=[]) => (await db.query(sql,params)).rows[0].value;
const actor=async id=>{await db.exec('reset role; set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id??'']);};
const admin=()=>db.exec('reset role');
const start=(id=run,release=1)=>one('select campaign_api.start_run($1,$2) as value',[id,release]);
const state=()=>one('select campaign_api.get_state($1) as value',[run]);
const receipt=async()=> (await one('select campaign_api.last_receipt($1) as value',[run])).receipt;
const act=(n,version,kind,value=null)=>one('select campaign_api.act($1,$2,$3,$4,$5) as value',[run,req(n),version,kind,value]);
const claim=()=>one('select campaign_api.claim($1) as value',[run]);

before(async()=>{db=new PGlite();await db.exec(await readFile(new URL('../schema.sql',import.meta.url),'utf8'));});
beforeEach(async()=>{await admin();await db.exec('truncate campaign_lab.actions,campaign_lab.awards,campaign_lab.wallets,campaign_lab.run_questions,campaign_lab.runs cascade');await actor(alice);});
after(async()=>{await db?.close();});

test('anonymous role has no API or private-data privileges',async()=>{
 await admin();await db.exec('set role anon');
 try {
  await assert.rejects(start(),/permission denied/);
  await assert.rejects(db.query('select * from campaign_lab.question_bank'),/permission denied/);
 } finally {await admin();}
});

test('authenticated role requires identity and cannot access private tables or actor-based routines',async()=>{
 await actor(null);await assert.rejects(start(),/authentication required/);
 await actor(alice);await start();
 await assert.rejects(db.query('select * from campaign_lab.runs'),/permission denied/);
 await assert.rejects(db.query('select * from campaign_lab.question_bank'),/permission denied/);
 await assert.rejects(db.query('select * from campaign_lab.run_questions'),/permission denied/);
 await assert.rejects(db.query('select campaign_lab.start_run($1,$2,$3)',[bob,run,1]),/permission denied/);
 // No public API overload accepts a caller-supplied actor.
 await assert.rejects(db.query('select campaign_api.act($1,$2,$3,$4,$5,$6)',[bob,run,req(1),0,'answer',0]),/function .* does not exist/);
});

test('different verified identities cannot inspect, answer, or claim another run',async()=>{
 await start();await actor(bob);
 await assert.rejects(state(),/not owner/);
 await assert.rejects(receipt(),/not owner/);
 await assert.rejects(act(1,0,'answer',0),/not owner/);
 await assert.rejects(claim(),/not owner/);
 await assert.rejects(start(),/not owner/);
});

test('state hides answers before submission; recorded receipt recovers only for owner',async()=>{
 await start();const beforeState=await state();
 assert.equal(beforeState.question.id,1);assert.equal('correct_index' in beforeState.question,false);assert.equal(JSON.stringify(beforeState).includes('explanation'),false);
 assert.equal(await receipt(),null);
 const result=await act(1,0,'answer',0);assert.equal(result.receipt.correct,true);
 assert.deepEqual(await receipt(),result.receipt);
 await actor(bob);await assert.rejects(receipt(),/not owner/);
});

test('published content is immutable and run answers are a frozen server snapshot',async()=>{
 await start();await admin();
 await assert.rejects(db.query("update campaign_lab.question_bank set correct_index=1 where qid=1"),/published content immutable/);
 await assert.rejects(db.query("update campaign_lab.content_releases set revision='rewritten' where id=1"),/published release immutable/);
 const snapshot=await db.query('select source_id,correct_index,reviewer,reviewed_at from campaign_lab.run_questions where run_id=$1 order by slot',[run]);
 assert.deepEqual(snapshot.rows.map(x=>x.source_id),[1,2,3,4]);assert.equal(snapshot.rows[0].correct_index,0);
 assert.equal(snapshot.rows[0].reviewer,'synthetic-reviewer');assert.ok(snapshot.rows[0].reviewed_at);
 await actor(alice);assert.equal((await act(1,0,'answer',0)).receipt.correct,true);
});

test('unapproved content cannot start a game and leaves no partial run',async()=>{
 await admin();
 await db.exec("insert into campaign_lab.content_releases values (2,'synthetic','v1','draft-only','draft'); insert into campaign_lab.question_bank values (10,2,'Unreviewed?', '[\"a\",\"b\",\"c\",\"d\"]',0,'fixture','draft',null,null); update campaign_lab.content_releases set status='released' where id=2");
 await actor(alice);await assert.rejects(start(run,2),/no approved content/);
 await admin();assert.equal((await db.query('select count(*)::int as n from campaign_lab.runs')).rows[0].n,0);
});

test('a mixed release snapshots only approved questions and closes slot gaps',async()=>{
 await admin();
 await db.exec(`insert into campaign_lab.content_releases values (3,'synthetic','v1','mixed','draft');
 insert into campaign_lab.question_bank values
  (20,3,'Approved one?', '["a","b","c","d"]',0,'fixture','approved','reviewer',clock_timestamp()),
  (21,3,'Unapproved?', '["a","b","c","d"]',0,'fixture','draft',null,null),
  (22,3,'Approved two?', '["a","b","c","d"]',0,'fixture','approved','reviewer',clock_timestamp());
 update campaign_lab.content_releases set status='released' where id=3`);
 await actor(alice);await start(run,3);
 assert.equal((await state()).question.id,20);
 await act(1,0,'answer',0);await act(2,1,'next');
 assert.equal((await state()).question.id,22);
});

test('replay, stale actions, overspend and claim are server-controlled',async()=>{
 await start();const a=await act(1,0,'answer',0);assert.equal(a.energy,2);
 assert.deepEqual(await act(1,0,'answer',0),a);
 await assert.rejects(act(1,0,'answer',1),/request conflict/);
 await assert.rejects(act(2,0,'hit'),/stale version/);
 await assert.rejects(act(2,1,'special'),/insufficient energy/);
 await assert.rejects(claim(),/not won/);
 await act(2,1,'hit');const last=await act(3,2,'hit');assert.equal(last.phase,'won');
 assert.equal((await claim()).awarded,25);assert.equal((await claim()).awarded,25);
 await admin();assert.equal((await db.query('select balance from campaign_lab.wallets where owner=$1',[alice])).rows[0].balance,25);
 assert.equal((await db.query('select count(*)::int as n from campaign_lab.awards')).rows[0].n,1);
});

test('synthetic direct SQL clients can forge the mocked claim GUC: never expose direct SQL',async()=>{
 await start();await actor(bob);await assert.rejects(state(),/not owner/);
 // This demonstrates a deliberate limit of the synthetic stub, not a secure auth mechanism.
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[alice]);
 assert.equal((await state()).run,run);
});

test('revocation blocks new starts and fresh gameplay actions',async()=>{
 await start();await admin();await db.exec("update campaign_lab.content_releases set status='revoked' where id=1");
 await actor(alice);await assert.rejects(act(1,0,'answer',0),/content unavailable/);
 await assert.rejects(start('00000000-0000-4000-8000-000000000099'),/content unavailable/);
});
