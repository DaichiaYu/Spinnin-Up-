import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyProfile, toCSV, fromCSV, PROFILE_VERSION } from '../../src/profile.js';
import { createWorkoutEntry, appendWorkoutEntry, validHistoryEntry } from '../../src/workout-history.js';
import { readFileSync } from 'node:fs';

const exercises = JSON.parse(readFileSync(new URL('../../data/exercises.json',import.meta.url),'utf8')).exercises;
const make = (p,extra={}) => createWorkoutEntry(p,{
  at:'2026-11-15T11:00:00.000Z',minutes:12,trial:false,
  plan:{effect:'recover',where:'all',minutes:15,place:'bed'},
  intentions:{head_neck:'relax'},
  exercises:[{id:'gentle-neck-turn',dose:30,sets:1,rest:0}],
  overall:{feeling:'eased',difficulty:'fine'},
  regionAnswers:{head_neck:{feeling:'lingering',difficulty:'hard'}},
  exerciseAnswers:{'gentle-neck-turn':{how:'stable',pain:false,areas:['neck_muscles']}},
  ...extra
});

test('訓練歷史資料有意圖、課表、事後感受和困難度',()=>{
  const p=emptyProfile();
  const row=make(p);
  assert.equal(validHistoryEntry(row),true);
  assert.equal(row.id,'w-000001');
  assert.equal(row.intentions.head_neck,'relax');
  assert.equal(row.report.overall.feeling,'eased');
  assert.equal(row.report.regions.head_neck.difficulty,'hard');
  assert.deepEqual(row.report.exercises['gentle-neck-turn'].areas,['neck_muscles']);
});

test('每筆完成只能新增、不能以相同 ID 覆蓋；原課表保持快照',()=>{
  const p=emptyProfile(), input=[{id:'gentle-neck-turn',dose:30,sets:1,rest:0}];
  const one=make(p,{exercises:input});
  appendWorkoutEntry(p,one);
  input[0].dose=90;
  one.exercises[0].dose=90;
  assert.equal(p.history[0].exercises[0].dose,30);
  assert.throws(()=>appendWorkoutEntry(p,one),/duplicate/);
  const two=make(p,{minutes:17,regionAnswers:{head_neck:{feeling:'eased'}}});
  appendWorkoutEntry(p,two);
  assert.equal(two.id,'w-000002');
  assert.equal(p.history.length,2);
  assert.equal(p.history[0].minutes,12);
});

test('第 3 版 CSV 保存多筆歷史，下一次匯入完整還原',()=>{
  const p=emptyProfile();
  p.basics={sex:'f',age:28,height:160,weight:55};
  appendWorkoutEntry(p,make(p));
  appendWorkoutEntry(p,make(p,{at:'2026-11-16T11:00:00.000Z',minutes:21,
    intentions:{foot:'mobility'},regionAnswers:{foot:{feeling:'none',difficulty:'easy'}}}));
  const csv=toCSV(p,new Date('2026-11-17T00:00:00Z'));
  assert.ok(csv.includes('hist.w-000001'));
  assert.ok(csv.includes('hist.w-000002'));
  const loaded=fromCSV(csv);
  assert.deepEqual(loaded.warnings,[]);
  assert.equal(loaded.profile.history.length,2);
  assert.deepEqual(loaded.profile.history,p.history);
  assert.equal(loaded.profile.basics.weight,55);
  assert.equal(PROFILE_VERSION,'3');
});

test('未填事後問卷或跳過，仍保存一筆完成的快照',()=>{
  const p=emptyProfile();
  const e=make(p,{skipped:true,overall:{},regionAnswers:{},exerciseAnswers:{}});
  appendWorkoutEntry(p,e);
  const loaded=fromCSV(toCSV(p,new Date('2026-11-15T12:00:00Z'))).profile;
  assert.equal(loaded.history[0].report.skipped,true);
  assert.equal(loaded.history[0].exercises.length,1);
});

test('舊版 CSV 仍能匯入，無效歷史列提示但不破壞身體資料',()=>{
  const old=['代號（不要改）,項目,你的值,單位或選項,說明',
    'meta.version,表格版本,2,,','sex,性別,女,,','age,年紀,28,,',
    'height,身高,160,,','weight,體重,55,,'].join('\\r\\n');
  const loaded=fromCSV(old);
  assert.deepEqual(loaded.warnings,[]);
  assert.deepEqual(loaded.profile.history,[]);
  assert.equal(loaded.profile.basics.weight,55);
  const broken=fromCSV(old+'\\r\\nhist.w-000001,訓練歷史,bad-encoded-record,,');
  assert.equal(broken.profile.basics.height,160);
  assert.equal(broken.profile.history.length,0);
  assert.ok(broken.warnings.some(x=>x.includes('歷史')));
});

test('UI 不在運動前詢問症狀，卻保留運動後紀錄',()=>{
  const ui=readFileSync(new URL('../../src/screens.js',import.meta.url),'utf8');
  assert.ok(!ui.includes('need-condition-'));
  assert.ok(ui.includes('need-intent-'));
  assert.ok(ui.includes('post-summary'));
  assert.ok(ui.includes('renderHistory'));
});
