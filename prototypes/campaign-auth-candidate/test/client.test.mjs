import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { loadSourceModule } from '../../../tests/support/source-harness.mjs';
const { CampaignClient } = loadSourceModule('prototypes/campaign-auth-candidate/client.ts', {}, { AbortController });
const alice='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', bob='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const run='00000000-0000-4000-8000-000000000001', otherRun='00000000-0000-4000-8000-000000000002';
const req='00000000-0000-4000-8000-000000000011';
const view=(overrides={})=>({run,version:0,phase:'question',turn:1,boss_hp:28,player_hp:100,energy:0,combo:0,shield:false,charging:false,deadline:'2026-11-03T01:00:15Z',question:{id:1,prompt:'Question?',options:['a','b','c','d']},...overrides});
const response=(overrides={})=>({run,request_id:req,kind:'answer',expected_version:0,version:1,phase:'feedback',turn:1,boss_hp:28,player_hp:100,energy:2,combo:1,shield:false,charging:false,receipt:{question_id:1,correct:true,correct_index:0,explanation:'Reason',damage:0},...overrides});
function double() {
  const calls=[], pending=[];
  return {calls,pending,rpc(name,args){return {abortSignal(signal){calls.push({name,args,signal});return new Promise((resolve,reject)=>pending.push({resolve,reject}));}}}};
}
const ok=data=>({data,error:null});
async function startAndView(client,transport) {
  const start=client.start(1); transport.pending.shift().resolve(ok({run,release_id:1,version:0,phase:'question'}));await start;
  const refresh=client.refresh();transport.pending.shift().resolve(ok(view()));await refresh;
}
test('RPC payloads never include a caller actor, damage, energy or reward',async()=>{
 const t=double(), c=new CampaignClient(t);c.setContext(alice,run);await startAndView(c,t);
 const a=c.act(req,'answer',0);t.pending.shift().resolve(ok(response()));await a;
 assert.deepEqual(Object.keys(t.calls[0].args).sort(),['p_release','p_run']);
 assert.deepEqual(Object.keys(t.calls[2].args).sort(),['p_expected','p_kind','p_request','p_run','p_value']);
 assert.equal(t.calls[2].args.p_request,req);assert.equal(t.calls[2].args.p_expected,0);
 assert.equal(c.hasUncertainAction,false);
 await assert.rejects(c.act(req,'hit'),/Refresh the run/);
});
test('rejects foreign, malformed, leaked-key and contradictory states',async()=>{
 const t=double(),c=new CampaignClient(t);c.setContext(alice,run);
 for(const invalid of [view({run:otherRun}),view({energy:7}),view({question:{id:1,prompt:'Q',options:['a','b','c','d'],correct_index:0}})]) {
  const p=c.refresh();t.pending.shift().resolve(ok(invalid));await assert.rejects(p,/Invalid or foreign/);
 }
 const p=c.refresh();t.pending.shift().resolve(ok(view()));await p;
 const q=c.refresh();t.pending.shift().resolve(ok(view({boss_hp:14})));await assert.rejects(q,/Contradictory/);
});
test('start rejects a different content release for the same run',async()=>{
 const t=double(),c=new CampaignClient(t);c.setContext(alice,run);
 const p=c.start(1);t.pending.shift().resolve(ok({run,release_id:2,version:0,phase:'question'}));
 await assert.rejects(p,/Invalid or foreign/);
});
test('malformed or foreign action responses keep the exact mutation uncertain',async()=>{
 const t=double(),c=new CampaignClient(t);c.setContext(alice,run);await startAndView(c,t);
 const first=c.act(req,'answer',0);t.pending.shift().resolve(ok(response({request_id:otherRun})));await assert.rejects(first,/Invalid or foreign/);
 assert.equal(c.hasUncertainAction,true);
 await assert.rejects(c.act(otherRun,'hit'),/pending action/);
 const retry=c.retryUncertain();const last=t.calls.at(-1);assert.deepEqual(last.args,t.calls[2].args);
 t.pending.shift().resolve(ok(response()));await retry;assert.equal(c.hasUncertainAction,false);
 const stale=c.refresh();t.pending.shift().resolve(ok(view()));await assert.rejects(stale,/Stale server state/);
 const receipt=c.lastReceipt();t.pending.shift().resolve(ok({run,version:1,turn:2,receipt:null}));await assert.rejects(receipt,/contradictory receipt/);
});
test('an answer result must match its originating question and declared answer',async()=>{
 const t=double(),c=new CampaignClient(t);c.setContext(alice,run);await startAndView(c,t);
 const first=c.act(req,'answer',0);t.pending.shift().resolve(ok(response({receipt:{question_id:9,correct:true,correct_index:0,explanation:'x',damage:0}})));await assert.rejects(first,/Invalid or foreign/);
 const retry=c.retryUncertain();t.pending.shift().resolve(ok(response({receipt:{question_id:1,correct:true,correct_index:1,explanation:'x',damage:0}})));await assert.rejects(retry,/Invalid or foreign/);
});
test('a thrown transport failure keeps the original action for exact replay',async()=>{
 const t=double(),c=new CampaignClient(t);c.setContext(alice,run);await startAndView(c,t);
 const first=c.act(req,'answer',0);t.pending.shift().reject(new Error('connection lost'));await assert.rejects(first,/connection lost/);
 assert.equal(c.hasUncertainAction,true);
 const retry=c.retryUncertain();assert.deepEqual(t.calls.at(-1).args,t.calls[2].args);
 t.pending.shift().resolve(ok(response()));await retry;assert.equal(c.hasUncertainAction,false);
});
test('callers cannot mutate the private view used for version and receipt checks',async()=>{
 const t=double(),c=new CampaignClient(t);c.setContext(alice,run);
 const pending=c.refresh();t.pending.shift().resolve(ok(view()));const exposed=await pending;
 exposed.version=99;exposed.question.id=900;exposed.question.options[0]='changed';
 const answer=c.act(req,'answer',0);assert.equal(t.calls.at(-1).args.p_expected,0);
 t.pending.shift().resolve(ok(response()));assert.equal((await answer).receipt.question_id,1);
});
test('a fabricated damage, energy or heal result fails closed',async()=>{
 const t=double(),c=new CampaignClient(t);c.setContext(alice,run);await startAndView(c,t);
 const answer=c.act(req,'answer',0);t.pending.shift().resolve(ok(response({energy:5})));await assert.rejects(answer,/Invalid or foreign/);
 assert.equal(c.hasUncertainAction,true);
});
test('switching account or run aborts old requests and old completion cannot mutate the new context',async()=>{
 const t=double(),c=new CampaignClient(t);c.setContext(alice,run);
 const first=c.refresh();const old=t.pending.shift();const oldSignal=t.calls[0].signal;
 c.setContext(bob,otherRun);assert.equal(oldSignal.aborted,true);
 const second=c.refresh();const newPending=t.pending.shift();
 old.resolve(ok(view()));await assert.rejects(first,/Account or run changed/);
 newPending.resolve(ok(view({run:otherRun})));assert.equal((await second).run,otherRun);
 const p=c.act(req,'answer',0);t.pending.shift().resolve(ok(response({run:otherRun})));assert.equal((await p).run,otherRun);
});
test('invalid account-change notification also clears the previous identity and aborts requests',async()=>{
 const t=double(),c=new CampaignClient(t);c.setContext(alice,run);
 const first=c.refresh(), old=t.pending.shift(), signal=t.calls[0].signal;
 assert.throws(()=>c.setContext('bad-account',otherRun),/Invalid identifier/);
 assert.equal(signal.aborted,true);
 old.resolve(ok(view()));await assert.rejects(first,/Account or run changed/);
 await assert.rejects(c.refresh(),/No active run/);
});
test('an in-flight mutation from an old account cannot mark a replacement run uncertain',async()=>{
 const t=double(),c=new CampaignClient(t);c.setContext(alice,run);await startAndView(c,t);
 const oldAction=c.act(req,'answer',0), old=t.pending.shift(), signal=t.calls.at(-1).signal;
 c.setContext(bob,otherRun);assert.equal(signal.aborted,true);assert.equal(c.hasUncertainAction,false);
 const newer=c.refresh();const pending=t.pending.shift();old.resolve(ok(response()));
 await assert.rejects(oldAction,/Account or run changed/);
 pending.resolve(ok(view({run:otherRun})));await newer;
 assert.equal(c.hasUncertainAction,false);
});
test('receipt response must match run and version; claim requires a confirmed win',async()=>{
 const t=double(),c=new CampaignClient(t);c.setContext(alice,run);await startAndView(c,t);
 await assert.rejects(c.claim(),/confirmed win/);
 let p=c.lastReceipt();t.pending.shift().resolve(ok({run:otherRun,version:0,turn:1,receipt:null}));await assert.rejects(p,/Invalid or foreign/);
 p=c.lastReceipt();t.pending.shift().resolve(ok({run,version:0,turn:1,receipt:response().receipt}));await assert.rejects(p,/before an answer/);
 p=c.lastReceipt();t.pending.shift().resolve(ok({run,version:1,turn:1,receipt:{...response().receipt,question_id:9}}));await assert.rejects(p,/different question/);
 p=c.refresh();t.pending.shift().resolve(ok(view({version:1,phase:'feedback',question:null,energy:2,combo:1})));await p;
 p=c.lastReceipt();t.pending.shift().resolve(ok({run,version:1,turn:1,receipt:null}));await assert.rejects(p,/receipt is missing/);
 p=c.refresh();t.pending.shift().resolve(ok(view({version:4,phase:'won',boss_hp:0,question:null})));await p;
 const win=c.claim();t.pending.shift().resolve(ok({run,awarded:25}));assert.equal((await win).awarded,25);
 assert.deepEqual(Object.keys(t.calls.at(-1).args),['p_run']);
});
let db;
const signatures={start_run:['p_run','p_release'],get_state:['p_run'],last_receipt:['p_run'],act:['p_run','p_request','p_expected','p_kind','p_value'],claim:['p_run']};
function sqlTransport(loseFirstAnswer=false) {
 return {rpc(name,args){return {async abortSignal(signal){if(signal.aborted)throw new Error('aborted');const keys=signatures[name];assert.ok(keys);try {const rows=await db.query(`select campaign_api.${name}(${keys.map((_,i)=>`$${i+1}`).join(',')}) as data`,keys.map(k=>args[k]));if(name==='act'&&loseFirstAnswer){loseFirstAnswer=false;throw new Error('lost after commit');}return {data:rows.rows[0].data,error:null};}catch(e){return {data:null,error:{message:e.message}};}}}}};
}
before(async()=>{db=new PGlite();await db.exec(await readFile(new URL('../schema.sql',import.meta.url),'utf8'));});
after(async()=>{await db?.close();});
test('adapter runs against isolated SQL functions with synthetic authenticated identity',async()=>{
 await db.exec('set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[alice]);
 const c=new CampaignClient(sqlTransport(true));c.setContext(alice,run);await c.start(1);assert.equal((await c.refresh()).question.id,1);assert.equal(await c.lastReceipt(),null);
 await assert.rejects(c.act(req,'answer',0),/lost after commit/);
 assert.equal(c.hasUncertainAction,true);assert.equal((await c.retryUncertain()).receipt.correct,true);
 assert.equal((await c.lastReceipt()).correct,true);
 await c.refresh();await c.act('00000000-0000-4000-8000-000000000012','hit');await c.refresh();
 assert.equal((await c.act('00000000-0000-4000-8000-000000000013','hit')).phase,'won');await c.refresh();assert.equal((await c.claim()).awarded,25);
});
test('adapter validates next, block and charge transitions against actual isolated SQL',async()=>{
 const c=new CampaignClient(sqlTransport());c.setContext(alice,otherRun);await c.start(1);await c.refresh();
 await c.act(req,'answer',0);await c.refresh();
 await c.act('00000000-0000-4000-8000-000000000012','next');await c.refresh();
 assert.equal((await c.act('00000000-0000-4000-8000-000000000013','block')).shield,true);await c.refresh();
 const blocked=await c.act('00000000-0000-4000-8000-000000000014','answer',0);
 assert.equal(blocked.receipt.correct,false);assert.equal(blocked.receipt.damage,0);await c.refresh();
 assert.equal((await c.act('00000000-0000-4000-8000-000000000015','next')).charging,true);await c.refresh();
 const blockCharge=await c.act('00000000-0000-4000-8000-000000000016','block');
 assert.equal(blockCharge.charging,false);assert.equal(blockCharge.shield,true);
});
