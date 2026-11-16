// Live host (projector) screens rendered against a MOCKED network: no real auth or database.
// Run with the dev server up: HSC_PLAYWRIGHT_MODULE=<path to playwright/index.mjs> node tests/browser/live-host.smoke.mjs
// Renders /live/host against a MOCKED network (no real auth or database) to check the teacher screens visually.
const { chromium } = await import(process.env.HSC_PLAYWRIGHT_MODULE ?? 'playwright');
const D=process.env.HSC_SCREENSHOT_DIR ?? '/tmp';
const BASE=process.env.HSC_BASE_URL ?? 'http://localhost:3000';
const REF=process.env.CLASSROOM_STAGING_PROJECT_REF ?? 'xkqeigruzvnudtnmggis';
const b64=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const exp=Math.floor(Date.now()/1000)+3600;
const user={id:'11111111-1111-4111-8111-111111111111',aud:'authenticated',role:'authenticated',email:'teacher@example.com',is_anonymous:false,app_metadata:{provider:'email'},user_metadata:{},created_at:new Date().toISOString()};
const token=`${b64({alg:'HS256',typ:'JWT'})}.${b64({sub:user.id,role:'authenticated',exp,is_anonymous:false})}.sig`;
const session={access_token:token,refresh_token:'mock',token_type:'bearer',expires_in:3600,expires_at:exp,user};
const ROOM='22222222-2222-4222-8222-222222222222';
const names=['Ava','Noah','Mia','Leo','Zara','Kai','Isla'];
let phase='lobby0';
const q={id:'q1',index:2,stem:'Which base pairs with adenine in DNA?',options:['Cytosine','Guanine','Uracil','Thymine'],correct_index:3,explanation:null};
function view(){
  const now=new Date(); const base={room_id:ROOM,version:5,short_code:'T6HXHV',seconds:20,question_total:8,server_now:now.toISOString(),opens_at:null,closes_at:null,answered:0,choice_counts:null,question:null};
  const ps=(n,ans)=>names.slice(0,n).map((a,i)=>({id:'p'+i,alias:a,score:[3820,3610,2990,2400,1980,1200,600][i],last_points:[940,0,880,760,0,610,0][i],answered:i<ans,correct:[true,false,true,true,false,true,false][i]}));
  if(phase==='lobby0') return {...base,state:'lobby',players:[]};
  if(phase==='lobby') return {...base,state:'lobby',players:ps(7,0)};
  if(phase==='question') return {...base,state:'active',question:q,opens_at:new Date(now-6000).toISOString(),closes_at:new Date(+now+14000).toISOString(),answered:4,choice_counts:[1,0,1,2],players:ps(7,4)};
  if(phase==='reveal') return {...base,state:'active',question:q,opens_at:new Date(now-20000).toISOString(),closes_at:new Date(now-1000).toISOString(),answered:7,choice_counts:[1,1,1,4],players:ps(7,7)};
  if(phase==='complete') return {...base,state:'complete',players:ps(7,7)};
}
const browser=await chromium.launch();
const ctx=await browser.newContext({viewport:{width:1366,height:768}});
await ctx.addInitScript(([k,s,room])=>{ sessionStorage.setItem(k,s); sessionStorage.setItem('hsc-live-host-room',JSON.stringify(room)); },[`hsc-live-${REF}`,JSON.stringify(session),ROOM]);
await ctx.route('**/auth/v1/**',r=>r.fulfill({json:user}));
await ctx.route('**/rest/v1/rpc/classroom_v2_*',r=>r.fulfill({json:true}));
await ctx.route('**/rest/v1/rpc/classroom_v2_game_host',r=>r.fulfill({json:view()}));
const page=await ctx.newPage();
const errs=[]; page.on('pageerror',e=>errs.push(e.message));
await page.goto(BASE+'/live/host');
const shot=async(name,ph,wait)=>{phase=ph; await page.waitForTimeout(wait??1800); await page.screenshot({path:`${D}/h-${name}.png`});};
await shot('1-lobby-empty','lobby0',3000);
await shot('2-lobby','lobby');
await shot('3-question','question');
await shot('4-reveal','reveal');
await page.getByRole('button',{name:'Show leaderboard'}).click(); await page.waitForTimeout(900); await page.screenshot({path:`${D}/h-5-board.png`});
await shot('6-podium','complete');
if(errs.length){console.error('page errors:',errs);process.exitCode=1;} else console.log('live host smoke: ok');
await browser.close();
