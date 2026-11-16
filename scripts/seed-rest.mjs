// Validate locally by default. An explicit apply and project URL are required
// before any request; the service key is read only for the apply path.
import fs from 'node:fs';
import { parseArgs } from 'node:util';
import { checkSeedInput } from './lib/seed-preflight.mjs';
import { seedTarget } from './lib/seed-target.mjs';

const { values } = parseArgs({ options: {
  apply: { type: 'boolean', default: false },
  help: { type: 'boolean', default: false },
  input: { type: 'string', default: 'out/questions.json' },
  'allow-shared-production': { type: 'boolean', default: false },
} });
if (values.help) {
  console.log('Usage: node scripts/seed-rest.mjs [--input FILE] [--apply] [--allow-shared-production]');
  console.log('The default is a local dry run. --apply requires SUPABASE_URL and SUPABASE_SERVICE_KEY.');
  process.exit(0);
}
if (values['allow-shared-production'] && !values.apply) throw new Error('SEED_TARGET: --allow-shared-production requires --apply');
const endpoint = values.apply ? seedTarget(process.env.SUPABASE_URL, { allowSharedProduction: values['allow-shared-production'] }) : null;
const key = values.apply ? process.env.SUPABASE_SERVICE_KEY : null;
if (values.apply && !key) throw new Error('SEED_TARGET: SUPABASE_SERVICE_KEY is required for --apply');

const CHUNK = 1000;
const src = values.input;
const auditPath = `${src}.audit.json`;
const { rows: candidates, warnings } = checkSeedInput(
  fs.readFileSync(src, 'utf8'),
  fs.existsSync(auditPath) ? JSON.parse(fs.readFileSync(auditPath, 'utf8')) : null,
);
warnings.forEach((warning) => console.warn(`SEED_PREFLIGHT: ${warning}`));
if (!values.apply) {
  console.log(`Validated ${candidates.length} question rows. Dry run only; no database requests sent.`);
  process.exit(0);
}
const rows = candidates.map((r) => ({
  id: r.id,
  subject: r.subject,
  year: r.year,
  module: r.module,
  lesson_id: r.lessonId,
  topic: r.topic,
  topics: r.topics,
  stem: r.stem,
  options: r.options,
  correct_index: r.correctIndex,
  explanation: r.explanation,
  difficulty: r.difficulty,
  bloom: r.bloom,
  quality: r.quality,
  source: r.source,
  syllabus_point: r.syllabusPoint,
}));

let done = 0;
for (let i = 0; i < rows.length; i += CHUNK) {
  const chunk = rows.slice(i, i + CHUNK);
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(chunk),
  });
  if (!res.ok) {
    console.error(`Chunk ${i}-${i + chunk.length} FAILED ${res.status}: ${(await res.text()).slice(0, 300)}`);
    process.exit(1);
  }
  done += chunk.length;
  console.log(`upserted ${done}/${rows.length}`);
}
console.log('done');
