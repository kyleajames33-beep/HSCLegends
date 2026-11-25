import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SPECIMEN_SETS } from '../../lib/specimens.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const questions = SPECIMEN_SETS.flatMap((s) => s.questions.map((q) => ({ ...q, subject: s.subject })));
const migration = fs.readFileSync(`${root}supabase/migrations/20261012_specimen_cards.sql`, 'utf8');
const imageExists = (name) => fs.existsSync(`${root}public/specimens/${name}.webp`);

test('question and card ids are unique', () => {
  assert.equal(new Set(questions.map((q) => q.id)).size, questions.length);
  assert.equal(new Set(questions.map((q) => q.card.id)).size, questions.length);
});

test('every question is answerable: distinct options and an in-range correct index', () => {
  for (const q of questions) {
    assert.ok(q.options.length >= 2, q.id);
    assert.equal(new Set(q.options).size, q.options.length, `${q.id} repeats an option`);
    assert.ok(Number.isInteger(q.correctIndex) && q.correctIndex >= 0 && q.correctIndex < q.options.length, q.id);
    for (const field of [q.stem, q.explanation, q.alt]) assert.ok(field.trim(), q.id);
  }
});

test('copy uses no em dashes', () => {
  assert.ok(!JSON.stringify(SPECIMEN_SETS).includes('—'));
  assert.ok(!migration.includes('—'));
});

test('every question image and card art ships, and no image is orphaned', () => {
  const used = new Set();
  for (const q of questions) {
    assert.ok(imageExists(q.image), `missing ${q.image}`);
    assert.ok(imageExists(q.card.art), `missing ${q.card.art}`);
    used.add(q.image).add(q.card.art);
  }
  const shipped = fs.readdirSync(`${root}public/specimens`).map((f) => f.replace(/\.webp$/, ''));
  assert.deepEqual(shipped.filter((f) => !used.has(f)), []);
});

test('migration seeds exactly the bank\'s cards with matching fields', () => {
  const rows = [...migration.matchAll(/\('(spec-[^']+)',\s*'([^']+)',\s*'([^']+)',\s*'([^']+)',\s*'image',\s*'([^']+)',\s*'([^']*)',\s*\d+,\s*'specimen'\)/g)];
  assert.equal(rows.length, questions.length);
  const byId = new Map(rows.map(([, id, name, subject, rarity, art, flavor]) => [id, { name, subject, rarity, art, flavor }]));
  for (const q of questions) {
    assert.deepEqual(byId.get(q.card.id), { name: q.card.name, subject: q.subject, rarity: q.card.rarity, art: q.card.art, flavor: q.card.flavor }, q.card.id);
  }
});

test('packs and campaign loot only pick pack cards', () => {
  const pickers = migration.match(/from public\.card_catalog[^;]*order by random\(\)/g) ?? [];
  assert.equal(pickers.length, 4);
  for (const p of pickers) assert.match(p, /source = 'pack'/);
});
