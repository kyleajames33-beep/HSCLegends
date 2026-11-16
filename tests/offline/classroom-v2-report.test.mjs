import test from 'node:test';
import assert from 'node:assert/strict';
import { questionReportCsv } from '../../lib/classroom-v2/report.ts';

test('teacher CSV escapes text, labels unplayed questions and neutralizes spreadsheet formulas',()=>{
 const csv=questionReportCsv([{index:0,stem:'=1+1, "unsafe"',opened:true,responses:2,correct:1},{index:1,stem:'  @SUM(A1)',opened:false,responses:0,correct:0}]);
 assert.match(csv,/"'\=1\+1, ""unsafe"""/);
 assert.match(csv,/"'  @SUM\(A1\)"/);
 assert.match(csv,/"2","'  @SUM\(A1\)","no","0","0"/);
 assert.equal(csv.split('\r\n').length,4);
});
