import test from 'node:test';
import assert from 'node:assert/strict';
import { createClassroomCore, hashSessionSecret, sealSessionQuestions } from '../../lib/classroom-server/classroom-core.mjs';

// Deliberately public deterministic fixture strings, NOT issued credentials.
const A = 'SYNTHETIC-NONSECRET-ALICE-SESSION-000000000';
const B = 'SYNTHETIC-NONSECRET-BOB-SESSION-00000000000';
function fixture({ injectFailure } = {}) {
  let clock = 1000;
  const state = {
    sessions: new Map([['room-a', { id:'room-a', hostId:'host-a', status:'active', currentIndex:0,
      startedAt:0, durationMs:15000, expiresAt:100000, doubleIndex:null,
      questions:[{stem:'Synthetic question',options:['A','B'],correctIndex:0,revision:'v1'},
        {stem:'Synthetic second',options:['C','D'],correctIndex:1,revision:'v2'}] }]]),
    players:new Map(['alice','bob'].map(id=>[id,{id,sessionId:'room-a',alias:'Same alias',score:0,ownerId:null}])),
    guestSessions:new Map([['alice',{playerId:'alice',sessionId:'room-a',secretHash:hashSessionSecret(A),expiresAt:50000}],
      ['bob',{playerId:'bob',sessionId:'room-a',secretHash:hashSessionSecret(B),expiresAt:50000}]]),
    answers:new Map(), claims:new Map(), xp:new Map(),
  };
  state.sessions.get('room-a').questionSet=sealSessionQuestions(state.sessions.get('room-a').questions);
  let tail=Promise.resolve();
  const repo={ transaction(fn) {
    const operation=tail.then(async()=>{
      const draft=structuredClone(state);
      if (injectFailure === 'score') {
        const player=draft.players.get('alice');
        Object.defineProperty(player,'score',{get(){return 0;},set(){throw new Error('injected score failure');},configurable:true});
      }
      if (injectFailure === 'xp') draft.xp.set=()=>{throw new Error('injected XP failure');};
      const result=await fn(draft);
      Object.assign(state,draft);
      return structuredClone(result);
    });
    tail=operation.catch(()=>{}); return operation;
  }};
  const core=createClassroomCore({repo,now:()=>clock});
  const alice={sessionId:'room-a',playerId:'alice',secret:A};
  const bob={sessionId:'room-a',playerId:'bob',secret:B};
  return {state,core,alice,bob,setTime:t=>clock=t,room:()=>state.sessions.get('room-a')};
}
const denies = (promise, code='forbidden') => assert.rejects(promise,e=>e.code===code);

test('unanswered snapshot exposes no key, other player, or secret',async()=>{
  const {core,alice}=fixture(); const s=await core.snapshot(alice,0);
  assert.equal(s.ownReceipt,null); assert.deepEqual(s.question.options,['A','B']);
  assert.equal(JSON.stringify(s).includes('correctIndex'),false);
  assert.equal(JSON.stringify(s).includes('secret'),false);
});
test('same alias and known IDs cannot select another participant',async()=>{
  const {core,alice,bob}=fixture();
  await denies(core.snapshot({...alice,playerId:bob.playerId},0));
  await denies(core.submit({...alice,playerId:bob.playerId},{index:0,choice:0}));
  await denies(core.snapshot({...alice,sessionId:'room-b'},0));
});
test('bad, missing and malformed secret or identity is uniform denial',async()=>{
  const {core,alice}=fixture();
  for(const proof of [null,{}, {...alice,secret:''}, {...alice,secret:'x'.repeat(600)}, {...alice,secret:B}, {...alice,playerId:'missing'}]) await denies(core.snapshot(proof,0));
});
test('expired/revoked guest proof and expired room cannot replay a receipt',async()=>{
  for(const variant of ['token','room','revoked']) {
    const f=fixture(); await f.core.submit(f.alice,{index:0,choice:0});
    if(variant==='token') f.setTime(50000);
    if(variant==='room') f.room().expiresAt=1000;
    if(variant==='revoked') f.state.guestSessions.get('alice').revoked=true;
    await denies(f.core.snapshot(f.alice,0));
    await denies(f.core.submit(f.alice,{index:0,choice:0}));
  }
});
test('lost acknowledgement restores authoritative receipt without another award',async()=>{
  const f=fixture();const original=await f.core.submit(f.alice,{index:0,choice:0});
  const restored=await f.core.snapshot(f.alice,0);
  assert.deepEqual(restored.ownReceipt,original);assert.equal(f.state.answers.size,1);
  assert.equal(f.state.players.get('alice').score,original.points);
});
test('30 simultaneous retries including changed choices award exactly once',async()=>{
  const f=fixture();const results=await Promise.all(Array.from({length:30},(_,i)=>f.core.submit(f.alice,{index:0,choice:i%2})));
  for(const r of results) assert.deepEqual(r,results[0]);
  assert.equal(f.state.answers.size,1);assert.equal(f.state.players.get('alice').score,results[0].points);
});
test('snapshot rejects stale index; committed replay remains own immutable receipt',async()=>{
  const f=fixture();const original=await f.core.submit(f.alice,{index:0,choice:0});
  f.room().currentIndex=1;
  await denies(f.core.snapshot(f.alice,0),'stale-question');
  assert.equal((await f.core.snapshot(f.alice,1)).ownReceipt,null);
  assert.deepEqual(await f.core.submit(f.alice,{index:0,choice:1}),original);
});
test('mutable bank edit cannot rewrite accepted receipt',async()=>{
  const f=fixture();const original=await f.core.submit(f.alice,{index:0,choice:0});
  f.room().questions[0].correctIndex=1;f.room().questions[0].revision='v99';
  f.room().questions[0].options=['Changed A','Changed B'];
  assert.deepEqual((await f.core.snapshot(f.alice,0)).question.options,['A','B']);
  assert.deepEqual((await f.core.snapshot(f.alice,0)).ownReceipt,original);
});
test('legacy receipt keeps stored correctness/points without inventing key',async()=>{
  const f=fixture(); f.state.answers.set('alice:0',{questionIndex:0,choice:1,isCorrect:false,points:0,answeredAt:10});
  const receipt=(await f.core.snapshot(f.alice,0)).ownReceipt;
  assert.equal(receipt.correctIndex,null); assert.equal(receipt.contentRevision,null);
  assert.equal(receipt.keyProvenance,'legacy-unavailable');assert.equal(receipt.isCorrect,false);
});
test('legacy player with no issued session cannot regain ownership by alias or ID',async()=>{
  const f=fixture();f.state.guestSessions.delete('alice');await denies(f.core.snapshot(f.alice,0));
});
test('invalid choice, stale index, closed deadline and invalid content do not mutate',async()=>{
  for(const [kind,code] of [['choice','invalid-choice'],['index','stale-question'],['deadline','answer-window-closed'],['content','unverified-question']]) {
    const f=fixture();if(kind==='deadline')f.setTime(15000);if(kind==='content')f.room().questionSet.questions[0].revision=null;
    await denies(f.core.submit(f.alice,{index:kind==='index'?1:0,choice:kind==='choice'?-1:0}),code);
    assert.equal(f.state.answers.size,0);assert.equal(f.state.players.get('alice').score,0);
  }
});
test('host owns roster; participant gets only own final standing',async()=>{
  const f=fixture();await denies(f.core.hostRoster({userId:'host-b'},'room-a'));
  await denies(f.core.hostRoster({userId:'alice'},'room-a'));
  await denies(f.core.hostRoster(null,'room-a'));
  assert.equal((await f.core.hostRoster({userId:'host-a'},'room-a')).length,2);
  await denies(f.core.ownStanding(f.alice),'not-complete');
  f.room().status='complete';assert.deepEqual(await f.core.ownStanding(f.alice),{score:0,rank:1});
});
test('claim requires both guest proof and non-anonymous authenticated destination',async()=>{
  const f=fixture();f.room().status='complete';
  for(const principal of [null,{userId:'account-a'},{userId:'account-a',isAnonymous:true}])await denies(f.core.claim(f.alice,principal));
  await denies(f.core.claim({...f.alice,playerId:'bob'},{userId:'account-a',isAnonymous:false}));
});
test('claims before completion and foreign owned-player transfer fail',async()=>{
  const f=fixture();const p={userId:'account-a',isAnonymous:false};
  await denies(f.core.claim(f.alice,p),'not-complete');f.room().status='complete';
  f.state.players.get('alice').ownerId='account-b';await denies(f.core.claim(f.alice,p));assert.equal(f.state.xp.size,0);
});
test('30 repeated claims award once; different destination replay is denied',async()=>{
  const f=fixture();await f.core.submit(f.alice,{index:0,choice:0});f.room().status='complete';
  const principal={userId:'account-a',isAnonymous:false};
  const results=await Promise.all(Array.from({length:30},()=>f.core.claim(f.alice,principal)));
  for(const r of results)assert.deepEqual(r,results[0]);
  assert.equal(f.state.claims.size,1);assert.equal(f.state.xp.get('account-a'),results[0].awarded);
  await denies(f.core.claim(f.alice,{userId:'account-b',isAnonymous:false}));
});
test('wrong answer records stable zero-point receipt and double scoring stays bounded',async()=>{
  const f=fixture();f.room().doubleIndex=0;
  assert.equal((await f.core.submit(f.bob,{index:0,choice:1})).points,0);
  const correct=await f.core.submit(f.alice,{index:0,choice:0});assert.equal(correct.points,294);
});

test('returned objects cannot mutate persisted receipts or question snapshots',async()=>{
  const f=fixture();const receipt=await f.core.submit(f.alice,{index:0,choice:0});receipt.points=99999;
  const snapshot=await f.core.snapshot(f.alice,0);snapshot.question.options[0]='tampered';
  assert.equal((await f.core.snapshot(f.alice,0)).ownReceipt.points,147);
  assert.equal((await f.core.snapshot(f.alice,0)).question.options[0],'A');
});
test('lobby snapshot returns null question and null receipt',async()=>{
  const f=fixture();f.room().status='lobby';f.room().currentIndex=-1;
  const s=await f.core.snapshot(f.alice,-1);assert.equal(s.question,null);assert.equal(s.ownReceipt,null);
});
test('concurrent claims for different accounts bind exactly one destination',async()=>{
  const f=fixture();f.room().status='complete';f.state.players.get('alice').score=100;
  const results=await Promise.allSettled(['account-a','account-b'].map(userId=>f.core.claim(f.alice,{userId,isAnonymous:false})));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(results.filter(r=>r.status==='rejected').length,1);
  assert.equal([...f.state.xp.values()].reduce((a,b)=>a+b,0),100);
});
test('core rolls back answer insert when score write fails',async()=>{
  const f=fixture({injectFailure:'score'});
  await assert.rejects(f.core.submit(f.alice,{index:0,choice:0}),/injected score failure/);
  assert.equal(f.state.answers.size,0);assert.equal(f.state.players.get('alice').score,0);
});
test('core rolls back claim insert when XP write fails',async()=>{
  const f=fixture({injectFailure:'xp'});f.room().status='complete';f.state.players.get('alice').score=100;
  await assert.rejects(f.core.claim(f.alice,{userId:'account-a',isAnonymous:false}),/injected XP failure/);
  assert.equal(f.state.claims.size,0);assert.equal(f.state.xp.size,0);
});
test('displayed content is sealed before first submission despite bank edits',async()=>{
  const f=fixture();const shown=await f.core.snapshot(f.alice,0);
  f.room().questions[0]={stem:'Replacement',options:['New A','New B'],correctIndex:1,revision:'v99'};
  const receipt=await f.core.submit(f.alice,{index:0,choice:0});
  assert.equal(receipt.isCorrect,true);assert.equal(receipt.contentRevision,'v1');
  assert.deepEqual((await f.core.snapshot(f.alice,0)).question,shown.question);
});
test('tampering sealed content without matching seal fails closed',async()=>{
  const f=fixture();await f.core.snapshot(f.alice,0);f.room().questionSet.questions[0].correctIndex=1;
  await denies(f.core.submit(f.alice,{index:0,choice:0}),'unverified-question');assert.equal(f.state.answers.size,0);
});
test('committed replay does not depend on removed mutable question lists or set',async()=>{
  const f=fixture();const receipt=await f.core.submit(f.alice,{index:0,choice:0});
  f.room().questions=[];f.room().questionSet=null;f.room().status='complete';
  assert.deepEqual(await f.core.submit(f.alice,{index:0,choice:1}),receipt);
  assert.deepEqual((await f.core.snapshot(f.alice,0)).ownReceipt,receipt);
});
test('legacy receipt never pairs historical choice with current edited options',async()=>{
  const f=fixture();f.state.answers.set('alice:0',{questionIndex:0,choice:1,isCorrect:false,points:0,answeredAt:10});
  f.room().questions[0]={stem:'Replacement',options:['New A','New B'],correctIndex:1,revision:'v99'};
  const snap=await f.core.snapshot(f.alice,0);
  assert.equal(snap.question,null);assert.equal(snap.contentStatus,'historical-content-unavailable');
  assert.equal(snap.ownReceipt.correctIndex,null);assert.equal(snap.ownReceipt.acceptedChoice,1);
});
test('partial/mismatched receipt provenance cannot claim frozen content',async()=>{
  for(const kind of ['absent-snapshot','absent-proof','wrong-revision','wrong-fingerprint']) {
    const f=fixture();await f.core.submit(f.alice,{index:0,choice:0});const a=f.state.answers.get('alice:0');
    if(kind==='absent-snapshot')delete a.questionSnapshot;
    if(kind==='absent-proof')delete a.provenanceVersion;
    if(kind==='wrong-revision')a.questionSnapshot.contentRevision='v99';
    if(kind==='wrong-fingerprint')a.snapshotFingerprint='wrong';
    const snap=await f.core.snapshot(f.alice,0);assert.equal(snap.question,null);
    assert.equal(snap.ownReceipt.keyProvenance,'legacy-unavailable');assert.equal(snap.ownReceipt.correctIndex,null);
  }
});
