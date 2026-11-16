import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openModel } from './service.mjs';

test('answer receipt is private, immutable and recoverable from a fresh connection', async () => {
  const dir=await mkdtemp(join(tmpdir(),'class-receipt-read-'));
  const path=join(dir,'test.sqlite');
  const model=openModel(path,()=>2000);
  let fresh;
  try {
    const f=model.createFixture(), other=model.addFixturePlayer(f.roomId);
    const before=model.readSnapshot(f.roomId,f.playerId,f.secret);
    assert.equal(before.own_receipt,null);
    assert.equal('correct_index' in before.question,false);
    assert.throws(()=>model.readSnapshot(f.roomId,f.playerId,other.secret),/FORBIDDEN/);
    assert.throws(()=>model.submit(f.roomId,f.playerId,other.secret,f.questionId,0),/FORBIDDEN/);
    const first=model.submit(f.roomId,f.playerId,f.secret,f.questionId,0);
    assert.deepEqual(model.submit(f.roomId,f.playerId,f.secret,f.questionId,1),first);
    fresh=openModel(path,()=>2000);
    const after=fresh.readSnapshot(f.roomId,f.playerId,f.secret);
    assert.deepEqual(after.own_receipt,first);
    assert.equal(after.score,100);
    assert.equal(model.readSnapshot(f.roomId,other.playerId,other.secret).own_receipt,null);
    assert.equal(first.accepted_choice,0);
  } finally {fresh?.close();model.close();await rm(dir,{recursive:true,force:true});}
});

test('late, stale and invalid submissions never produce receipts or points', () => {
  let now=2000;const model=openModel(':memory:',()=>now);
  try {
    const f=model.createFixture();
    assert.throws(()=>model.submit(f.roomId,f.playerId,f.secret,f.questionId,7),/INVALID_CHOICE/);
    assert.throws(()=>model.submit(f.roomId,f.playerId,f.secret,'00000000-0000-4000-8000-000000000000',0),/STALE_QUESTION/);
    now=10000;
    assert.throws(()=>model.submit(f.roomId,f.playerId,f.secret,f.questionId,0),/OUTSIDE_WINDOW/);
    assert.equal(model.readSnapshot(f.roomId,f.playerId,f.secret).score,0);
    assert.equal(model.readSnapshot(f.roomId,f.playerId,f.secret).own_receipt,null);
  } finally {model.close();}
});

test('two concurrent connections commit one immutable receipt and one award', { timeout: 10000 }, async () => {
  const dir=await mkdtemp(join(tmpdir(),'class-receipt-'));
  const path=join(dir,'test.sqlite');
  const model=openModel(path,()=>2000);
  const workers=[];
  try {
    const f=model.createFixture(), gate=new SharedArrayBuffer(8), flags=new Int32Array(gate);
    const launch=choice=>{
      const worker=new Worker(new URL('./race-worker.mjs',import.meta.url),{workerData:{path,fixture:f,choice,gate}});
      workers.push(worker);
      let readyResolve, readyReject; const ready=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject});
      const result=new Promise((resolve,reject)=>{worker.on('message',message=>message.ready?readyResolve():resolve(message));worker.on('error',error=>{readyReject(error);reject(error)});worker.on('exit',code=>{if(code){const error=new Error(`Worker exit ${code}`);readyReject(error);reject(error)}});});
      return {ready,result};
    };
    const a=launch(0),b=launch(1);
    await Promise.all([a.ready,b.ready]);
    Atomics.store(flags,1,1);Atomics.notify(flags,1,2);
    const results=await Promise.all([a.result,b.result]);
    assert.equal(results[0].error,undefined);assert.equal(results[1].error,undefined);
    assert.deepEqual(results[0].receipt,results[1].receipt);
    const snapshot=model.readSnapshot(f.roomId,f.playerId,f.secret);
    assert.equal(snapshot.score,results[0].receipt.awarded_points);
    assert.deepEqual(snapshot.own_receipt,results[0].receipt);
  } finally {await Promise.all(workers.map(worker=>worker.terminate()));model.close();await rm(dir,{recursive:true,force:true});}
});
