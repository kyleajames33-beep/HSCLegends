import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { SPECIMEN_SETS } from '../../lib/specimens.mjs';

const migrations = new URL('../../supabase/migrations/', import.meta.url);
const questions = SPECIMEN_SETS.flatMap(s => s.questions);
const upgrade = fs.readdirSync(migrations).find(f => f.endsWith('_verified_specimen_answers.sql'));
const user1 = '00000000-0000-0000-0000-000000000001';
const user2 = '00000000-0000-0000-0000-000000000002';

for (const installed of [false, true]) {
  test(`server-verified rewards on ${installed ? 'already-installed vulnerable' : 'fresh'} schema`, async () => {
    const db = new PGlite();
    try {
      await db.exec(`
        create role anon; create role authenticated;
        create schema auth;
        create table auth.users(id uuid primary key);
        insert into auth.users values ('${user1}'), ('${user2}');
        create function auth.uid() returns uuid language sql as $$
          select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
        grant usage on schema auth to anon, authenticated;
        create table card_catalog (id text primary key, name text, subject text, rarity text,
          art_kind text, art_ref text, flavor text, sort int);
        create table user_cards(user_id uuid references auth.users(id), card_id text references card_catalog(id),
          count int not null default 1, primary key(user_id,card_id));
        alter table user_cards enable row level security;
        create function spend_coins(int,text,jsonb) returns void language plpgsql as $$ begin end $$;
        create function credit_coins(int,text,jsonb) returns void language plpgsql as $$ begin end $$;
        create function _card_dupe_value(text) returns int language sql as $$ select 5 $$;
      `);
      await db.exec(fs.readFileSync(new URL('20261012_specimen_cards.sql',migrations),'utf8'));
      if (installed) {
        // Recreate the actual live vulnerable definition, then upgrade without rerunning its seed.
        await db.exec(`create or replace function public.claim_specimen_card(p_card_id text)
          returns boolean language plpgsql security definer set search_path=public as $$
          begin
            insert into user_cards(user_id,card_id) values(auth.uid(),p_card_id)
              on conflict do nothing;
            return true;
          end $$;`);
      } else {
        await db.exec(`select set_config('request.jwt.claim.sub','${user1}',false); set role authenticated;`);
        await assert.rejects(db.query("select claim_specimen_card('spec-soda-sealed')"), /verified correct answer required/);
        await db.exec('reset role;');
      }
      await db.exec(fs.readFileSync(new URL(upgrade,migrations),'utf8'));
      // Keys exactly match the authored bank, including spec-tr4 -> spec-cavendish.
      const { rows: keys } = await db.query('select * from legends_private.specimen_questions');
      assert.equal(keys.length,17);
      for (const q of questions) assert.deepEqual(keys.find(k => k.id === q.id), {
        id:q.id, card_id:q.card.id, correct_index:q.correctIndex, option_count:q.options.length,
      });
      await db.exec(`select set_config('request.jwt.claim.sub','${user1}',false); set role authenticated;`);
      for (const q of questions) {
        await assert.rejects(db.query('select claim_specimen_card($1)',[q.card.id]), /verified correct answer required/);
        const wrong = (q.correctIndex + 1) % q.options.length;
        assert.deepEqual((await db.query('select * from submit_specimen_answer($1,$2)',[q.id,wrong])).rows,
          [{correct:false,is_new:false}]);
        await assert.rejects(db.query('select claim_specimen_card($1)',[q.card.id]), /verified correct answer required/);
      }
      await assert.rejects(db.exec(`insert into legends_private.specimen_correct_answers values ('${user1}','spec-soda-sealed',now())`), /permission denied/);
      await assert.rejects(db.exec(`insert into user_cards values ('${user1}','spec-soda-sealed',1)`), /permission denied/);
      await assert.rejects(db.query("select * from submit_specimen_answer('missing',0)"), /unknown specimen question/);
      for (const answer of [null,-1,99]) await assert.rejects(db.query('select * from submit_specimen_answer($1,$2)',[questions[0].id,answer]), /invalid answer index/);
      for (const q of questions) {
        assert.deepEqual((await db.query('select * from submit_specimen_answer($1,$2)',[q.id,q.correctIndex])).rows,
          [{correct:true,is_new:true}]);
        assert.deepEqual((await db.query('select * from submit_specimen_answer($1,$2)',[q.id,q.correctIndex])).rows,
          [{correct:true,is_new:false}]);
        assert.equal((await db.query('select claim_specimen_card($1) as awarded',[q.card.id])).rows[0].awarded,false);
      }
      await db.exec(`select set_config('request.jwt.claim.sub','${user2}',false);`);
      await assert.rejects(db.query("select claim_specimen_card('spec-soda-sealed')"), /verified correct answer required/);
      await db.exec("select set_config('request.jwt.claim.sub','',false);");
      await assert.rejects(db.query("select * from submit_specimen_answer('spec-soda-sealed',1)"), /auth required/);
      await assert.rejects(db.query("select claim_specimen_card('spec-soda-sealed')"), /auth required/);
      await db.exec('reset role; set role anon;');
      await assert.rejects(db.query("select * from submit_specimen_answer('spec-soda-sealed',1)"), /permission denied/);
      await assert.rejects(db.query("select claim_specimen_card('spec-soda-sealed')"), /permission denied/);
      await db.exec('reset role;');
      const { rows: cards } = await db.query('select * from user_cards');
      assert.equal(cards.length,17);
      assert.ok(cards.every(c => c.user_id === user1 && c.count === 1));
      assert.equal((await db.query('select count(*)::int as n from legends_private.specimen_correct_answers')).rows[0].n,17);
    } finally { await db.close(); }
  });
}

test('pack and campaign functions retain their original economy except specimen filtering', () => {
  const current = fs.readFileSync(new URL('20261012_specimen_cards.sql',migrations),'utf8');
  for (const [name,file] of [['open_pack','20260613_legend_cards.sql'],['campaign_loot','20260616085738_campaign_loot_card.sql']]) {
    const baseline = fs.readFileSync(new URL(file,migrations),'utf8');
    const body = (text) => {
      const start=text.toLowerCase().indexOf(`function public.${name}(`);
      const match=text.slice(start).match(/as (\$\w*\$)([\s\S]*?)\1/i);
      return match[2].replace(/--[^\n]*/g,'').replace(/and card_catalog.source = 'pack'/g,'')
        .replace(/where card_catalog.source = 'pack'/g,'').replace(/\s+/g,' ').trim();
    };
    assert.equal(body(current),body(baseline),name);
  }
});
