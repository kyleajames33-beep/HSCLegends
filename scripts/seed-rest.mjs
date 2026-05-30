// Bulk-load out/questions.json into Supabase via PostgREST.
// Key read from SUPABASE_SERVICE_KEY env (never persisted). Upserts on id.
import fs from 'node:fs';

const URL = 'https://rerfrskojieacxthfavb.supabase.co/rest/v1/questions';
const KEY = process.env.SUPABASE_SERVICE_KEY;
if (!KEY) throw new Error('SUPABASE_SERVICE_KEY not set');

const CHUNK = 1000;
const rows = JSON.parse(fs.readFileSync('out/questions.json', 'utf8')).map((r) => ({
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
  const res = await fetch(URL, {
    method: 'POST',
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
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
