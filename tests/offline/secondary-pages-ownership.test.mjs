import { test } from 'node:test';
import assert from 'node:assert/strict';
import { elements, loadSourceModule, textContent } from '../support/source-harness.mjs';

function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject};}
function harness(path, extra) {
  const slots=[];let cursor=0,dirty=false,pending=[],alive=true,updatesAfterUnmount=0;
  const same=(a,b)=>a&&b&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
  const react={Suspense:'Suspense',useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return [slots[i],v=>{if(!alive)updatesAfterUnmount++;const n=typeof v==='function'?v(slots[i]):v;if(!Object.is(n,slots[i])){slots[i]=n;dirty=true}}]},useRef(initial){const i=cursor++;if(!(i in slots))slots[i]={current:initial};return slots[i]},useMemo(fn,deps){const i=cursor++;if(!slots[i]||!same(slots[i].deps,deps))slots[i]={deps,value:fn()};return slots[i].value},useEffect(fn,deps){const i=cursor++;if(!slots[i]||!same(slots[i].deps,deps))pending.push(()=>{slots[i]?.cleanup?.();slots[i]={deps,cleanup:fn()}})}};
  const auth={user:{id:'test-user'},loading:false,error:null};
  const deps={react,'react/jsx-runtime':{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})},'next/link':{default:'a'},'next/navigation':{useSearchParams:()=>new URLSearchParams()},'@/lib/supabase/client':{createClient:()=>({})},'@/lib/use-user':{useUser:()=>auth},...extra};
  const Page=loadSourceModule(path,deps,{URLSearchParams}).default;
  let wrapped=Page();if(wrapped.type==='Suspense')wrapped=wrapped.props.children;const View=wrapped.type;
  async function render(){let tree;for(let n=0;n<10;n++){cursor=0;dirty=false;tree=View(auth);const work=pending;pending=[];for(const effect of work)effect();await Promise.resolve();await Promise.resolve();if(!dirty)return tree}throw Error('render did not settle')}
  function button(tree,label){const found=elements(tree).find(e=>e.type==='button' && textContent(e).includes(label));assert.ok(found,`missing ${label}`);return found}
  function unmount(){alive=false;for(const slot of slots)slot?.cleanup?.()}
  return {render,button,unmount,get updatesAfterUnmount(){return updatesAfterUnmount}};
}

test('class dashboard does not replace the selected class with an older response',async()=>{
  const requests=[];
  const lib={getMyClasses:async()=>[{id:'a',name:'Alpha',members:1,is_teacher:false},{id:'b',name:'Beta',members:1,is_teacher:false}],getClassDashboard:(_sb,id)=>{const d=deferred();requests.push({id,...d});return d.promise},createClass:async()=>{},joinClass:async()=>{}};
  const h=harness('app/classes/page.tsx',{'@/lib/classes':lib,'@/components/spot':{ClassSpot:'span'}});
  let tree=await h.render();h.button(tree,'Alpha').props.onClick();tree=await h.render();h.button(tree,'All classes').props.onClick();tree=await h.render();h.button(tree,'Beta').props.onClick();tree=await h.render();
  requests[1].resolve([{name:'Beta member',weekly_xp:8,boss_damage:0,streak:0}]);await Promise.resolve();await Promise.resolve();tree=await h.render();assert.match(textContent(tree),/Beta member/);
  requests[0].resolve([{name:'Old member',weekly_xp:99,boss_damage:0,streak:0}]);await Promise.resolve();await Promise.resolve();tree=await h.render();assert.match(textContent(tree),/Beta member/);assert.doesNotMatch(textContent(tree),/Old member/);
});

test('leaderboard keeps the selected filter when older requests resolve and reports failures',async()=>{
  const requests=[];const getSubjectLeaderboard=(_sb,subject)=>{const d=deferred();requests.push({subject,...d});return d.promise};
  const sb={from:()=>({select:()=>({eq:()=>({single:async()=>({data:{leaderboard_opt_in:true},error:null})})})})};
  const h=harness('app/leaderboard/page.tsx',{'@/lib/supabase/client':{createClient:()=>sb},'@/lib/questions':{SUBJECTS:[{id:'biology',label:'Biology'},{id:'chemistry',label:'Chemistry'}]},'@/lib/progress':{setLeaderboardOptIn:async()=>{}},'@/lib/daily':{getSubjectLeaderboard},'@/components/avatar':{default:'Avatar'},'@/components/spot':{PodiumSpot:'span'}});
  let tree=await h.render();h.button(tree,'Chemistry').props.onClick();tree=await h.render();
  requests[1].resolve([{rank:1,name:'New result',score:5}]);await Promise.resolve();await Promise.resolve();tree=await h.render();assert.match(textContent(tree),/New result/);
  requests[0].resolve([{rank:1,name:'Old result',score:99}]);await Promise.resolve();await Promise.resolve();tree=await h.render();assert.match(textContent(tree),/New result/);assert.doesNotMatch(textContent(tree),/Old result/);
  h.button(tree,'Biology').props.onClick();tree=await h.render();requests[2].reject(Error('offline'));await Promise.resolve();await Promise.resolve();tree=await h.render();assert.match(textContent(tree),/Could not load leaderboard/);assert.doesNotMatch(textContent(tree),/No scores yet/);
});

test('season reports a confirmed claim even when refreshing the pass fails',async()=>{
  let loads=0;const tier={tier:1,label:'Test reward',name:'Test pass',unlocked:true,claimed:false,season_xp:10,xp_required:5,reward_kind:'coins',ends_on:'later'};
  const h=harness('app/season/page.tsx',{'@/lib/confetti':{celebrate:()=>{}},'@/lib/season':{getSeason:async()=>{if(++loads===1)return [tier];throw Error('offline')},claimSeasonTier:async()=> 'reward',rewardIcon:()=>''}});
  let tree=await h.render();await h.button(tree,'Claim').props.onClick();tree=await h.render();assert.match(textContent(tree),/Reward claimed, but the pass could not be refreshed/);assert.match(textContent(tree),/Claimed: reward/);
});

test('a failed friend removal does not hide the friend',async()=>{
  const friend={friend_id:'f',name:'Friend',division:0,streak:0,level:1};
  const h=harness('app/friends/page.tsx',{'@/components/tab-bar':{default:'nav'},'@/components/avatar':{default:'Avatar'},'@/lib/league':{division:()=>({emoji:'⭐'})},'@/lib/friends':{getMyHandle:async()=> 'handle',getFriends:async()=>[friend],getFriendsBoard:async()=>[],addFriend:async()=>{},removeFriend:async()=>{throw Error('offline')}}});
  let tree=await h.render();const remove=elements(tree).find(e=>e.type==='button' && e.props['aria-label']==='Remove Friend');assert.ok(remove);await remove.props.onClick();tree=await h.render();assert.match(textContent(tree),/Friend/);assert.match(textContent(tree),/Could not remove that friend/);
});

test('profile ignores a pending response after unmount',async()=>{
  const profile=deferred();const h=harness('app/profile/page.tsx',{'@/components/avatar':{default:'Avatar'},'@/lib/league':{division:()=>({emoji:'⭐',name:'Test'})},'@/lib/duel':{duelPeak:async()=>null,duelTier:()=>({})},'@/lib/profile':{getProfileSummary:()=>profile.promise}});
  await h.render();h.unmount();profile.resolve({name:'Old profile'});await Promise.resolve();await Promise.resolve();assert.equal(h.updatesAfterUnmount,0);
});
