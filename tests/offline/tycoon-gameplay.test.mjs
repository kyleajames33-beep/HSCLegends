import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadSourceModule, elements, textContent } from '../support/source-harness.mjs';

// Runs the actual page handlers with deterministic hook, clock and transport
// doubles. This checks ownership/timing logic, not browser rendering or RPCs.
function setup({ signedIn = false, configured = true, credit = () => Promise.resolve({ data: null, error: null }) } = {}) {
  const slots=[]; let cursor=0, dirty=false, effects=[], now=0, nextTimer=0;
  const timers=new Map();
  const same=(a,b)=>a && b && a.length===b.length && a.every((v,i)=>Object.is(v,b[i]));
  const react={
    useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return [slots[i], value=>{const n=typeof value==='function'?value(slots[i]):value;if(!Object.is(n,slots[i])){slots[i]=n;dirty=true;}}]},
    useRef(initial){const i=cursor++;if(!(i in slots))slots[i]={current:initial};return slots[i]},
    useMemo(factory,deps){const i=cursor++;if(!slots[i]||!same(slots[i].deps,deps))slots[i]={deps,value:factory()};return slots[i].value},
    useEffect(fn,deps){const i=cursor++;if(!slots[i]||!same(slots[i].deps,deps))effects.push(()=>{slots[i]?.cleanup?.();slots[i]={deps,cleanup:fn()}})},
  };
  const questions=[{id:'q1',subject:'chemistry',topic:'First',stem:'First question?',options:['A','B'],correct_index:0,explanation:'First explanation'}, {id:'q2',subject:'chemistry',topic:'Second',stem:'Second question?',options:['A','B'],correct_index:0,explanation:'Second explanation'}];
  const requests=[];
  const getQuizQuestions=()=>new Promise((resolve,reject)=>requests.push({resolve,reject}));
  const window={setInterval(fn){const id=++nextTimer;timers.set(id,fn);return id},clearInterval(id){timers.delete(id)}};
  const globals={window,process:{env:configured?{NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:54321',NEXT_PUBLIC_SUPABASE_ANON_KEY:'local-test-key'}:{}},performance:{now:()=>now},localStorage:{getItem:()=>null,setItem:()=>{}},...window};
  const deps={react,'react/jsx-runtime':{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props}),Fragment:'fragment'},'next/link':{default:'a'},'@/lib/supabase/client':{createClient:()=>({rpc:(name)=>name==='credit_coins'?credit():Promise.resolve({data:null,error:null})})},'@/lib/use-user':{useUser:()=>({user:signedIn?{id:'synthetic-user'}:null,loading:false})},'@/lib/questions':{getQuizQuestions,SUBJECTS:[{id:'chemistry',label:'Chemistry'}]},'@/components/answer-tile':{default:'AnswerTile'},'@/components/math-text':{default:({text})=>text},'@/components/count-up':{default:({to,prefix=''})=>`${prefix}${to}`},'@/lib/confetti':{celebrate:()=>{}}};
  deps['@/lib/use-sparks-award']=loadSourceModule('lib/use-sparks-award.ts', { react }, globals);
  const Wrapper=loadSourceModule('app/tycoon/page.tsx',deps,globals).default;
  const Page=configured ? Wrapper().type : Wrapper;
  async function render(){let tree;for(let i=0;i<10;i++){cursor=0;dirty=false;tree=Page();const todo=effects;effects=[];for(const f of todo)f();await Promise.resolve();await Promise.resolve();if(!dirty)return tree;}throw Error('Render did not settle')}
  function button(tree,text){const b=elements(tree).find(e=>e.type==='button' && textContent(e).includes(text));assert.ok(b,`Missing button ${text}`);return b}
  function answer(tree){const a=elements(tree).find(e=>e.type==='AnswerTile' && e.props.index===0);assert.ok(a,'Missing answer tile');return a}
  function tick(ms){now+=ms;for(const f of [...timers.values()])f()}
  async function start(){let tree=await render();const p=button(tree,'Y12').props.onClick();assert.equal(requests.length,1);requests.shift().resolve(questions);await p;return render()}
  return {render,button,answer,tick,start,requests,questions};
}

test('Tycoon offers its sample when the connected question bank is not configured', async()=>{
  const h = setup({ configured: false });
  const tree = await h.render();
  assert.match(textContent(tree), /connected question bank isn’t available/i);
  assert.ok(elements(tree).some(e => e.props?.href === '/demo'));
  assert.equal(h.requests.length, 0);
});

test('Tycoon clock preserves subsecond answer time while feedback remains paused', async()=>{
  const h=setup();let tree=await h.start();
  for(let i=0;i<6;i++){
    h.tick(190);tree=await h.render();h.answer(tree).props.onClick();tree=await h.render();
    assert.match(textContent(tree),/Timer paused for feedback/);
    h.tick(10000);tree=await h.render();
    h.button(tree,'NEXT QUESTION').props.onClick();
    if(h.requests.length){h.requests.shift().resolve(h.questions);await Promise.resolve();await Promise.resolve()}
    tree=await h.render();
  }
  // Six short answers consumed over one second, despite 60s spent on feedback.
  assert.match(textContent(tree),/1:59/);
  h.tick(119000);tree=await h.render();assert.match(textContent(tree),/LAB CLOSED/);
});

test('Tycoon ignores duplicate and stale answers and stale upgrade buttons', async()=>{
  const h=setup();let tree=await h.start();let old=h.answer(tree);old.props.onClick();old.props.onClick();tree=await h.render();assert.match(textContent(tree),/\+\$5/);
  h.button(tree,'NEXT QUESTION').props.onClick();tree=await h.render();old.props.onClick();h.answer(tree).props.onClick();tree=await h.render();
  // Two correct answers yield $10; a duplicated old callback must not add another.
  assert.match(textContent(tree),/\$10/);
  const oldShop=h.button(tree,'Lab Funding');oldShop.props.onClick();oldShop.props.onClick();tree=await h.render();
  assert.match(textContent(tree),/now \$10/);assert.doesNotMatch(textContent(tree),/now \$15/);
});

test('Tycoon displays income targets and upgrade shortfalls without losing target progress on a purchase', async()=>{
  const h=setup();let tree=await h.start();
  assert.match(textContent(tree), /\$0 \/ \$50 earned/);
  assert.match(textContent(h.button(tree, 'Lab Funding')), /\$10 more/);
  h.answer(tree).props.onClick();tree=await h.render();
  assert.match(textContent(tree), /\$5 \/ \$50 earned/);
  assert.match(textContent(h.button(tree, 'Lab Funding')), /\$5 more/);
  h.button(tree,'NEXT QUESTION').props.onClick();tree=await h.render();
  h.answer(tree).props.onClick();tree=await h.render();
  assert.match(textContent(h.button(tree, 'Lab Funding')), /BUY/);
  h.button(tree, 'Lab Funding').props.onClick();tree=await h.render();
  assert.match(textContent(tree), /\$10 \/ \$50 earned/);
  const progress=elements(tree).find(e=>e.props?.['aria-label']==='Income toward next lab target');
  assert.equal(progress.props['aria-valuenow'],10);
  assert.equal(progress.props['aria-valuemax'],50);
});

test('Tycoon explains when an incorrect answer resets a streak', async()=>{
  const h=setup();let tree=await h.start();
  h.answer(tree).props.onClick();tree=await h.render();
  h.button(tree,'NEXT QUESTION').props.onClick();tree=await h.render();
  const wrong=elements(tree).find(e=>e.type==='AnswerTile' && e.props.index===1);
  wrong.props.onClick();tree=await h.render();
  assert.match(textContent(tree), /Your streak reset/);
});

test('Tycoon refill failures keep the run and late refills cannot replace an ended run', async()=>{
  const h=setup();let tree=await h.start();
  h.answer(tree).props.onClick();tree=await h.render();h.button(tree,'NEXT QUESTION').props.onClick();tree=await h.render();
  h.answer(tree).props.onClick();tree=await h.render();let advance=h.button(tree,'NEXT QUESTION').props.onClick();assert.equal(h.requests.length,1);h.requests.shift().reject(new Error('offline'));await advance;tree=await h.render();assert.match(textContent(tree),/Couldn’t load more questions: offline/);assert.match(textContent(tree),/\$10/);
  advance=h.button(tree,'RETRY LOADING').props.onClick();const held=h.requests.shift();tree=await h.render();const oldFinish=h.button(tree,'End run');oldFinish.props.onClick();tree=await h.render();assert.match(textContent(tree),/LAB CLOSED/);
  const restart=h.button(tree,'Run it again').props.onClick();h.requests.shift().resolve(h.questions);await restart;tree=await h.render();assert.match(textContent(tree),/First question/);
  oldFinish.props.onClick();held.resolve(h.questions);await advance;tree=await h.render();assert.match(textContent(tree),/First question/);assert.doesNotMatch(textContent(tree),/LAB CLOSED/);
});

test('Tycoon does not claim Sparks when the reward RPC returns an error', async()=>{
  let resolveCredit;
  const credit = () => new Promise(resolve => { resolveCredit = resolve; });
  const h = setup({ signedIn: true, credit });
  let tree = await h.start();
  h.answer(tree).props.onClick(); tree = await h.render();
  h.button(tree, 'End run').props.onClick(); tree = await h.render();
  assert.match(textContent(tree), /Saving Sparks/);
  assert.doesNotMatch(textContent(tree), /\+7.*Sparks/);
  resolveCredit({ data: null, error: { message: 'denied' } });
  await Promise.resolve(); tree = await h.render();
  assert.match(textContent(tree), /Sparks could not be confirmed/);
  assert.doesNotMatch(textContent(tree), /\+7.*Sparks/);
});

test('Tycoon treats a null reward response as unconfirmed', async()=>{
  const h = setup({ signedIn: true, credit: () => Promise.resolve({ data: null, error: null }) });
  let tree = await h.start();
  h.answer(tree).props.onClick(); tree = await h.render();
  h.button(tree, 'End run').props.onClick();
  await Promise.resolve(); tree = await h.render();
  assert.match(textContent(tree), /Sparks could not be confirmed/);
});

test('Tycoon confirms a successful reward and ignores a previous run’s late reward', async()=>{
  const credits = [];
  const credit = () => new Promise(resolve => { credits.push(resolve); });
  const h = setup({ signedIn: true, credit });
  let tree = await h.start();
  h.answer(tree).props.onClick(); tree = await h.render();
  h.button(tree, 'End run').props.onClick(); tree = await h.render();
  credits.shift()({ data: 7, error: null });
  await Promise.resolve(); tree = await h.render();
  assert.match(textContent(tree), /Sparks/);
  assert.doesNotMatch(textContent(tree), /Saving Sparks|could not be confirmed/);

  const restart = h.button(tree, 'Run it again').props.onClick();
  h.requests.shift().resolve(h.questions); await restart; tree = await h.render();
  h.answer(tree).props.onClick(); tree = await h.render();
  h.button(tree, 'End run').props.onClick(); tree = await h.render();
  const oldCredit = credits.shift();
  const newRun = h.button(tree, 'Run it again').props.onClick();
  h.requests.shift().resolve(h.questions); await newRun;
  oldCredit({ data: 7, error: null });
  await Promise.resolve(); tree = await h.render();
  assert.doesNotMatch(textContent(tree), /Saving Sparks|Sparks could not be confirmed/);
  assert.match(textContent(tree), /First question/);
});
