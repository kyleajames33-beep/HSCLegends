'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MAX_IMPORT_BYTES, validateTeacherQuestions, type TeacherImportResult } from '@/lib/teacher-question-import.mjs';
import { arenaQuestionsFromDraft } from '@/lib/solo-arena';
import { ARENA_DRAFT_KEY } from '@/lib/solo-arena-recovery';

const TEMPLATE = 'id,stem,option_a,option_b,option_c,option_d,answer,explanation,subject,year,module,syllabus_version,source\nexample-1,"Replace this example question.","First choice","Second choice",,,B,TODO,chemistry,12,module-5,2017,Replace with your source\n';

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function QuestionImportPage() {
  const router = useRouter();
  const [result, setResult] = useState<TeacherImportResult | null>(null);
  const [filename, setFilename] = useState('');
  const [error, setError] = useState('');
  const [reading, setReading] = useState(false);
  const [reviewedRows, setReviewedRows] = useState<Set<number>>(() => new Set());
  const request = useRef(0);
  useEffect(() => () => { request.current++; }, []);

  async function selectFile(file: File | undefined) {
    const generation = ++request.current;
    setResult(null); setError(''); setReviewedRows(new Set()); setFilename(file?.name ?? '');
    if (!file) { setReading(false); return; }
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (extension !== 'csv' && extension !== 'json') { setError('Choose a CSV or JSON file.'); setReading(false); return; }
    if (file.size > MAX_IMPORT_BYTES) { setError('File is too large. Choose a file under 1 MB.'); setReading(false); return; }
    setReading(true);
    try {
      const text = await file.text();
      if (generation !== request.current) return;
      setResult(validateTeacherQuestions(text, extension));
    } catch (reason) {
      if (generation === request.current) setError(reason instanceof Error ? reason.message : 'Could not read that file.');
    } finally { if (generation === request.current) setReading(false); }
  }

  function playDraft() {
    if (!result?.draft) return;
    const raw = JSON.stringify(result.draft);
    if (!arenaQuestionsFromDraft(raw)) { setError('This draft is too large to preview in the arena. You can still download it.'); return; }
    try { sessionStorage.setItem(ARENA_DRAFT_KEY, raw); }
    catch { setError('Browser storage is unavailable. Download the draft or enable storage to preview it.'); return; }
    router.push('/arena?draft=1');
  }

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      <Link href="/games" className="text-sm font-semibold text-plum underline">← Games</Link>
      <h1 className="mt-5 text-3xl font-black text-ink">Prepare questions</h1>
      <p className="mt-3 max-w-2xl leading-relaxed text-inksoft">Check a CSV or JSON file and download a draft for review. Files stay on this device; this tool does not upload questions or start a classroom game.</p>
      <div className="lg-card mt-6 p-5">
        <label htmlFor="question-file" className="block font-display font-bold text-ink">Question file</label>
        <input id="question-file" type="file" accept=".csv,.json,application/json,text/csv" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; void selectFile(file); }} className="mt-3 block w-full text-sm text-inksoft file:mr-3 file:rounded-lg file:border-0 file:bg-plum file:px-4 file:py-2 file:font-bold file:text-white" />
        <p className="mt-3 text-sm text-inksoft">Up to 20 questions, 1 MB. Each needs a correct answer, explanation, subject, year, module, syllabus version and source.</p>
        <button type="button" onClick={() => download('hsc-question-template.csv', TEMPLATE, 'text/csv;charset=utf-8')} className="mt-3 font-semibold text-plum underline">Download CSV template</button>
        <p className="mt-1 text-xs text-inksoft">Replace the example and its TODO before checking the file.</p>
      </div>
      <p className="mt-4 text-sm text-inksoft">Structural checks do not verify scientific accuracy, module mapping or syllabus version. Module and syllabus fields accept the text you provide; an educator must verify them. Every draft remains unreviewed. The downloaded draft contains answer keys: share it only with teachers and reviewers. Images and diagram-dependent questions are not supported yet.</p>
      {reading && <p role="status" className="mt-5 text-inksoft">Reading {filename}…</p>}
      {error && <p role="alert" className="mt-5 rounded-xl border border-brick p-4 text-brick">{error}</p>}
      {result && <section aria-labelledby="import-results" className="mt-7">
        <h2 id="import-results" className="text-xl font-bold text-ink">{result.valid ? 'Structure checks passed' : 'Fix these questions'}</h2>
        <p className="mt-1 text-sm text-inksoft">{result.results.length} {result.results.length === 1 ? 'question' : 'questions'} in {filename}. Review status: unreviewed.</p>
        {result.draft && <p className="mt-2 text-sm text-inksoft" role="status">{reviewedRows.size} of {result.results.length} checked in this session. Checks are not saved or included in the draft.</p>}
        <ol className="mt-4 space-y-3">{result.results.map(item => <li key={item.row} className="lg-card p-4">
          <p className="font-bold text-ink">Question {item.row}{item.question ? ` · ${item.question.stem}` : ''}</p>
          {item.errors.length ? <ul className="mt-2 list-disc pl-5 text-sm text-brick">{item.errors.map((message, index) => <li key={`${message}-${index}`}>{message}</li>)}</ul> : <p className="mt-1 text-sm text-leaf">Structure OK · educator review needed</p>}
          {item.question && <details className="mt-3 text-sm text-inksoft">
            <summary className="cursor-pointer font-semibold text-plum">Review question {item.row} and answer</summary>
            <ol className="mt-3 space-y-1">{item.question.options.map((option, index) => <li key={index}>{String.fromCharCode(65 + index)}. {option}{index === item.question?.correctIndex ? ' (marked correct)' : ''}</li>)}</ol>
            <p className="mt-3"><strong>Explanation:</strong> {item.question.explanation}</p>
            <p className="mt-2"><strong>Course:</strong> {item.question.subject}, Year {item.question.year}, {item.question.module}</p>
            <p className="mt-2"><strong>Syllabus version:</strong> {item.question.syllabusVersion}</p>
            <p className="mt-2"><strong>Source:</strong> {item.question.source}</p>
            {result.draft && <label className="mt-3 flex items-start gap-2"><input type="checkbox" checked={reviewedRows.has(item.row)} onChange={event => { const checked = event.target.checked; setReviewedRows(previous => { const next = new Set(previous); if (checked) next.add(item.row); else next.delete(item.row); return next; }); }} /><span>I checked the answer, explanation, course mapping and source for this question.</span></label>}
          </details>}
        </li>)}</ol>
        {result.draft && <div className="mt-5 flex flex-wrap gap-3"><button type="button" onClick={playDraft} className="lg-btn lg-btn-primary min-h-12 px-5 py-3">Preview in solo arena</button><button type="button" onClick={() => download('hsc-question-draft.json', JSON.stringify(result.draft, null, 2), 'application/json')} className="lg-btn min-h-12 border border-rule bg-panel px-5 py-3 text-ink">Download unreviewed draft</button></div>}
        {result.draft && <p className="mt-3 text-sm text-inksoft">Solo preview stores the draft and answer keys in this browser tab. It does not publish questions or create a classroom game.</p>}
      </section>}
    </main>
  );
}
