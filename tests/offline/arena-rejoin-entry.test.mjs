import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadSourceModule, elements, textContent, memoryStorage } from '../support/source-harness.mjs';

// Executes the actual page callbacks with explicit hook, transport and timer doubles.
function setup(mode, failRead, user = null) {
  const slots=[]; let cursor=0,dirty=false,effects=[],closed=0,onUpdate,pairCalls=0;
  let serverState={status:'lobby',round:0,total:5,starts_at:null,players:1,alive:1,round_started_at:null,per_q_seconds:20,stem:null,options:null};
  const same=(a,b)=>a&&b&&a.length===b.length&&a.every((x,i)=>Object.is(x,b[i]));
  const react={
    useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return [slots[i],v=>{const n=typeof v==='function'?v(slots[i]):v;if(!Object.is(n,slots[i])){slots[i]=n;dirty=true}}]},
    useRef(initial){const i=cursor++;if(!(i in slots))slots[i]={current:initial};return slots[i]},
    useMemo(fn,deps){const i=cursor++;if(!slots[i]||!same(slots[i].deps,deps))slots[i]={deps,value:fn()};return slots[i].value},
    useSyncExternalStore(_subscribe,getSnapshot){cursor++;return getSnapshot()},
    useEffect(fn,deps){const i=cursor++;if(!slots[i]||!same(slots[i].deps,deps))effects.push(()=>{slots[i]?.cleanup?.();slots[i]={deps,cleanup:fn()}})},
  };
  const storage=memoryStorage(), saved={code:'ROOM01',room:'room-1',player:'player-1',alias:'Alex',ts:Date.now()};
  storage.setItem(`legends_arena_${mode}`,JSON.stringify(saved));
  const window={setInterval:()=>0,clearInterval:()=>{},setTimeout:()=>0,clearTimeout:()=>{}};
  const document={visibilityState:'visible',addEventListener(){},removeEventListener(){}};
  const globals={window,document,localStorage:storage,...window};
  const presence=loadSourceModule('lib/presence.ts',{},globals);
  const sb={rpc:async()=>({data:null,error:null})};
  const state=async()=>{if(failRead===true)throw new Error('connection lost');return {...serverState,status:failRead==='results'?'finished':serverState.status}};
  const me=async()=>{if(failRead==='me')throw new Error('connection lost');return {alive:true,points:0}};
  const results=async()=>{if(failRead==='results')throw new Error('connection lost');return []};
  const subscribe=(_sb,_room,update)=>{onUpdate=update;return ()=>{closed++}};
  const juice={flash(){},shake(){},float(){},buzz(){},burst(){},correct(){},wrong(){}};
  const common={react,'react/jsx-runtime':{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props}),Fragment:'fragment'},'next/link':{default:'a'},'@/lib/supabase/client':{createClient:()=>sb},'@/lib/use-user':{useUser:()=>({user,loading:false})},'@/lib/questions':{SUBJECTS:[{id:'biology',label:'Biology'}],getQuizQuestions:async()=>[{stem:'Question',options:['A','B'],correct_index:0}]},'@/components/answer-tile':{default:'AnswerTile'},'@/components/count-up':{default:'CountUp'},'@/components/math-text':{default:({text})=>text},'@/components/avatar':{default:'Avatar'},'@/lib/confetti':{celebrate(){}},'@/components/juice':{useJuice:()=>juice,atEvent(){},TimerBar:'TimerBar',StreakFlame:'StreakFlame'},'@/lib/presence':presence};
  const ko={koRejoin:async()=>({room_id:'room-1',player_id:'player-1'}),koState:state,koMyState:me,koResults:results,koPowerup:async()=>null,subscribeRoom:subscribe};
  const gamble={gambleRejoin:async()=>({room_id:'room-1',player_id:'player-1'}),gambleJoin:async()=>({room_id:'room-2',player_id:'player-2'}),gambleQuickJoin:async()=>({room_id:'room-3',player_id:'player-3',code:'NEW123'}),gamblePopulateQuestions:async()=>{},gambleState:state,gambleMe:me,gambleLeaderboard:results,gambleSubmit:async()=>({correct:true,correct_index:0,points_earned:10}),gambleAssignPairs:async()=>{pairCalls++},gambleGetPartner:async()=>null,subscribeGamble:subscribe};
  const deps={...common,'@/lib/knockout':ko,'@/lib/gamble':gamble,'@/components/gamble-ui':{PartnerCard:'PartnerCard',PotDisplay:'PotDisplay',DecisionButton:'DecisionButton',RevealCard:'RevealCard'}};
  const Page=loadSourceModule(`app/${mode}/page.tsx`,deps,globals).default;
  async function render(){let tree;for(let i=0;i<12;i++){cursor=0;dirty=false;tree=Page();const pending=effects;effects=[];for(const f of pending)f();await Promise.resolve();await Promise.resolve();if(!dirty)return tree;}throw Error('Did not settle')}
  const button=(tree,label)=>elements(tree).find(e=>e.type==='button'&&textContent(e).includes(label));
  return {render,button,storage,saved,closed:()=>closed,pairCalls:()=>pairCalls,setServer:next=>{serverState={...serverState,...next}},notify:()=>onUpdate()};
}

test('gamble: same-round updates preserve answer feedback, while next round resets it',async()=>{
  const h=setup('gamble',false);let tree=await h.render();await h.button(tree,'Rejoin game').props.onClick();tree=await h.render();
  h.setServer({status:'active',round:1,stem:'First?',options:['A','B'],round_started_at:new Date().toISOString()});
  await h.notify();tree=await h.render();
  const answer=elements(tree).find(e=>e.type==='AnswerTile'&&e.props.index===0);assert.ok(answer);await answer.props.onClick();tree=await h.render();
  assert.match(textContent(tree),/10 points staked/);const calls=h.pairCalls();
  await h.notify();tree=await h.render();assert.match(textContent(tree),/10 points staked/);assert.equal(h.pairCalls(),calls);
  h.setServer({round:2,stem:'Next?'});await h.notify();tree=await h.render();assert.match(textContent(tree),/Next\?/);assert.doesNotMatch(textContent(tree),/10 points staked/);
});

for (const quick of [false,true]) {
  test(`gamble: ${quick?'quick match':'joining by code'} saves the actual new code and alias`,async()=>{
    const h=setup('gamble',false);let tree=await h.render();
    elements(tree).find(e=>e.type==='input'&&e.props.placeholder==='Your name').props.onChange({target:{value:'  Taylor  '}});
    if(!quick)elements(tree).find(e=>e.type==='input'&&e.props.placeholder==='CODE').props.onChange({target:{value:'new456'}});
    tree=await h.render();await h.button(tree,quick?'Quick Match':'Join').props.onClick();await h.render();
    const saved=JSON.parse(h.storage.getItem('legends_arena_gamble'));
    assert.equal(saved.code,quick?'NEW123':'NEW456');assert.equal(saved.alias,'Taylor');
    assert.equal(saved.room,quick?'room-3':'room-2');assert.equal(saved.player,quick?'player-3':'player-2');
  });
}

test('gamble: failed new join keeps its real identity available for retry',async()=>{
  const h=setup('gamble',true);let tree=await h.render();
  elements(tree).find(e=>e.type==='input'&&e.props.placeholder==='Your name').props.onChange({target:{value:'Taylor'}});
  elements(tree).find(e=>e.type==='input'&&e.props.placeholder==='CODE').props.onChange({target:{value:'new456'}});
  tree=await h.render();await h.button(tree,'Join').props.onClick();tree=await h.render();
  assert.match(textContent(tree),/connection lost/);assert.match(textContent(tree),/Rejoin game NEW456/);
  const saved=JSON.parse(h.storage.getItem('legends_arena_gamble'));
  assert.equal(saved.code,'NEW456');assert.equal(saved.alias,'Taylor');assert.equal(saved.player,'player-2');
});

for(const mode of ['gamble','knockout']) {
  test(`${mode}: signed-in alias defaults to email but can be cleared`,async()=>{
    const h=setup(mode,false,{email:'sarah@example.test'});let tree=await h.render();
    let input=elements(tree).find(e=>e.type==='input'&&e.props.placeholder==='Your name');
    assert.equal(input.props.value,'sarah');input.props.onChange({target:{value:''}});
    tree=await h.render();input=elements(tree).find(e=>e.type==='input'&&e.props.placeholder==='Your name');
    assert.equal(input.props.value,'');assert.equal(h.button(tree,mode==='gamble'?'Quick Match':'Quick Play').props.disabled,true);
  });
  for(const failure of [true,'me','results']) test(`${mode}: failed ${failure===true?'room':failure} read keeps rejoin and closes its subscription`,async()=>{
    const h=setup(mode,failure);let tree=await h.render();
    const join=h.button(tree,'Rejoin game');assert.ok(join);await join.props.onClick();tree=await h.render();
    assert.ok(h.button(tree,'Rejoin game'),'retry must stay visible');
    assert.match(textContent(tree),/connection lost/);
    assert.deepEqual(JSON.parse(h.storage.getItem(`legends_arena_${mode}`)),h.saved);
    assert.equal(h.closed(),1);
  });
  test(`${mode}: successful rejoin keeps the original code and alias`,async()=>{
    const h=setup(mode,false);let tree=await h.render();
    await h.button(tree,'Rejoin game').props.onClick();tree=await h.render();
    const saved=JSON.parse(h.storage.getItem(`legends_arena_${mode}`));
    assert.equal(saved.code,'ROOM01');assert.equal(saved.alias,'Alex');
    assert.equal(saved.room,'room-1');assert.equal(saved.player,'player-1');
    assert.equal(h.button(tree,'Rejoin game'),undefined);
  });
  test(`${mode}: subscribed room updates still reach active play and the latest question`,async()=>{
    const h=setup(mode,false);let tree=await h.render();await h.button(tree,'Rejoin game').props.onClick();tree=await h.render();
    h.setServer({status:'active',round:1,stem:'Latest question?',options:['A','B'],round_started_at:new Date().toISOString()});
    await h.notify();tree=await h.render();assert.match(textContent(tree),/Latest question\?/);
    h.setServer({round:2,stem:'Following question?'});await h.notify();tree=await h.render();assert.match(textContent(tree),/Following question\?/);
  });
}
