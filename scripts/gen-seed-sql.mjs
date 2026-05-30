// Generate batched INSERT SQL for the questions table from out/questions.json.
// Postgres standard_conforming_strings is on → backslashes are literal (LaTeX safe);
// only single quotes need doubling.
import fs from 'node:fs';
import path from 'node:path';

const SRC = process.argv[2] || 'out/questions.json';
const OUTDIR = process.argv[3] || 'out/seed';
const BATCH = Number(process.argv[4] || 800);

const rows = JSON.parse(fs.readFileSync(SRC, 'utf8'));
fs.rmSync(OUTDIR, { recursive: true, force: true });
fs.mkdirSync(OUTDIR, { recursive: true });

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const arr = (a) => (a.length ? `ARRAY[${a.map(q).join(',')}]::text[]` : `'{}'::text[]`);
const jsonb = (v) => `${q(JSON.stringify(v))}::jsonb`;

const cols =
  '(id,subject,year,module,lesson_id,topic,topics,stem,options,correct_index,explanation,difficulty,bloom,quality,source,syllabus_point)';

let files = 0;
for (let i = 0; i < rows.length; i += BATCH) {
  const slice = rows.slice(i, i + BATCH);
  const values = slice
    .map(
      (r) =>
        `(${q(r.id)},${q(r.subject)},${r.year},${q(r.module)},${q(r.lessonId)},${q(r.topic)},` +
        `${arr(r.topics)},${q(r.stem)},${jsonb(r.options)},${r.correctIndex},${q(r.explanation)},` +
        `${r.difficulty},${q(r.bloom)},${q(r.quality)},${q(r.source)},` +
        `${r.syllabusPoint == null ? 'null' : q(r.syllabusPoint)})`
    )
    .join(',\n');
  const sql = `insert into public.questions ${cols} values\n${values}\non conflict (id) do nothing;`;
  const n = String(files).padStart(2, '0');
  fs.writeFileSync(path.join(OUTDIR, `batch-${n}.sql`), sql);
  files++;
}
console.log(`Wrote ${files} batch files (${rows.length} rows, ${BATCH}/batch) to ${OUTDIR}`);
