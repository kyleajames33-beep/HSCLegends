import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// Synthetic Postgres actor fixture; this is not verified Supabase authentication.
test('wallet overflow rolls back completion and ledger, and retry credits exactly once',async t=>{
  const db=new PGlite();t.after(()=>db.close());
  await db.exec(await readFile(new URL('./auth-fixture.sql',import.meta.url),'utf8'));
  await db.exec(await readFile(new URL('../schema.sql',import.meta.url),'utf8'));
  await db.exec(`insert into ty_private.releases values ('release','chemistry',12,'fixture','draft');
    insert into ty_private.question_bank values ('question','release','Synthetic question?',array['A','B'],0,'Synthetic explanation');
    update ty_private.releases set status='published' where id='release'`);
  const actor='00000000-0000-4000-8000-000000000001', intruder='00000000-0000-4000-8000-000000000002';
  const act=async (who,sql,args=[])=>{await db.exec('set role authenticated');try{await db.query("select set_config('request.jwt.claim.sub',$1,false)",[who]);return await db.query(sql,args);}finally{await db.exec('reset role');}};
  const run=(await act(actor,'select * from ty_api.start($1,$2)',['release','overflow'])).rows[0].session_id;
  await act(actor,'select * from ty_api.answer($1,$2,$3)',[run,1,0]);
  await db.query('insert into ty_private.wallets(owner,balance) values ($1,$2)',[actor,2147483647]);
  await assert.rejects(act(actor,'select * from ty_api.finish($1)',[run]),/integer out of range/);
  assert.deepEqual((await db.query('select status from ty_private.sessions where id=$1',[run])).rows,[{status:'active'}]);
  assert.equal((await db.query('select count(*)::integer as count from ty_private.completions where session_id=$1',[run])).rows[0].count,0);
  assert.equal((await db.query('select count(*)::integer as count from ty_private.ledger where session_id=$1',[run])).rows[0].count,0);
  assert.equal((await db.query('select balance from ty_private.wallets where owner=$1',[actor])).rows[0].balance,2147483647);
  await assert.rejects(act(intruder,'select * from ty_api.finish($1)',[run]),/not authorized/);
  // This fixture adjustment simulates resolution by trusted wallet operations,
  // not an application API for users to change their wallet balance.
  await db.query('update ty_private.wallets set balance=$2 where owner=$1',[actor,2147483640]);
  const completed=(await act(actor,'select * from ty_api.finish($1)',[run])).rows;
  assert.equal(completed[0].award,7);
  assert.deepEqual((await act(actor,'select * from ty_api.finish($1)',[run])).rows,completed);
  assert.equal((await db.query('select balance from ty_private.wallets where owner=$1',[actor])).rows[0].balance,2147483647);
  assert.equal((await db.query('select count(*)::integer as count from ty_private.ledger where session_id=$1',[run])).rows[0].count,1);
  assert.equal((await db.query('select count(*)::integer as count from ty_private.completions where session_id=$1',[run])).rows[0].count,1);
});
