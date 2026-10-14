import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import { lessonVideoFor } from '../../lib/lesson-videos.mjs';

const migrations = new URL('../../supabase/migrations/', import.meta.url);
test('Review, Exam and Topic RPCs return stored lesson IDs, including mismatched prefixes', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      alter default privileges grant execute on functions to anon;
      create schema auth;
      create function auth.uid() returns uuid language sql as $$ select '00000000-0000-0000-0000-000000000001'::uuid $$;
      create table questions(id text, subject text, topic text, topics text[], module text, stem text,
        options jsonb, correct_index smallint, explanation text, year smallint, difficulty smallint,
        excluded boolean, concise boolean, verified boolean, lesson_id text);
      create table review_cards(user_id uuid, question_id text, topic text, due_at date, interval_days int);
      create function get_due_reviews(int) returns int language sql as $$ select 1 $$;
      insert into questions values ('chem-y11-m2-l03-q1','chemistry','moles', '{}','module-2','Question',
        '["A","B"]',0,'Explanation',11,1,false,true,true,'chem-y11-m2-l05');
      insert into questions select 'chem-y11-m2-l05-q2',subject,topic,topics,module,stem,options,
        correct_index,explanation,year,difficulty,excluded,concise,verified,'chem-y11-m2-l03' from questions;
      insert into review_cards select auth.uid(), id, topic, current_date, 1 from questions;
    `);
    await db.exec(fs.readFileSync(new URL('20260613_topic_questions.sql', migrations),'utf8'));
    await db.exec(fs.readFileSync(new URL('20260613b_module_topics.sql', migrations),'utf8'));
    const file = fs.readdirSync(migrations).find(f => f.endsWith('_authoritative_lesson_ids.sql'));
    await db.exec(fs.readFileSync(new URL(file,migrations),'utf8'));
    const access = fs.readdirSync(migrations).find(f => f.endsWith('_restrict_review_rpc_access.sql'));
    await db.exec(fs.readFileSync(new URL(access,migrations),'utf8'));
    await db.exec('grant usage on schema auth to authenticated, anon; set role authenticated;');
    for (const rpc of ["get_due_reviews()", "get_exam_questions('chemistry',11::smallint)", "get_module_questions('chemistry','module-2')"]) {
      const { rows } = await db.query(`select * from ${rpc}`);
      assert.equal(rows.length, 2, rpc);
      const wrongPrefix = rows.find(q => q.id.includes('l03-q1'));
      assert.equal(wrongPrefix.lesson_id,'chem-y11-m2-l05');
      assert.equal(lessonVideoFor(wrongPrefix),null);
      assert.equal(lessonVideoFor(rows.find(q => q.id.includes('l05-q2')))?.youtubeId,'Qjw7Rx5NOOQ');
    }
    await db.exec('reset role; set role anon;');
    await assert.rejects(db.query('select * from get_due_reviews()'), /permission denied/);
    assert.equal((await db.query("select * from get_module_questions('chemistry','module-2')")).rows.length,2);
  } finally { await db.close(); }
});
