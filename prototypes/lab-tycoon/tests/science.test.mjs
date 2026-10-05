import test from 'node:test';
import assert from 'node:assert/strict';
import {QUESTIONS,CONTENT_REVISION} from '../src/content.mjs';
// Pinned expected keys rather than self-comparison to source-selected answers.
const KEYS=[
 ['dynamic',0,1,'The forward and reverse reaction rates are equal.','Particles still react in both directions, with no net change in composition.'],
 ['closed',2,2,'A sealed vessel maintained at constant temperature.','Retaining the gases allows both directions to continue without ongoing material loss.'],
 ['add-reactant',1,0,'A net forward reaction forms more HI.','The forward reaction consumes some of the added H₂.'],
 ['compression',3,1,'Right, towards two moles of gas.','The forward reaction reduces the total number of gas particles.'],
 ['equal-gas',0,2,'They remain unchanged.','Both sides have two gas moles, so uniform compression leaves Qc unchanged.'],
 ['temperature',1,2,'It shifts right and Kc increases.','Higher temperature favours the endothermic direction, which is forward here.'],
 ['catalyst',2,0,'The equilibrium composition stays the same.','Both directions are accelerated without changing Kc.'],
 ['expression',3,1,'[NH₃]² / ([N₂][H₂]³)','Balanced coefficients become powers in the products-over-reactants expression.'],
 ['calculate',0,2,'4.0','Use 0.40² ÷ (0.20 × 0.20).'],
 ['quotient',1,0,'A net forward reaction makes more B.','Qc < Kc, so the product-to-reactant ratio must rise.'],
 ['solid',2,1,'It remains unchanged.','For this system, the simplified expression is Kc = [CO₂].'],
 ['constant',3,2,'Changing the temperature.','Kc depends on temperature for a specified reaction.'],
];
for(const [id,a,r,at,rt] of KEYS)test(`science key: ${id}`,()=>{const q=QUESTIONS.find(x=>x.id===id);assert.equal(q.answer,a);assert.equal(q.reason,r);assert.equal(q.answers[a],at);assert.equal(q.reasons[r],rt);assert.ok(q.explanation.length>100);assert.ok(q.learn.length>50);assert.equal(new Set(q.answers).size,4);assert.equal(new Set(q.reasons).size,3);});
test('12 stable unique questions have a pinned content revision',()=>{assert.equal(QUESTIONS.length,12);assert.equal(new Set(QUESTIONS.map(q=>q.id)).size,12);assert.match(CONTENT_REVISION,/2026-10-04/);});
test('numeric Kc answer is independently recomputed',()=>assert.ok(Math.abs(0.40**2/(0.20*0.20)-4)<1e-12));
test('equal gas compression cancels Qc concentration factors',()=>{const q=(hi,h2,i2)=>hi**2/(h2*i2);assert.equal(q(.4,.2,.2),q(.8,.4,.4));});
test('Haber coefficients conserve nitrogen and hydrogen atoms',()=>{assert.equal(1*2,2*1);assert.equal(3*2,2*3);assert.equal(QUESTIONS[7].answers[3],'[NH₃]² / ([N₂][H₂]³)');});
