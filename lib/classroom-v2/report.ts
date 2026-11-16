import type { QuestionReport } from './index';

/** CSV is an aggregate, not an individual assessment or a content review. */
export function questionReportCsv(report: readonly QuestionReport[]): string {
  const cell=(value:string|number|boolean)=>{
    let text=String(value);
    // Protect spreadsheet users from formulas embedded in teacher-supplied text.
    if(/^[\s\u0000-\u001f]*[=+\-@]/u.test(text))text=`'${text}`;
    return `"${text.replace(/"/g,'""')}"`;
  };
  return [
    ['question','stem','played','submitted','correct'],
    ...report.map(q=>[q.index+1,q.stem,q.opened?'yes':'no',q.responses,q.correct]),
  ].map(row=>row.map(cell).join(',')).join('\r\n')+'\r\n';
}
