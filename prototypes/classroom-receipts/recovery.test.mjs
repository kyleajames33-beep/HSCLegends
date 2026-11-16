import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openModel } from './service.mjs';
import { createRecoveryController, validateSnapshot } from './recovery.mjs';

test('fresh synthetic client restores only an authorized committed receipt', async () => {
  const model=openModel(':memory:',()=>2000);
  try {
    const f=model.createFixture();
    model.submit(f.roomId,f.playerId,f.secret,f.questionId,0);
    let visible;
    const controller=createRecoveryController(async (...args)=>model.readSnapshot(...args), s=>{visible=s});
    controller.bind(f.roomId,f.playerId,f.secret);
    assert.equal(await controller.refresh(),true);
    assert.equal(visible.own_receipt.accepted_choice,0);
    assert.equal(visible.score,100);
    controller.bind(f.roomId,f.playerId,'invalid');
    await assert.rejects(controller.refresh(),/FORBIDDEN/);
  } finally {model.close();}
});

test('late or superseded reads cannot replace the current connection', async () => {
  const model=openModel(':memory:',()=>2000);
  try {
    const a=model.createFixture(),b=model.createFixture();
    const pending=[];const visible=[];
    const controller=createRecoveryController((...args)=>new Promise(resolve=>pending.push(()=>resolve(model.readSnapshot(...args)))),s=>visible.push(s));
    controller.bind(a.roomId,a.playerId,a.secret);const old=controller.refresh();
    controller.bind(b.roomId,b.playerId,b.secret);const fresh=controller.refresh();
    pending[1]();assert.equal(await fresh,true);
    pending[0]();assert.equal(await old,false);
    assert.deepEqual(visible.map(s=>s.session_id),[b.roomId]);
  } finally {model.close();}
});

test('malformed and contradictory receipt data fails closed', () => {
  const model=openModel(':memory:',()=>2000);
  try {
    const f=model.createFixture();model.submit(f.roomId,f.playerId,f.secret,f.questionId,0);
    const snapshot=model.readSnapshot(f.roomId,f.playerId,f.secret);
    assert.throws(()=>validateSnapshot({...snapshot, session_id:'other'},f.roomId),/INVALID_SNAPSHOT/);
    assert.throws(()=>validateSnapshot({...snapshot,own_receipt:{...snapshot.own_receipt,is_correct:false}},f.roomId),/INVALID_RECEIPT/);
    assert.throws(()=>validateSnapshot({...snapshot,own_receipt:{...snapshot.own_receipt,accepted_choice:999}},f.roomId),/INVALID_RECEIPT/);
  } finally {model.close();}
});
