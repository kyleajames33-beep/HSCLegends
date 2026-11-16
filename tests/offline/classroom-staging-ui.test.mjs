import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSourceModule, pageHarness, elements, memoryStorage, textContent } from '../support/source-harness.mjs';

const actor='00000000-0000-4000-8000-000000000001', room='00000000-0000-4000-8000-000000000002', player='00000000-0000-4000-8000-000000000003', question='00000000-0000-4000-8000-000000000004', code='00000000-0000-4000-8000-000000000005';
const config={url:'https://abcdefghijklmnopqrst.supabase.co',publicKey:'public-test',projectRef:'abcdefghijklmnopqrst'};
const button=(tree,label)=>elements(tree).find(e=>e.type==='button'&&e.props.children===label);
const inputs=tree=>elements(tree).filter(e=>e.type==='input');
const flush=()=>new Promise(resolve=>setImmediate(resolve));

test('staging guest joins, submits and refreshes an authoritative receipt; auth change disposes the room',async()=>{
  let identity={status:'ready',actorId:actor,generation:1,isAnonymous:true}, listener, disposed=0, submitted=0, joins=0, joinedCode, bound, saved=0, cleared=0, recoveries=0, refreshPending;
  const snapshot={roomId:room,version:1,state:'active',serverNow:'2026-01-01T00:00:00Z',score:0,receipt:null,questionTotal:2,question:{id:question,index:0,stem:'Synthetic question',options:['A','B'],contentRevision:'test',opensAt:'2026-01-01T00:00:00Z',closesAt:'2026-01-01T00:00:30Z'}};
  const client={join:async value=>{joins++;joinedCode=value;return {roomId:room,playerId:player,state:'active'};},bindStudent:(r,p)=>{bound=[r,p];},snapshot:async()=>structuredClone(snapshot),answer:async()=>{submitted++;snapshot.receipt={correct:true,points:100};snapshot.explanation='Because it is.';return snapshot.receipt;},dispose:()=>{disposed++;}};
  const scheduler={sessionStorage:memoryStorage(),location:{origin:'https://game.example',search:`?join=${code}`},crypto:{randomUUID:()=>code},performance:{now:()=>0},setInterval:()=>0,clearInterval:()=>{},setTimeout:()=>0,clearTimeout:()=>{}};
  const gate={subscribe(fn){listener=fn;return()=>{};},getSnapshot:()=>identity,start(){listener();},dispose(){},signIn:async()=> 'requested'};
  const page=pageHarness('components/classroom-staging.tsx',null,undefined,undefined,{props:{config},scheduler,dependencies:{
    '@supabase/supabase-js':{createClient:()=>({auth:{},rpc:()=>{throw Error('unexpected RPC');}})},
    '@/lib/classroom-v2':{initializeClassroomV2:async()=>({status:'available',client}),prepareCreateRequest:()=>({})},
    '@/lib/classroom-v2/guest-auth':{createStagingGuestAuth:()=>gate},
    '@/lib/classroom-v2/guest-recovery':{saveGuestRecovery:()=>{saved++;return true;},clearGuestRecovery:()=>{cleared++;return true;},recoverGuestSession:async()=>{recoveries++;return {status:'recovered',client,snapshot:structuredClone(snapshot)};}},
    '@/lib/classroom-v2/host-recovery':{readHostRecovery:()=>null,saveHostRecovery:()=>true},
    '@/lib/classroom-v2/teacher-drafts.mjs':{prepareTeacherDraftRequest:()=>{throw Error('unexpected draft');}},
    '@/lib/solo-arena-recovery':{ARENA_DRAFT_KEY:'teacher-draft'},
    '@/lib/classroom-v2/clock':{makeServerClock:()=>null,estimatedSecondsRemaining:()=>null},
    '@/lib/classroom-v2/polling':{createSnapshotPoller:({read,onSnapshot})=>({start(){void read().then(onSnapshot);},refresh(){refreshPending=()=>void read().then(onSnapshot);},dispose(){}})},
  }});
  try {
    let tree=await page.render();assert.equal(button(tree,'Create sample room'),undefined);
    const fields=inputs(tree);assert.equal(fields[0].props.value,code);fields[0].props.onChange({target:{value:'invalid'}});fields[1].props.onChange({target:{value:'Student'}});
    tree=await page.render();button(tree,'Join room').props.onClick();await flush();tree=await page.render();assert.equal(joins,0);assert.match(textContent(tree),/Enter a valid game code/);
    inputs(tree)[0].props.onChange({target:{value:`https://game.example/classroom-staging?join=${code}`}});
    tree=await page.render();const oldJoin=button(tree,'Join room').props.onClick;oldJoin();await flush();tree=await page.render();assert.equal(joinedCode,code);
    assert.deepEqual(bound,[room,player]);assert.equal(saved,1);assert.match(textContent(tree),/Question 1 of 2/);
    oldJoin();await flush();assert.equal(joins,1);
    const oldAnswer=button(tree,'A').props.onClick;oldAnswer();await flush();tree=await page.render();assert.equal(submitted,1);assert.equal(button(tree,'A').props.disabled,true);
    oldAnswer();await flush();assert.equal(submitted,1);refreshPending();await flush();tree=await page.render();assert.equal(button(tree,'A').props.disabled,true);assert.match(textContent(tree),/Explanation: Because it is/);
    oldAnswer();await flush();assert.equal(submitted,1);
    snapshot.state='complete';snapshot.finalRank=1;snapshot.review=[{id:question,index:0,stem:'Synthetic question',options:['A','B'],choice:1,correctIndex:0,correct:false,points:0,explanation:'Because it is.'}];button(tree,'Refresh').props.onClick();refreshPending();await flush();tree=await page.render();assert.match(textContent(tree),/Final place: 1/);assert.match(textContent(tree),/Your answer: B/);assert.match(textContent(tree),/Correct answer: A/);
    identity={status:'checking',actorId:null,generation:2,isAnonymous:null};listener();await page.render();
    identity={status:'ready',actorId:actor,generation:3,isAnonymous:true};listener();await flush();tree=await page.render();
    assert.equal(recoveries,1);assert.match(textContent(tree),/Final place: 1/);assert.match(textContent(tree),/Your answer: B/);
    snapshot.question=null;snapshot.finalRank=null;snapshot.review=[];button(tree,'Refresh').props.onClick();refreshPending();await flush();tree=await page.render();
    assert.match(textContent(tree),/ended the lobby before the game started/);assert.doesNotMatch(textContent(tree),/Final place/);
    button(tree,'Leave room on this device').props.onClick();tree=await page.render();
    assert.equal(cleared,1);assert.match(textContent(tree),/server game was not ended/);
    oldAnswer();await flush();assert.equal(submitted,1);
    oldJoin();await flush();tree=await page.render();assert.match(textContent(tree),/ended the lobby before the game started/);
    identity={status:'checking',actorId:null,generation:4,isAnonymous:null};listener();await page.render();
    identity={status:'ready',actorId:'00000000-0000-4000-8000-000000000099',generation:5,isAnonymous:true};listener();await flush();tree=await page.render();
    assert.equal(recoveries,1);assert.doesNotMatch(textContent(tree),/ended the lobby before the game started/);
    identity={status:'signed-out',actorId:null,generation:6,isAnonymous:null};listener();tree=await page.render();
    assert.ok(disposed>0);assert.equal(button(tree,'A'),undefined);
  } finally {page.unmount();}
});

test('host retries an unconfirmed creation with the same request and starts the confirmed room',async()=>{
  let identity={status:'ready',actorId:actor,generation:1,isAnonymous:false};let listener, attempts=0, requests=[], started=0, copied='', clipboardDenied=true, exportedBlob, filename='';
  const snap={roomId:room,version:0,state:'lobby',questionIndex:null,questionTotal:2,stem:null,options:null,opensAt:null,closesAt:null,serverNow:'2026-01-01T00:00:00Z',answered:0,players:[]};
  const client={createRoom:async request=>{requests.push(request);if(++attempts===1)throw Error('uncertain');return {roomId:room,joinCode:code,version:0};},hostSnapshot:async()=>snap,start:async(r,v)=>{assert.equal(r,room);assert.equal(v,0);started++;return true;},dispose(){}};
  const scheduler={sessionStorage:memoryStorage(),location:{origin:'https://game.example',search:''},navigator:{clipboard:{writeText:async value=>{if(clipboardDenied)throw Error('denied');copied=value;}}},crypto:{randomUUID:()=>code},performance:{now:()=>0},setInterval:()=>0,clearInterval:()=>{},setTimeout:()=>0,clearTimeout:()=>{}};
  const gate={subscribe(fn){listener=fn;return()=>{};},getSnapshot:()=>identity,start(){listener();},dispose(){},signIn:async()=> 'requested'};
  class TestUrl extends URL {static createObjectURL(blob){exportedBlob=blob;return 'blob:report';}static revokeObjectURL(){}}
  const document={createElement:()=>({click(){filename=this.download;}})};
  const page=pageHarness('components/classroom-staging.tsx',null,undefined,undefined,{props:{config},scheduler,document,URL:TestUrl,dependencies:{
    '@supabase/supabase-js':{createClient:()=>({auth:{},rpc:()=>{throw Error('unexpected RPC');}})},
    '@/lib/classroom-v2':{initializeClassroomV2:async()=>({status:'available',client}),prepareCreateRequest:(requestId,questions,seconds)=>({requestId,seconds})},
    '@/lib/classroom-v2/guest-auth':{createStagingGuestAuth:()=>gate},
    '@/lib/classroom-v2/guest-recovery':{saveGuestRecovery:()=>true,recoverGuestSession:async()=>({status:'missing'})},
    '@/lib/classroom-v2/host-recovery':{readHostRecovery:()=>null,saveHostRecovery:()=>false},
    '@/lib/classroom-v2/teacher-drafts.mjs':{prepareTeacherDraftRequest:()=>{throw Error('unexpected draft');}},
    '@/lib/solo-arena-recovery':{ARENA_DRAFT_KEY:'teacher-draft'},
    '@/lib/classroom-v2/clock':{makeServerClock:()=>null,estimatedSecondsRemaining:()=>null},
    '@/lib/classroom-v2/polling':{createSnapshotPoller:({read,onSnapshot})=>({start(){void read().then(onSnapshot);},refresh(){void read().then(onSnapshot);},dispose(){}})},
  }});
  try {
    let tree=await page.render();const timerSelect=elements(tree).find(e=>e.type==='select');timerSelect.props.onChange({target:{value:'60'}});tree=await page.render();button(tree,'Create sample room').props.onClick();await flush();tree=await page.render();
    identity={status:'checking',actorId:null,generation:2,isAnonymous:null};listener();await page.render();
    identity={status:'ready',actorId:actor,generation:3,isAnonymous:false};listener();tree=await page.render();
    timerSelect.props.onChange({target:{value:'15'}});tree=await page.render();assert.equal(elements(tree).find(e=>e.type==='select').props.value,60);assert.equal(elements(tree).find(e=>e.type==='select').props.disabled,true);
    button(tree,'Create sample room').props.onClick();await flush();tree=await page.render();
    assert.equal(attempts,2);assert.equal(requests[0],requests[1]);assert.equal(requests[0].seconds,60);assert.match(textContent(tree),/could not save a room shortcut/);
    button(tree,'Copy join link').props.onClick();await flush();tree=await page.render();assert.match(textContent(tree),/Could not copy the link/);
    clipboardDenied=false;button(tree,'Copy join link').props.onClick();await flush();assert.equal(copied,`https://game.example/classroom-staging?join=${code}`);
    tree=await page.render();assert.equal(button(tree,'Start').props.disabled,true);button(tree,'Start').props.onClick();await flush();assert.equal(started,0);
    snap.players=[{alias:'Student',score:0},{alias:'Student 2',score:0}];tree=await page.render();button(tree,'Refresh').props.onClick();await flush();tree=await page.render();assert.equal(button(tree,'Start').props.disabled,false);
    button(tree,'Start').props.onClick();await flush();assert.equal(started,1);
    snap.state='complete';snap.questionReport=[{index:0,stem:'First',opened:true,responses:2,correct:1},{index:1,stem:'Second',opened:false,responses:0,correct:0}];
    tree=await page.render();button(tree,'Refresh').props.onClick();await flush();tree=await page.render();
    assert.match(textContent(tree),/1 correct from 2 submitted/);assert.match(textContent(tree),/Second — not played/);
    button(tree,'Download question results').props.onClick();assert.equal(filename,'classroom-question-results.csv');assert.match(await exportedBlob.text(),/"First","yes","2","1"/);
  } finally {page.unmount();}
});

test('teacher draft hosting is explicit, rejects a missing draft and preserves the prepared request',async()=>{
  const identity={status:'ready',actorId:actor,generation:1,isAnonymous:false};let listener, sent=[], mapped=[];
  const storage=memoryStorage();
  const client={createRoom:async request=>{sent.push(request);return {roomId:room,joinCode:code,version:0};},hostSnapshot:async()=>null,dispose(){}};
  const scheduler={sessionStorage:storage,crypto:{randomUUID:()=>code},performance:{now:()=>0},setInterval:()=>0,clearInterval:()=>{},setTimeout:()=>0,clearTimeout:()=>{}};
  const gate={subscribe(fn){listener=fn;return()=>{};},getSnapshot:()=>identity,start(){listener();},dispose(){},signIn:async()=> 'requested'};
  const page=pageHarness('components/classroom-staging.tsx',null,undefined,undefined,{props:{config},scheduler,dependencies:{
    '@supabase/supabase-js':{createClient:()=>({auth:{},rpc:()=>{throw Error('unexpected RPC');}})},
    '@/lib/classroom-v2':{initializeClassroomV2:async()=>({status:'available',client}),prepareCreateRequest:()=>{throw Error('must not silently use sample');}},
    '@/lib/classroom-v2/guest-auth':{createStagingGuestAuth:()=>gate},
    '@/lib/classroom-v2/guest-recovery':{saveGuestRecovery:()=>true,recoverGuestSession:async()=>({status:'missing'})},
    '@/lib/classroom-v2/host-recovery':{readHostRecovery:()=>null,saveHostRecovery:()=>true},
    '@/lib/classroom-v2/teacher-drafts.mjs':{prepareTeacherDraftRequest:(raw,id,seconds,revision)=>{mapped.push({raw,id,seconds,revision});return {requestId:id,questions:[{teacher_draft:{source:'Teacher',reviewStatus:'unreviewed'}}]};}},
    '@/lib/solo-arena-recovery':{ARENA_DRAFT_KEY:'teacher-draft'},
    '@/lib/classroom-v2/clock':{makeServerClock:()=>null,estimatedSecondsRemaining:()=>null},
    '@/lib/classroom-v2/polling':{createSnapshotPoller:()=>({start(){},refresh(){},dispose(){}})},
  }});
  try {
    let tree=await page.render();elements(tree).find(e=>e.type==='select').props.onChange({target:{value:'45'}});tree=await page.render();button(tree,'Host teacher draft from this tab').props.onClick();await flush();tree=await page.render();assert.equal(sent.length,0);
    storage.setItem('teacher-draft','valid draft');button(tree,'Host teacher draft from this tab').props.onClick();await flush();await page.render();
    assert.equal(mapped[0].raw,'valid draft');assert.equal(mapped[0].seconds,45);assert.equal(mapped[0].revision,'unreviewed-teacher-draft-v1');assert.equal(sent[0].questions[0].teacher_draft.reviewStatus,'unreviewed');
  } finally {page.unmount();}
});

test('host resume uses the server join code instead of the saved shortcut',async()=>{
  const identity={status:'ready',actorId:actor,generation:1,isAnonymous:false}, savedCode='00000000-0000-4000-8000-000000000099';let listener,copied='';
  const snapshot={roomId:room,version:0,state:'lobby',questionIndex:null,questionTotal:2,stem:null,options:null,opensAt:null,closesAt:null,serverNow:'2026-01-01T00:00:00Z',answered:0,players:[],joinCode:code};
  const client={hostSnapshot:async()=>snapshot,finish:async(id,version)=>{assert.equal(id,room);assert.equal(version,0);snapshot.state='complete';snapshot.questionReport=[{index:0,stem:'First',opened:false,responses:0,correct:0},{index:1,stem:'Second',opened:false,responses:0,correct:0}];return true;},dispose(){}};
  const scheduler={sessionStorage:memoryStorage(),location:{origin:'https://game.example',search:''},navigator:{clipboard:{writeText:async value=>{copied=value;}}},performance:{now:()=>0},setInterval:()=>0,clearInterval:()=>{},setTimeout:()=>0,clearTimeout:()=>{}};
  const gate={subscribe(fn){listener=fn;return()=>{};},getSnapshot:()=>identity,start(){listener();},dispose(){}};
  const page=pageHarness('components/classroom-staging.tsx',null,undefined,undefined,{props:{config},scheduler,dependencies:{
    '@supabase/supabase-js':{createClient:()=>({auth:{},rpc:()=>{throw Error('unexpected RPC');}})},
    '@/lib/classroom-v2':{initializeClassroomV2:async()=>({status:'available',client}),prepareCreateRequest:()=>({})},
    '@/lib/classroom-v2/guest-auth':{createStagingGuestAuth:()=>gate},
    '@/lib/classroom-v2/guest-recovery':{saveGuestRecovery:()=>true,recoverGuestSession:async()=>({status:'missing'})},
    '@/lib/classroom-v2/host-recovery':{readHostRecovery:()=>({roomId:room,joinCode:savedCode}),saveHostRecovery:()=>true},
    '@/lib/classroom-v2/teacher-drafts.mjs':{prepareTeacherDraftRequest:()=>({})},
    '@/lib/solo-arena-recovery':{ARENA_DRAFT_KEY:'teacher-draft'},
    '@/lib/classroom-v2/clock':{makeServerClock:()=>null,estimatedSecondsRemaining:()=>null},
    '@/lib/classroom-v2/polling':{createSnapshotPoller:({read,onSnapshot})=>({start(){void read().then(onSnapshot);},refresh(){void read().then(onSnapshot);},dispose(){}})},
  }});
  try {
    let tree=await page.render();button(tree,'Resume previous hosted game').props.onClick();await flush();tree=await page.render();
    assert.match(textContent(tree),new RegExp(code));assert.doesNotMatch(textContent(tree),new RegExp(savedCode));
    button(tree,'Copy join link').props.onClick();await flush();assert.equal(copied,`https://game.example/classroom-staging?join=${code}`);
    button(tree,'End lobby').props.onClick();await flush();tree=await page.render();assert.match(textContent(tree),/First — not played/);
  } finally {page.unmount();}
});

test('blocked browser storage keeps staging auth usable but warns that refresh loses the session',async()=>{
  let listener, suppliedStorage;
  const scheduler={crypto:{randomUUID:()=>code},performance:{now:()=>0},setInterval:()=>0,clearInterval:()=>{},setTimeout:()=>0,clearTimeout:()=>{}};
  Object.defineProperty(scheduler,'sessionStorage',{get(){throw Error('blocked');}});
  const gate={subscribe(fn){listener=fn;return()=>{};},getSnapshot:()=>({status:'signed-out',actorId:null,generation:1,isAnonymous:null}),start(){listener();},dispose(){}};
  const page=pageHarness('components/classroom-staging.tsx',null,undefined,undefined,{props:{config},scheduler,dependencies:{
    '@supabase/supabase-js':{createClient:(url,key,options)=>{suppliedStorage=options.auth.storage;return {auth:{}};}},
    '@/lib/classroom-v2':{initializeClassroomV2:async()=>({status:'disabled'}),prepareCreateRequest:()=>({})},
    '@/lib/classroom-v2/guest-auth':{createStagingGuestAuth:()=>gate},
    '@/lib/classroom-v2/guest-recovery':{saveGuestRecovery:()=>false,recoverGuestSession:async()=>({status:'missing'})},
    '@/lib/classroom-v2/host-recovery':{readHostRecovery:()=>null,saveHostRecovery:()=>false},
    '@/lib/classroom-v2/teacher-drafts.mjs':{prepareTeacherDraftRequest:()=>({})},
    '@/lib/solo-arena-recovery':{ARENA_DRAFT_KEY:'teacher-draft'},
    '@/lib/classroom-v2/clock':{makeServerClock:()=>null,estimatedSecondsRemaining:()=>null},
    '@/lib/classroom-v2/polling':{createSnapshotPoller:()=>({start(){},refresh(){},dispose(){}})},
  }});
  try {
    let tree=await page.render();await flush();tree=await page.render();
    assert.match(textContent(tree),/sign-in is temporary/);assert.ok(button(tree,'Join as a test guest'));
    suppliedStorage.setItem('test','synthetic');assert.equal(suppliedStorage.getItem('test'),'synthetic');
  } finally {page.unmount();}
});

test('an in-flight host create keeps its request for the same actor but never transfers it to another',async()=>{
  for(const change of ['same','different']){
    let identity={status:'ready',actorId:actor,generation:1,isAnonymous:false},listener,finishFirst,requests=[];
    const held=new Promise(resolve=>{finishFirst=resolve;});
    const snap={roomId:room,version:0,state:'lobby',questionIndex:null,questionTotal:1,stem:null,options:null,opensAt:null,closesAt:null,serverNow:'2026-01-01T00:00:00Z',answered:0,players:[]};
    const client={createRoom:async request=>{requests.push(request);return requests.length===1?held:{roomId:room,joinCode:code,version:0};},hostSnapshot:async()=>snap,dispose(){}};
    const scheduler={sessionStorage:memoryStorage(),crypto:{randomUUID:()=>code},performance:{now:()=>0},setInterval:()=>0,clearInterval:()=>{},setTimeout:()=>0,clearTimeout:()=>{}};
    const gate={subscribe(fn){listener=fn;return()=>{};},getSnapshot:()=>identity,start(){listener();},dispose(){}};
    const page=pageHarness('components/classroom-staging.tsx',null,undefined,undefined,{props:{config},scheduler,dependencies:{
      '@supabase/supabase-js':{createClient:()=>({auth:{},rpc:()=>{throw Error('unexpected RPC');}})},
      '@/lib/classroom-v2':{initializeClassroomV2:async()=>({status:'available',client}),prepareCreateRequest:(requestId,questions,seconds)=>({requestId,seconds})},
      '@/lib/classroom-v2/guest-auth':{createStagingGuestAuth:()=>gate},
      '@/lib/classroom-v2/guest-recovery':{saveGuestRecovery:()=>true,recoverGuestSession:async()=>({status:'missing'})},
      '@/lib/classroom-v2/host-recovery':{readHostRecovery:()=>null,saveHostRecovery:()=>true},
      '@/lib/classroom-v2/teacher-drafts.mjs':{prepareTeacherDraftRequest:()=>({})},
      '@/lib/solo-arena-recovery':{ARENA_DRAFT_KEY:'teacher-draft'},
      '@/lib/classroom-v2/clock':{makeServerClock:()=>null,estimatedSecondsRemaining:()=>null},
      '@/lib/classroom-v2/polling':{createSnapshotPoller:({read,onSnapshot})=>({start(){void read().then(onSnapshot);},refresh(){},dispose(){}})},
    }});
    try {
      let tree=await page.render();button(tree,'Create sample room').props.onClick();await flush();assert.equal(requests.length,1);
      identity={status:'checking',actorId:null,generation:2,isAnonymous:null};listener();await page.render();
      identity={status:'ready',actorId:change==='same'?actor:'00000000-0000-4000-8000-000000000099',generation:3,isAnonymous:false};listener();tree=await page.render();
      button(tree,'Create sample room').props.onClick();await flush();tree=await page.render();
      assert.equal(requests.length,2);if(change==='same')assert.equal(requests[0],requests[1]);else assert.notEqual(requests[0],requests[1]);
      finishFirst({roomId:'00000000-0000-4000-8000-000000000077',joinCode:code,version:0});await flush();tree=await page.render();
      assert.match(textContent(tree),/Join code/);assert.doesNotMatch(textContent(tree),/00000000-0000-4000-8000-000000000077/);
    } finally {page.unmount();}
  }
});

test('temporary storage can reconnect within the page after the same actor is reverified',async()=>{
  let identity={status:'ready',actorId:actor,generation:1,isAnonymous:true},listener,bindings=0;
  const snapshot={roomId:room,version:1,state:'active',serverNow:'2026-01-01T00:00:00Z',score:0,receipt:null,questionTotal:1,question:{id:question,index:0,stem:'Synthetic question',options:['A','B'],contentRevision:'test',opensAt:'2026-01-01T00:00:00Z',closesAt:'2026-01-01T00:00:30Z'}};
  const client={join:async()=>({roomId:room,playerId:player,state:'active'}),bindStudent:()=>{bindings++;},snapshot:async()=>structuredClone(snapshot),dispose(){}};
  const scheduler={location:{origin:'https://game.example',search:''},crypto:{randomUUID:()=>code},performance:{now:()=>0},setInterval:()=>0,clearInterval:()=>{},setTimeout:()=>0,clearTimeout:()=>{}};
  Object.defineProperty(scheduler,'sessionStorage',{get(){throw Error('blocked');}});
  const gate={subscribe(fn){listener=fn;return()=>{};},getSnapshot:()=>identity,start(){listener();},dispose(){}};
  const page=pageHarness('components/classroom-staging.tsx',null,undefined,undefined,{props:{config},scheduler,dependencies:{
    '@supabase/supabase-js':{createClient:()=>({auth:{},rpc:()=>{throw Error('unexpected RPC');}})},
    '@/lib/classroom-v2':{initializeClassroomV2:async()=>({status:'available',client}),prepareCreateRequest:()=>({})},
    '@/lib/classroom-v2/guest-auth':{createStagingGuestAuth:()=>gate},
    '@/lib/classroom-v2/guest-recovery':loadSourceModule('lib/classroom-v2/guest-recovery.ts'),
    '@/lib/classroom-v2/host-recovery':{readHostRecovery:()=>null,saveHostRecovery:()=>true},
    '@/lib/classroom-v2/teacher-drafts.mjs':{prepareTeacherDraftRequest:()=>({})},
    '@/lib/solo-arena-recovery':{ARENA_DRAFT_KEY:'teacher-draft'},
    '@/lib/classroom-v2/clock':{makeServerClock:()=>null,estimatedSecondsRemaining:()=>null},
    '@/lib/classroom-v2/polling':{createSnapshotPoller:({read,onSnapshot})=>({start(){void read().then(onSnapshot);},refresh(){},dispose(){}})},
  }});
  try {
    let tree=await page.render();const fields=inputs(tree);fields[0].props.onChange({target:{value:code}});fields[1].props.onChange({target:{value:'Student'}});
    tree=await page.render();button(tree,'Join room').props.onClick();await flush();tree=await page.render();assert.match(textContent(tree),/Synthetic question/);assert.equal(bindings,1);
    identity={status:'checking',actorId:null,generation:2,isAnonymous:null};listener();await page.render();
    identity={status:'ready',actorId:actor,generation:3,isAnonymous:true};listener();await flush();tree=await page.render();
    assert.equal(bindings,2);assert.match(textContent(tree),/Synthetic question/);assert.match(textContent(tree),/sign-in is temporary/);
  } finally {page.unmount();}
});

test('a server-rejected late answer tells the student time is up and refreshes state',async()=>{
  let listener,refreshes=0;
  const identity={status:'ready',actorId:actor,generation:1,isAnonymous:true};
  const snapshot={roomId:room,version:1,state:'active',serverNow:'2026-01-01T00:00:00Z',score:0,receipt:null,questionTotal:1,question:{id:question,index:0,stem:'Synthetic question',options:['A','B'],contentRevision:'test',opensAt:'2026-01-01T00:00:00Z',closesAt:'2026-01-01T00:00:30Z'}};
  const client={join:async()=>({roomId:room,playerId:player,state:'active'}),bindStudent(){},snapshot:async()=>structuredClone(snapshot),answer:async()=>{throw Error('OUTSIDE_WINDOW');},dispose(){}};
  const scheduler={sessionStorage:memoryStorage(),location:{origin:'https://game.example',search:''},crypto:{randomUUID:()=>code},performance:{now:()=>0},setInterval:()=>0,clearInterval:()=>{},setTimeout:()=>0,clearTimeout:()=>{}};
  const gate={subscribe(fn){listener=fn;return()=>{};},getSnapshot:()=>identity,start(){listener();},dispose(){}};
  const page=pageHarness('components/classroom-staging.tsx',null,undefined,undefined,{props:{config},scheduler,dependencies:{
    '@supabase/supabase-js':{createClient:()=>({auth:{},rpc:()=>{throw Error('unexpected RPC');}})},
    '@/lib/classroom-v2':{initializeClassroomV2:async()=>({status:'available',client}),prepareCreateRequest:()=>({})},
    '@/lib/classroom-v2/guest-auth':{createStagingGuestAuth:()=>gate},
    '@/lib/classroom-v2/guest-recovery':{saveGuestRecovery:()=>true,recoverGuestSession:async()=>({status:'missing'})},
    '@/lib/classroom-v2/host-recovery':{readHostRecovery:()=>null,saveHostRecovery:()=>true},
    '@/lib/classroom-v2/teacher-drafts.mjs':{prepareTeacherDraftRequest:()=>({})},
    '@/lib/solo-arena-recovery':{ARENA_DRAFT_KEY:'teacher-draft'},
    '@/lib/classroom-v2/clock':{makeServerClock:()=>null,estimatedSecondsRemaining:()=>null},
    '@/lib/classroom-v2/polling':{createSnapshotPoller:({read,onSnapshot})=>({start(){void read().then(onSnapshot);},refresh(){refreshes++;},dispose(){}})},
  }});
  try {
    let tree=await page.render();const fields=inputs(tree);fields[0].props.onChange({target:{value:code}});fields[1].props.onChange({target:{value:'Student'}});
    tree=await page.render();button(tree,'Join room').props.onClick();await flush();tree=await page.render();button(tree,'A').props.onClick();await flush();tree=await page.render();
    assert.match(textContent(tree),/Time is up; the server did not accept this answer/);assert.equal(refreshes,1);assert.equal(button(tree,'A').props.disabled,true);
  } finally {page.unmount();}
});
