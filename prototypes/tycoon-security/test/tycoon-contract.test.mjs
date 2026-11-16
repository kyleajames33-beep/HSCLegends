import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('synthetic Postgres Tycoon owns questions, scoring, upgrades and one-time rewards',async t=>{
  const db=new PGlite();t.after(()=>db.close());
  await db.exec(await readFile(new URL('../schema.sql',import.meta.url),'utf8'));
  await db.exec(`insert into ty_private.question_bank values
    ('q1','chemistry','Q1?',array['A','B'],0,'E1'),
    ('q2','chemistry','Q2?',array['A','B'],1,'E2'),
    ('q3','chemistry','Q3?',array['A','B'],0,'E3'),
    ('q4','physics','P?',array['A','B'],0,'EP')`);
  const act=async(subject,sql,args=[])=>{await db.exec('set role ty_lab_player');try{await db.query("select set_config('lab.test_subject',$1,false)",[subject]);return await db.query(sql,args)}finally{await db.exec('reset role')}};
  const fail=(who,sql,args=[])=>assert.rejects(act(who,sql,args));
  const rows=async(sql,args=[]) => (await db.query(sql,args)).rows;
  await fail('','select * from ty_api.start($1,$2)',['chemistry','start-1']);
  await fail('alice','select * from ty_api.start($1,$2)',['missing','start-1']);
  await fail('alice','select * from ty_api.start($1,$2)',['chemistry','bad key']);
  await fail('alice','select * from ty_private.question_bank');
  const start=(await act('alice','select * from ty_api.start($1,$2)',['chemistry','start-1'])).rows[0];
  const run=start.session_id;
  assert.equal(start.question_count,3);
  assert.equal((await act('alice','select * from ty_api.start($1,$2)',['chemistry','start-1'])).rows[0].session_id,run);
  await fail('alice','select * from ty_api.start($1,$2)',['physics','start-1']);
  // Content changes cannot change or prevent an idempotent retry of this run.
  await db.exec("delete from ty_private.question_bank where subject='chemistry'");
  assert.equal((await act('alice','select * from ty_api.start($1,$2)',['chemistry','start-1'])).rows[0].session_id,run);
  await db.exec("insert into ty_private.question_bank values ('q1','chemistry','Changed?',array['A','B'],1,'Updated'),('q2','chemistry','Q2?',array['A','B'],1,'E2'),('q3','chemistry','Q3?',array['A','B'],0,'E3')");
  await fail('bob','select ty_api.snapshot($1)',[run]);
  await fail('bob','select * from ty_api.answer($1,$2,$3)',[run,1,0]);
  await fail('alice','select * from ty_api.receipt($1,$2)',[run,1]);
  await fail('bob','select * from ty_api.receipt($1,$2)',[run,1]);
  await fail('alice','select * from ty_private.session_questions');
  const snap=async()=> (await act('alice','select ty_api.snapshot($1) as state',[run])).rows[0].state;
  const initial=await snap();
  assert.deepEqual(initial.question,{ordinal:1,stem:'Q1?',options:['A','B']});
  assert.equal(JSON.stringify(initial).includes('correct_index'),false);
  await fail('alice','select * from ty_api.answer($1,$2,$3)',[run,2,1]);
  await fail('alice','select * from ty_api.answer($1,$2,$3)',[run,1,2]);
  await fail('alice','select * from ty_api.buy($1,$2,$3)',[run,'up-1','funding']);
  const first=(await act('alice','select * from ty_api.answer($1,$2,$3)',[run,1,0])).rows;
  assert.deepEqual(first,[{ordinal:1,choice:0,correct:true,correct_index:0,earned:5,cash_after:5,explanation:'E1'}]);
  assert.deepEqual((await act('alice','select * from ty_api.receipt($1,$2)',[run,1])).rows,first);
  assert.deepEqual((await act('alice','select * from ty_api.answer($1,$2,$3)',[run,1,1])).rows,first);
  await act('alice','select * from ty_api.answer($1,$2,$3)',[run,2,1]);
  const upgrade=(await act('alice','select * from ty_api.buy($1,$2,$3)',[run,'up-1','funding'])).rows;
  assert.deepEqual(upgrade,[{item:'funding',cost:10,level_after:1,cash_after:0}]);
  assert.deepEqual((await act('alice','select * from ty_api.buy($1,$2,$3)',[run,'up-1','funding'])).rows,upgrade);
  await fail('alice','select * from ty_api.buy($1,$2,$3)',[run,'up-1','other']);
  await fail('alice','select * from ty_api.buy($1,$2,$3)',[run,'up-2','funding']);
  const third=(await act('alice','select * from ty_api.answer($1,$2,$3)',[run,3,0])).rows[0];
  assert.equal(third.earned,10);assert.equal(third.cash_after,10);
  assert.equal((await snap()).question,null);

  // Abort after completion/ledger insertion to show statement-level atomicity.
  await db.exec(`create function ty_private.fail_wallet() returns trigger language plpgsql as $$ begin raise exception 'forced wallet failure'; end $$;
    create trigger fail_wallet before insert on ty_private.wallets for each row execute function ty_private.fail_wallet();`);
  await fail('alice','select * from ty_api.finish($1)',[run]);
  assert.deepEqual(await rows('select status,cash,correct_count from ty_private.sessions where id=$1',[run]),[{status:'active',cash:10,correct_count:3}]);
  assert.deepEqual(await rows('select (select count(*) from ty_private.completions)::int as completions,(select count(*) from ty_private.ledger)::int as ledger'),[{completions:0,ledger:0}]);
  await db.exec('drop trigger fail_wallet on ty_private.wallets; drop function ty_private.fail_wallet()');
  const done=(await act('alice','select * from ty_api.finish($1)',[run])).rows;
  assert.deepEqual(done,[{correct_count:3,earned:20,cash:10,award:11}]);
  assert.deepEqual((await act('alice','select * from ty_api.finish($1)',[run])).rows,done);
  assert.deepEqual((await act('alice','select * from ty_api.receipt($1,$2)',[run,1])).rows,first);
  assert.deepEqual(await rows('select owner,balance from ty_private.wallets'),[{owner:'alice',balance:11}]);
  assert.equal((await snap()).completion.award,11);
  await fail('alice','select * from ty_api.buy($1,$2,$3)',[run,'up-2','funding']);
  await fail('bob','select * from ty_api.finish($1)',[run]);

  // Deadline and per-session funding cap; setup changes are trusted test fixtures.
  const expired=(await act('alice','select * from ty_api.start($1,$2)',['chemistry','expire'])).rows[0].session_id;
  await db.query("update ty_private.sessions set deadline=clock_timestamp()-interval '1 second' where id=$1",[expired]);
  await fail('alice','select * from ty_api.answer($1,$2,$3)',[expired,1,0]);
  await fail('alice','select * from ty_api.buy($1,$2,$3)',[expired,'u1','funding']);
  assert.equal((await act('alice','select * from ty_api.finish($1)',[expired])).rows[0].award,0);
  const capped=(await act('alice','select * from ty_api.start($1,$2)',['chemistry','cap'])).rows[0].session_id;
  await db.query('update ty_private.sessions set cash=10000 where id=$1',[capped]);
  for(let i=0;i<5;i++) await act('alice','select * from ty_api.buy($1,$2,$3)',[capped,`upgrade-${i}`,'funding']);
  await fail('alice','select * from ty_api.buy($1,$2,$3)',[capped,'upgrade-5','funding']);
});
