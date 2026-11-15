import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorkout } from '../../src/generator.js';
import { CONDITIONS, REGION_INTENTS, normalizeNeeds, regionPolicy } from '../../src/recovery.js';
import { emptyProfile } from '../../src/profile.js';
import { totalSec } from '../../src/workout-engine.js';
import { exercises, exById, equipment } from './helpers.mjs';
import { readFileSync } from 'node:fs';

const read = name => JSON.parse(readFileSync(new URL('../../data/' + name, import.meta.url),'utf8'));
const areas = Object.fromEntries(read('areas.json').areas.map(x=>[x.id,x]));
const facets = read('exercise-facets.json').exercises;
const owned = () => new Set(equipment.map(x=>x.id));
const gen = (over = {}) => generateWorkout({
  exercises, exById, areas, facets, owned: owned(), minutes: 15, strict: true,
  effect: 'recover', where:'all', focus:'', intensity:'normal', energy:'normal',
  fatigue:'none', place:'any', regionNeeds:{}, sore:[], profile:emptyProfile(),
  ...over
});
const ids = r => r.items.map(i=>i.id);

test('今天的狀態與意圖有明確合法選項',()=>{
  assert.ok(CONDITIONS.tight && CONDITIONS.pain && CONDITIONS.unsure);
  assert.ok(REGION_INTENTS.relax && REGION_INTENTS.avoid);
  assert.equal(regionPolicy({condition:'tight',intent:'relax'}),'target_gentle');
  assert.equal(regionPolicy({condition:'pain',intent:'relax'}),'avoid');
  assert.equal(regionPolicy({condition:'unsure',intent:'gentle'}),'avoid');
  assert.deepEqual(normalizeNeeds({},['head_neck']),{head_neck:{condition:'unsure',intent:'avoid'}});
});

test('緊繃＋想放鬆頸肩，真的排頸肩活動，不以肌力動作充數',()=>{
  const r=gen({regionNeeds:{
    head_neck:{condition:'tight',intent:'relax'},
    shoulder_chest:{condition:'tired',intent:'gentle'}
  }});
  assert.ok(ids(r).includes('gentle-neck-turn'), ids(r));
  assert.ok(ids(r).includes('gentle-shoulder-circles'), ids(r));
  assert.ok(!ids(r).includes('gentle-ankle-pumps'), '不能拿無關的腳踝活動填時間');
  assert.ok(r.items.every(it=>exById[it.id].category==='mobility'));
  assert.ok(r.reasons.some(x=>x.includes('有對應動作')));
  assert.ok(totalSec(r.items,exById)<=15*60);
});

test('明確疼痛＋想放鬆同一區，不能繞過排除；其他區可以活動',()=>{
  const r=gen({regionNeeds:{head_neck:{condition:'pain',intent:'relax'}}});
  assert.ok(!ids(r).includes('gentle-neck-turn'));
  assert.ok(!ids(r).includes('gentle-shoulder-circles'));
  assert.ok(ids(r).includes('gentle-ankle-pumps'));
  assert.ok(r.reasons.some(x=>x.includes('明確疼痛')));
});

test('想放鬆腳踝時，優先安排腳踝；完全避開則不排',()=>{
  const a=gen({regionNeeds:{foot:{condition:'stiff',intent:'mobility'}}});
  assert.equal(a.items[0].id,'gentle-ankle-pumps');
  assert.ok(a.items.every(it=>it.id==='gentle-ankle-pumps'));
  const b=gen({regionNeeds:{foot:{condition:'tired',intent:'avoid'}}});
  assert.ok(!ids(b).includes('gentle-ankle-pumps'));
});

test('混合模式：其他區正常練，指定放鬆區改做溫和活動',()=>{
  const r=gen({effect:'strength',minutes:20,regionNeeds:{
    shoulder_chest:{condition:'tight',intent:'relax'}
  }});
  assert.ok(r.items.some(it=>exById[it.id].category==='mobility'));
  assert.ok(r.items.some(it=>exById[it.id].category==='train'));
  for(const it of r.items.filter(it=>exById[it.id].category==='train'))
    assert.ok(!exById[it.id].primary.some(a=>['upper_back','rear_shoulders','shoulders','chest','lats'].includes(a)),it.id);
  assert.ok(totalSec(r.items,exById)<=20*60);
  assert.ok(r.reasons.some(x=>x.includes('低負荷活動')));
});

test('床上模式只用通過 bed_ok 的溫和動作，不超時間',()=>{
  const r=gen({place:'bed',minutes:5});
  assert.ok(r.items.length);
  assert.ok(r.items.every(it=>facets[it.id].special.includes('bed_ok')));
  assert.ok(totalSec(r.items,exById)<=300);
});

test('一般訓練仍會避開明確疼痛區，其他部位可以練',()=>{
  const r=gen({effect:'strength',regionNeeds:{thigh:{condition:'pain',intent:'relax'}},minutes:30});
  const trained=r.items.filter(it=>exById[it.id].category==='train');
  assert.ok(trained.length);
  for(const it of trained)
    assert.ok(!exById[it.id].primary.some(x=>['quads','hamstrings','adductors'].includes(x)),it.id);
});

test('沒有合適的恢復動作就明白說，不能偷塞肌力動作',()=>{
  const r=gen({owned:new Set(['none']), place:'any', regionNeeds:{
    head_neck:{condition:'pain',intent:'avoid'},
    shoulder_chest:{condition:'pain',intent:'avoid'},
    foot:{condition:'pain',intent:'avoid'},
    calf:{condition:'pain',intent:'avoid'},
    trunk:{condition:'pain',intent:'avoid'},
    pelvis:{condition:'pain',intent:'avoid'}
  }});
  assert.equal(r.items.length,0);
  assert.ok(r.reasons.some(x=>x.includes('沒有符合')));
});
