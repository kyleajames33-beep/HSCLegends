import test from 'node:test';
import assert from 'node:assert/strict';
import { LESSON_VIDEOS, lessonVideoFor } from '../../lib/lesson-videos.mjs';

test('every mapped video has a lesson id key, an 11-char YouTube id and a title', () => {
  for (const [lessonId, v] of Object.entries(LESSON_VIDEOS)) {
    assert.match(lessonId, /^[a-z]+-y1[12]-m\d+-l\d+$/, lessonId);
    assert.match(v.youtubeId, /^[A-Za-z0-9_-]{11}$/, lessonId);
    assert.ok(v.title.trim(), lessonId);
    assert.ok(!v.title.includes('—'), `${lessonId} title uses an em dash`);
  }
});

test('stored lesson_id wins over the question id prefix', () => {
  // Real source case: lesson03.review.json rows carry l05-prefixed ids.
  assert.equal(lessonVideoFor({ id: 'chem-y11-m2-l05-mc-003', lesson_id: 'chem-y11-m2-l03' })?.youtubeId, 'Qjw7Rx5NOOQ');
  assert.equal(lessonVideoFor({ id: 'chem-y11-m2-l03-qb-01', lesson_id: 'chem-y11-m2-l05' }), null);
});

test('falls back to the question id prefix when lesson_id is absent', () => {
  assert.equal(lessonVideoFor({ id: 'chem-y11-m2-l13-mc-002' })?.url, 'https://youtu.be/-TLemAVWFvs');
  assert.equal(lessonVideoFor({ id: 'chem-y11-m2-l1-qb-01' }), null);
  assert.equal(lessonVideoFor({ id: 'chem-y11-m2-l130-qb-01' }), null);
  assert.equal(lessonVideoFor({ id: 'synthetic-q1' }), null);
  assert.equal(lessonVideoFor({}), null);
});
