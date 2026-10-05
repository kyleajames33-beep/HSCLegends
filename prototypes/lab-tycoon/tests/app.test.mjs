import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {QUESTIONS} from '../src/content.mjs';
import {CHECKPOINT_KEY,decodeCheckpoint,economy} from '../src/model.mjs';
// Scripted DOM double: executes the generated application, not a browser render.
const html=await readFile(new URL('../lab-tycoon.html',import.meta.url),'utf8');
const script=html.match(/<script>([\s\S]*)<\/script>/)[1];
function fixture(initial=null,options={}){
 const data=new Map(initial?[[CHECKPOINT_KEY,initial]]:[]),els=new Map(),actions=[];
 const document={getElementById:id=>els.get(id)||null,documentElement:{classList:{toggle(){}}}};
 class El{constructor(attrs={}){this.attrs=attrs;this.dataset={};for(const [k,v]of Object.entries(attrs))if(k.startsWith('data-'))this.dataset[k.slice(5)]=v;this.listeners={};this.disabled='disabled'in attrs;this.open=false;}addEventListener(k,f){this.listeners[k]=f;}fire(k,e={}){return this.listeners[k]?.({target:this,currentTarget:this,preventDefault(){},...e});}setAttribute(k,v){this.attrs[k]=v;}focus(){document.activeElement=this;}showModal(){this.open=true;}close(){this.open=false;}contains(element){return actions.includes(element)||[...els.values()].includes(element);}querySelectorAll(){return actions;}querySelector(){return new El();}set innerHTML(v){this.html=v;els.clear();els.set('app',this);actions.length=0;for(const m of v.matchAll(/<(button|form|dialog|h2|p)\b([^>]*)>/g)){const attrs={};for(const a of m[2].matchAll(/([\w-]+)="([^"]*)"|\b(disabled)\b/g))attrs[a[1]||a[3]]=a[2]||'';const el=new El(attrs);if(attrs.id)els.set(attrs.id,el);if(attrs['data-action'])actions.push(el);}}get innerHTML(){return this.html;}}
 const app=new El();els.set('app',app);
 const window={localStorage:{getItem:k=>{if(options.readError)throw new Error('unavailable');return data.get(k)??null;},setItem:(k,v)=>{if(options.writeError)throw new Error('quota');data.set(k,v);}},addEventListener(){}};
 vm.runInNewContext(script,{document,window,structuredClone,console},{timeout:1000});
 const click=type=>{const el=actions.find(x=>x.dataset.action===type&&!x.disabled);assert.ok(el,`enabled ${type}`);el.fire('click');return el;};
 const answer=(choice,reason)=>{const form=els.get('answer-form');assert.ok(form);form.fire('change',{target:{name:'choice',value:String(choice)}});form.fire('change',{target:{name:'reason',value:String(reason)}});assert.equal(els.get('submit-answer').disabled,false);form.fire('submit');return form;};
 return {app,els,data,actions,click,answer};
}
test('self-contained artifact has a network-denying policy and valid JS',()=>{assert.match(html,/connect-src 'none'/);assert.doesNotMatch(html,/<script[^>]+src=|<link[^>]+href=|@import|\bfetch\(|XMLHttpRequest|WebSocket|sendBeacon|supabase|navigator\.serviceWorker/);assert.doesNotMatch(script,/^import /m);new vm.Script(script);});
test('initial UI labels scope and offline status with accessible control hooks',()=>{const f=fixture();assert.match(f.app.html,/OFFLINE PROTOTYPE \/ SAMPLE CONTENT/);assert.match(f.app.html,/Not a live classroom game/);assert.match(f.app.html,/Module 5/);assert.match(f.app.html,/Maximum 120 per run/);assert.match(f.app.html,/aria-labelledby="challenge-title"/);assert.equal(f.data.size,0);});
test('UI handlers complete learning loop and reject double answer and purchase',()=>{const f=fixture();f.click('START');assert.equal(f.els.get('submit-answer').disabled,true);const oldform=f.answer(0,1);assert.match(f.app.html,/Both parts correct/);assert.match(f.app.html,/answer 4 \+ reasoning 4/);oldform.fire('submit');f.click('REVIEW');const buy=f.click('BUY');buy.fire('click');const s=decodeCheckpoint(f.data.get(CHECKPOINT_KEY)).state;assert.equal(economy(s).earned,10);assert.equal(s.owned.length,1);f.click('NEXT');assert.match(f.app.html,/CHALLENGE 02/);});
test('UI retry has partial credit and cannot repeat',()=>{const f=fixture();f.click('START');f.answer(1,0);f.click('RETRY');f.answer(0,1);assert.match(f.app.html,/answer 2 \+ reasoning 2/);assert.equal(f.actions.some(x=>x.dataset.action==='RETRY'),false);f.click('REVIEW');assert.match(f.app.html,/Answer 2 \+ reasoning 2 \+ review 2/);});
test('full UI run reaches notebook with transparent total',()=>{const f=fixture();for(const q of QUESTIONS){f.click('START');f.answer(q.answer,q.reason);f.click('REVIEW');f.click('NEXT');}assert.match(f.app.html,/ALL 12 CHALLENGES REVIEWED/);assert.match(f.app.html,/120 unspent \+ 0 invested = 120 earned/);assert.doesNotMatch(f.app.html,/undefined|NaN/);});
test('reset requires confirmation, cancel preserves progress and undo restores',()=>{const f=fixture();f.click('START');f.answer(0,1);f.click('REVIEW');f.els.get('open-reset').fire('click');assert.equal(f.els.get('reset-dialog').open,true);f.els.get('cancel-reset').fire('click');assert.equal(economy(decodeCheckpoint(f.data.get(CHECKPOINT_KEY)).state).earned,10);f.els.get('open-reset').fire('click');f.els.get('confirm-reset').fire('click');assert.equal(economy(decodeCheckpoint(f.data.get(CHECKPOINT_KEY)).state).earned,0);f.els.get('undo-reset').fire('click');assert.equal(economy(decodeCheckpoint(f.data.get(CHECKPOINT_KEY)).state).earned,10);});
test('corrupt checkpoint is preserved during memory-only play',()=>{const f=fixture('{broken');f.click('START');f.answer(0,1);assert.equal(f.data.get(CHECKPOINT_KEY),'{broken');assert.match(f.app.html,/could not be read/);});
test('newer checkpoint is never silently overwritten by ordinary progress',()=>{const f=fixture();f.data.set(CHECKPOINT_KEY,'newer');f.click('START');assert.equal(f.data.get(CHECKPOINT_KEY),'newer');assert.match(f.app.html,/Another tab changed/);});

test('UI remains playable and discloses unavailable browser storage',()=>{const f=fixture(null,{readError:true});f.click('START');f.answer(0,1);f.click('REVIEW');assert.match(f.app.html,/storage is unavailable/);assert.match(f.app.html,/Answer 4 \+ reasoning 4 \+ review 2/);});
test('reset and undo never hide a storage write failure',()=>{const f=fixture(null,{writeError:true});f.click('START');f.answer(0,1);f.click('REVIEW');assert.match(f.app.html,/Local save failed/);f.els.get('open-reset').fire('click');f.els.get('confirm-reset').fire('click');assert.match(f.app.html,/Run reset in memory only/);f.els.get('undo-reset').fire('click');assert.match(f.app.html,/restored in memory only/);assert.match(f.app.html,/Answer 4 \+ reasoning 4 \+ review 2/);});

test('retained form changes during feedback are ignored without throwing',()=>{
 const f=fixture();f.click('START');const old=f.answer(0,1);const before=f.data.get(CHECKPOINT_KEY);
 assert.doesNotThrow(()=>{old.fire('change',{target:{name:'choice',value:'2'}});old.fire('change',{target:{name:'reason',value:'2'}});old.fire('submit');});
 assert.equal(f.data.get(CHECKPOINT_KEY),before);assert.match(f.app.html,/Both parts correct/);
});
test('retained prior-question form cannot select or submit the current question',()=>{
 const f=fixture();f.click('START');const old=f.answer(0,1);f.click('REVIEW');f.click('NEXT');f.click('START');
 const current=f.els.get('answer-form'), before=f.data.get(CHECKPOINT_KEY);
 old.fire('change',{target:{name:'choice',value:'2'}});old.fire('change',{target:{name:'reason',value:'2'}});
 assert.equal(f.els.get('submit-answer').disabled,true);current.fire('submit');old.fire('submit');
 assert.equal(f.data.get(CHECKPOINT_KEY),before);assert.equal(decodeCheckpoint(before).state.records[1].attempts.length,0);
 current.fire('change',{target:{name:'choice',value:'0'}});current.fire('change',{target:{name:'reason',value:'0'}});
 old.fire('change',{target:{name:'choice',value:'2'}});old.fire('change',{target:{name:'reason',value:'2'}});current.fire('submit');
 const receipt=decodeCheckpoint(f.data.get(CHECKPOINT_KEY)).state.records[1].attempts[0];assert.deepEqual(receipt,{choice:0,reason:0});
});
test('retained pre-retry form cannot populate a fresh retry form',()=>{
 const f=fixture();f.click('START');const old=f.answer(1,0);f.click('RETRY');const current=f.els.get('answer-form');
 old.fire('change',{target:{name:'choice',value:'0'}});old.fire('change',{target:{name:'reason',value:'1'}});current.fire('submit');
 assert.equal(f.els.get('submit-answer').disabled,true);assert.equal(decodeCheckpoint(f.data.get(CHECKPOINT_KEY)).state.records[0].attempts.length,1);
 f.answer(0,1);assert.match(f.app.html,/answer 2 \+ reasoning 2/);
});
test('retained undo cannot restore a later reset backup',()=>{
 const f=fixture();const reset=()=>{f.els.get('open-reset').fire('click');f.els.get('confirm-reset').fire('click');};
 f.click('START');f.answer(0,1);f.click('REVIEW');reset();
 const oldUndo=f.els.get('undo-reset');oldUndo.fire('click');f.click('NEXT');f.click('START');f.answer(2,2);f.click('REVIEW');reset();
 const currentUndo=f.els.get('undo-reset'),before=f.data.get(CHECKPOINT_KEY);oldUndo.fire('click');
 assert.equal(f.data.get(CHECKPOINT_KEY),before);assert.equal(economy(decodeCheckpoint(before).state).earned,0);
 currentUndo.fire('click');assert.equal(economy(decodeCheckpoint(f.data.get(CHECKPOINT_KEY)).state).earned,20);
});
test('retained reset confirmation cannot act on a newer dialog',()=>{
 const f=fixture();const old=f.els.get('confirm-reset');f.click('START');f.answer(0,1);f.click('REVIEW');
 f.els.get('open-reset').fire('click');const before=f.data.get(CHECKPOINT_KEY);old.fire('click');
 assert.equal(f.data.get(CHECKPOINT_KEY),before);assert.equal(f.els.get('reset-dialog').open,true);
 f.els.get('confirm-reset').fire('click');assert.equal(economy(decodeCheckpoint(f.data.get(CHECKPOINT_KEY)).state).earned,0);
});
test('unsafe imported base counter is rejected and never overwritten by ordinary UI progress',()=>{
 const raw=JSON.stringify({version:1,contentRevision:'equilibrium-sample-2026-10-04-v1',baseRevision:Number.MAX_SAFE_INTEGER,events:[]});
 const f=fixture(raw);assert.match(f.app.html,/could not be read/);f.click('START');f.answer(0,1);f.click('REVIEW');
 assert.equal(f.data.get(CHECKPOINT_KEY),raw);assert.match(f.app.html,/Answer 4 \+ reasoning 4 \+ review 2/);
});
