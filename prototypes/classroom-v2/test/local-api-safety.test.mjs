import test from 'node:test';
import assert from 'node:assert/strict';
import { LOCAL_URL, LOCAL_IPV6_URL, LAB_PROJECT, LAB_WORKDIR, DB_CONTAINER, validateLocalOptions, validateContainer, validateFetchTarget, validateGatewayPort } from './local-api-safety.mjs';

test('local API smoke refuses missing opt-in, key, or non-exact loopback endpoint',()=>{
 const safe={HSC_LAB_ALLOW_DISPOSABLE:'1',HSC_LAB_LOCAL_URL:LOCAL_URL,HSC_LAB_ANON_KEY:'sb_publishable_synthetic'};
 assert.equal(validateLocalOptions(safe).url,LOCAL_URL);
 assert.equal(validateLocalOptions({...safe,HSC_LAB_LOCAL_URL:LOCAL_IPV6_URL}).url,LOCAL_IPV6_URL);
 for(const edit of [{HSC_LAB_ALLOW_DISPOSABLE:''},{HSC_LAB_ANON_KEY:''},{HSC_LAB_LOCAL_URL:'https://example.supabase.co'},{HSC_LAB_LOCAL_URL:'http://localhost:54321'},{HSC_LAB_LOCAL_URL:`${LOCAL_URL}/`},{HSC_LAB_LOCAL_URL:'http://127.0.0.1:54322'}]) assert.throws(()=>validateLocalOptions({...safe,...edit}),/LOCAL_LAB_CONFIGURATION_REQUIRED/);
 const jwt=role=>`a.${Buffer.from(JSON.stringify({role})).toString('base64url')}.b`;
 assert.doesNotThrow(()=>validateLocalOptions({...safe,HSC_LAB_ANON_KEY:jwt('anon')}));
 assert.throws(()=>validateLocalOptions({...safe,HSC_LAB_ANON_KEY:jwt('service_role')}),/LOCAL_LAB_CONFIGURATION_REQUIRED/);
 assert.throws(()=>validateLocalOptions({...safe,HSC_LAB_ANON_KEY:'sb_secret_fake'}),/LOCAL_LAB_CONFIGURATION_REQUIRED/);
 for(const unsafe of ['https://example.supabase.co','http://localhost:54321','http://127.0.0.1:54322','http://evil@127.0.0.1:54321']) assert.throws(()=>validateFetchTarget(unsafe),/LOCAL_LAB_NETWORK_BLOCKED/);
 assert.equal(validateFetchTarget(`${LOCAL_URL}/auth/v1/signup`).origin,LOCAL_URL);
 assert.equal(validateFetchTarget(`${LOCAL_IPV6_URL}/auth/v1/signup`,LOCAL_IPV6_URL).origin,LOCAL_IPV6_URL);
 assert.throws(()=>validateFetchTarget(`${LOCAL_URL}/auth/v1/signup`,LOCAL_IPV6_URL),/LOCAL_LAB_NETWORK_BLOCKED/);
 assert.throws(()=>validateFetchTarget('http://[::2]:54321/auth/v1/signup',LOCAL_IPV6_URL),/LOCAL_LAB_NETWORK_BLOCKED/);
});

test('container and gateway must match exact labelled disposable lab and port',()=>{
 const good={Name:`/${DB_CONTAINER}`,State:{Running:true},Config:{Image:'public.ecr.aws/supabase/postgres:lab',Labels:{'com.supabase.cli.project':LAB_PROJECT,'com.supabase.cli.workdir':LAB_WORKDIR,'com.docker.compose.project':LAB_PROJECT}},NetworkSettings:{Ports:{'8000/tcp':[{HostIp:'127.0.0.1',HostPort:'54321'}]}}};
 validateContainer(good,DB_CONTAINER,'public.ecr.aws/supabase/postgres:');validateGatewayPort(good);
 assert.throws(()=>validateContainer({...good,Name:'/another'},DB_CONTAINER,'public.ecr.aws/supabase/postgres:'),/MISMATCH/);
 assert.throws(()=>validateContainer({...good,Config:{...good.Config,Labels:{}}},DB_CONTAINER,'public.ecr.aws/supabase/postgres:'),/MISMATCH/);
 assert.throws(()=>validateContainer({...good,State:{Running:false}},DB_CONTAINER,'public.ecr.aws/supabase/postgres:'),/MISMATCH/);
 assert.throws(()=>validateContainer({...good,NetworkSettings:{Ports:{'5432/tcp':[{HostIp:'0.0.0.0',HostPort:'54322'}]}}},DB_CONTAINER,'public.ecr.aws/supabase/postgres:'),/MISMATCH/);
 assert.throws(()=>validateGatewayPort({...good,NetworkSettings:{Ports:{}}}),/MISMATCH/);
 const ipv6={...good,NetworkSettings:{Ports:{'8000/tcp':[{HostIp:'::1',HostPort:'54321'}]}}};
 validateGatewayPort(ipv6,LOCAL_IPV6_URL);
 assert.throws(()=>validateGatewayPort(ipv6,LOCAL_URL),/MISMATCH/);
 assert.throws(()=>validateGatewayPort(good,LOCAL_IPV6_URL),/MISMATCH/);
 for (const address of ['0.0.0.0','::','192.0.2.1']) {
  const exposed={...good,NetworkSettings:{Ports:{'8000/tcp':[{HostIp:address,HostPort:'54321'}]}}};
  assert.throws(()=>validateGatewayPort(exposed,LOCAL_URL),/MISMATCH/);
  assert.throws(()=>validateGatewayPort(exposed,LOCAL_IPV6_URL),/MISMATCH/);
 }
 const mixed={...good,NetworkSettings:{Ports:{'8000/tcp':[{HostIp:'127.0.0.1',HostPort:'54321'},{HostIp:'0.0.0.0',HostPort:'54321'}]}}};
 assert.throws(()=>validateGatewayPort(mixed),/MISMATCH/);
});
