import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { createGambleClient } from '../client.mjs';

// auth identity here is injected by this trusted test harness, not a real JWT.
test('isolated Postgres: participant-only access, locked answers and one payout', async t => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(await readFile(new URL('../schema.sql', import.meta.url), 'utf8'));
  await db.exec(`
    insert into game_private.rooms values ('room',1,'answer',now()+interval '1 hour'),('other',1,'answer',now()+interval '1 hour');
    insert into game_private.players(id,room_id,subject) values ('a','room','alice'),('b','room','bob'),('d','room','dana'),('c','other','charlie');
    insert into game_private.questions values ('room',1,'Which?',array['first','second'],1),('other',1,'Other?',array['yes','no'],0);
    insert into game_private.pairs values ('room',1,'a','b');
  `);
  const act = async (subject, sql, args=[]) => {
    await db.exec('set role lab_player');
    try { await db.query("select set_config('lab.test_subject',$1,false)",[subject]); return await db.query(sql,args); }
    finally { await db.exec('reset role'); }
  };
  const fail = (subject,sql,args=[]) => assert.rejects(act(subject,sql,args));
  const query = async (sql,args=[]) => (await db.query(sql,args)).rows;
  // The browser adapter speaks through an injected mock transport backed by
  // the actual lab SQL. This is not PostgREST, networking or JWT validation.
  const alice = createGambleClient(async(name,args)=>{
    const values=[args.p_room,args.p_player];
    let sql;
    if(name==='snapshot') sql='select game_api.snapshot($1,$2) as value';
    else if(name==='submit'||name==='decide') {values.push(args.p_round,args.p_choice);sql=`select * from game_api.${name}($1,$3,$2,$4)`;}
    else if(name==='reveal') {values.push(args.p_round);sql='select * from game_api.reveal($1,$3,$2)';}
    else throw new Error('Unsupported endpoint');
    const rows=(await act('alice',sql,values)).rows;
    return {data:name==='snapshot'?rows[0].value:name==='decide'?rows[0].decide:rows,error:null};
  });

  assert.deepEqual((await act('alice','select * from game_api.question($1,$2)',['room','a'])).rows,[{round:1,stem:'Which?',options:['first','second']}]);
  const snapshot = async(subject,player) => (await act(subject,'select game_api.snapshot($1,$2) as snapshot',['room',player])).rows[0].snapshot;
  const initial = await snapshot('alice','a');
  assert.deepEqual(initial.question,{stem:'Which?',options:['first','second']});
  assert.equal(initial.own_answer,null);assert.equal(initial.own_decision,null);assert.equal(initial.result,null);
  assert.equal(JSON.stringify(initial).includes('correct_index'),false);
  assert.deepEqual(await alice.snapshot('room','a'),initial);
  await fail('','select * from game_api.question($1,$2)',['room','a']);
  await fail('bob','select * from game_api.question($1,$2)',['room','a']);
  await fail('','select game_api.snapshot($1,$2)',['room','a']);
  await fail('bob','select game_api.snapshot($1,$2)',['room','a']);
  await fail('charlie','select * from game_api.question($1,$2)',['room','c']);
  await fail('alice','select correct_index from game_private.questions');
  await fail('alice','select * from game_api.submit($1,$2,$3,$4)',['room',1,'b',1]);
  await fail('alice','select * from game_api.submit($1,$2,$3,$4)',['room',2,'a',1]);
  await fail('alice','select * from game_api.submit($1,$2,$3,$4)',['room',null,'a',1]);
  await fail('alice','select * from game_api.submit($1,$2,$3,$4)',['room',1,'a',2]);
  const first = (await act('alice','select * from game_api.submit($1,$2,$3,$4)',['room',1,'a',1])).rows;
  assert.deepEqual(first,[{choice:1,correct:true,stake:10}]);
  assert.deepEqual((await act('alice','select * from game_api.submit($1,$2,$3,$4)',['room',1,'a',0])).rows,first);
  assert.deepEqual(await alice.submit('room','a',1,0),first[0]);
  assert.deepEqual((await snapshot('alice','a')).own_answer,{choice:1,correct:true,stake:10});
  assert.equal((await snapshot('bob','b')).own_answer,null);
  await act('bob','select * from game_api.submit($1,$2,$3,$4)',['room',1,'b',1]);
  await db.exec("update game_private.rooms set phase='decide' where id='room'");
  await fail('alice','select * from game_api.reveal($1,$2,$3)',['room',1,'a']);
  await fail('alice','select game_api.decide($1,$2,$3,$4)',['room',1,'b','steal']);
  await fail('charlie','select game_api.decide($1,$2,$3,$4)',['room',1,'c','share']);
  await act('alice','select game_api.decide($1,$2,$3,$4)',['room',1,'a','steal']);
  assert.equal((await snapshot('alice','a')).own_decision,'steal');
  assert.equal((await snapshot('bob','b')).own_decision,null);
  assert.equal((await snapshot('bob','b')).result,null);
  assert.equal((await act('alice','select game_api.decide($1,$2,$3,$4) as choice',['room',1,'a','share'])).rows[0].choice,'steal');
  assert.equal(await alice.decide('room','a',1,'share'),'steal');
  await fail('alice','select choice from game_private.decisions');
  await fail('alice','select * from game_api.reveal($1,$2,$3)',['room',1,'a']);
  await act('bob','select game_api.decide($1,$2,$3,$4)',['room',1,'b','share']);
  // Simulate a broken pairing assignment: both members must be unique in either slot.
  await db.exec("insert into game_private.pairs values ('room',1,'b','d')");
  await fail('alice','select * from game_api.reveal($1,$2,$3)',['room',1,'a']);
  await db.exec("delete from game_private.pairs where player_a='b'");
  // Fail the second player's update after the result and first payout have
  // been written. The entire PostgreSQL statement must roll back.
  await db.exec(`create function game_private.reject_balance_update() returns trigger language plpgsql as $$ begin if new.id='b' then raise exception 'injected update failure'; end if; return new; end $$;
    create trigger reject_balance before update on game_private.players for each row execute function game_private.reject_balance_update();`);
  await fail('alice','select * from game_api.reveal($1,$2,$3)',['room',1,'a']);
  assert.deepEqual(await query('select count(*)::int as total from game_private.results'),[{total:0}]);
  assert.deepEqual(await query("select id,points from game_private.players where room_id='room' and id in ('a','b') order by id"),[{id:'a',points:0},{id:'b',points:0}]);
  await db.exec('drop trigger reject_balance on game_private.players; drop function game_private.reject_balance_update()');
  const one=(await act('alice','select * from game_api.reveal($1,$2,$3)',['room',1,'a'])).rows;
  const two=(await act('bob','select * from game_api.reveal($1,$2,$3)',['room',1,'b'])).rows;
  assert.deepEqual(one,[{decision_a:'steal',decision_b:'share',payout_a:20,payout_b:0}]);
  assert.deepEqual(two,one);
  assert.deepEqual(await alice.reveal('room','a',1),one[0]);
  assert.deepEqual(await query("select id,points from game_private.players where room_id='room' and id in ('a','b') order by id"),[{id:'a',points:20},{id:'b',points:0}]);
  assert.deepEqual(await query('select count(*)::int as total from game_private.results'),[{total:1}]);
  assert.deepEqual((await snapshot('bob','b')).result,{player_a:'a',player_b:'b',decision_a:'steal',decision_b:'share',payout_a:20,payout_b:0});
  await db.exec("update game_private.rooms set phase='answer',round=2,deadline=now()-interval '1 second' where id='room'");
  await fail('alice','select * from game_api.reveal($1,$2,$3)',['room',1,'a']);
  await fail('alice','select game_api.decide($1,$2,$3,$4)',['room',1,'a','share']);
  await fail('alice','select * from game_api.submit($1,$2,$3,$4)',['room',2,'a',1]);
});
