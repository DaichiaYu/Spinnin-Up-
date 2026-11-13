import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorkout, trialItems, relatedAreas, flexExtra, profileSignals, TRIAL_IDS } from '../../src/generator.js';
import { totalSec } from '../../src/workout-engine.js';
import { emptyProfile } from '../../src/profile.js';
import { readFileSync } from 'node:fs';
import { exercises, exById, equipment } from './helpers.mjs';

const read = (f) => JSON.parse(readFileSync(new URL('../../data/' + f, import.meta.url), 'utf8'));
const areas = Object.fromEntries(read('areas.json').areas.map((a) => [a.id, a]));
const facets = read('exercise-facets.json').exercises;
const all = () => new Set(equipment.map((e) => e.id));
const gen = (over = {}) => generateWorkout({ exercises, exById, areas, facets, owned: all(), minutes: 15, strict: true, effect: 'strength', where: 'all', focus: '', intensity: 'normal', place: 'any', sore: [], profile: emptyProfile(), ...over });
const train = (r) => r.items.filter((i) => exById[i.id].category === 'train');

test('時間：嚴格不超過；彈性最多多出畫面上寫的分鐘數；可以自訂', () => {
  for (const m of [5, 10, 15, 20, 30, 45, 12, 60]) {
    assert.ok(totalSec(gen({ minutes: m }).items, exById) <= m * 60, `strict ${m}`);
    assert.ok(totalSec(gen({ minutes: m, strict: false }).items, exById) <= (m + flexExtra(m)) * 60, `flex ${m}`);
    assert.ok(gen({ minutes: m }).items.length >= 2, `not empty ${m}`);
  }
  assert.equal(flexExtra(15), 2);
  assert.ok(gen({ minutes: 30 }).items.length > gen({ minutes: 10 }).items.length);
});

test('暖身在前、收操在後，三個部位都有，每個動作都有理由，結果固定', () => {
  const r = gen({ minutes: 20 });
  assert.equal(r.items[0].id, 'march-in-place');
  assert.equal(r.items.at(-1).id, 'supine-breathing');
  for (const reg of ['lower', 'core', 'upper']) assert.ok(r.items.some((i) => exById[i.id].region === reg), reg);
  for (const it of r.items) assert.ok(r.why[it.id], it.id);
  assert.deepEqual(gen({ minutes: 20 }).items, r.items);
});

test('優先順序 1：今天不舒服的地方先不練', () => {
  const r = gen({ sore: ['thigh'], minutes: 30 });
  for (const it of train(r)) assert.ok(!exById[it.id].primary.some((a) => ['quads', 'hamstrings', 'adductors'].includes(a)), it.id);
  assert.ok(!gen({ sore: ['calf'], minutes: 20 }).items.some((i) => exById[i.id].primary.includes('calves')), '暖身也要避開');
  assert.ok(r.reasons[0].includes('不舒服'));
});

test('優先順序 2：不能做的不排（器材、手撐、躺著、握力、手臂長度不同）', () => {
  const r = gen({ owned: new Set(['wall', 'chair']), minutes: 20 });
  for (const it of r.items) for (const q of exById[it.id].equipment) assert.ok(['none', 'wall', 'chair'].includes(q), it.id);
  const p = emptyProfile(); p.prefs.avoid = ['floor', 'grip']; p.structure.arm_len = 'r_short';
  const r2 = gen({ profile: p, minutes: 30 });
  for (const it of r2.items) {
    assert.notEqual(exById[it.id].upper_load, 'full');
    assert.ok(!facets[it.id].positions.some((x) => ['supine', 'prone', 'side_lying', 'plank'].includes(x)), it.id);
    assert.notEqual(facets[it.id].grip, 'required');
  }
  assert.ok(r2.reasons.some((x) => x.includes('手臂長度不同')));
});

test('優先順序 3：回報過疼痛的不排；試做吃力的動作類型排簡單版', () => {
  const p = emptyProfile();
  p.adj['wall-sit'] = { stopped: true };
  p.capability = { 'band-pull-apart-hold': { how: 'short', areas: [] }, 'glute-bridge-hold': { how: 'stable', areas: [] } };
  const r = gen({ profile: p, minutes: 30 });
  assert.ok(!r.items.some((i) => i.id === 'wall-sit'));
  for (const it of train(r)) if (exById[it.id].pattern === 'pull_horizontal') assert.equal(exById[it.id].level, 1);
  assert.ok(r.reasons.some((x) => x.includes('水平拉')));
  assert.ok(r.used.includes('試做結果'));
});

test('優先順序 4：今天很累會比選的強度再降一級', () => {
  const normal = gen({ minutes: 20 }), tired = gen({ minutes: 20, energy: 'tired' });
  const sets = (r) => train(r).reduce((a, i) => a + i.sets, 0);
  assert.ok(sets(tired) <= sets(normal));
  assert.ok(Math.max(...train(tired).map((i) => exById[i.id].level)) <= 2);
  assert.ok(tired.reasons.some((x) => x.includes('降一級')));
});

test('目標三個維度：效果 × 範圍 × 強度', () => {
  const lower = gen({ where: 'lower', minutes: 20 });
  const n = (r, reg) => train(r).filter((i) => exById[i.id].region === reg).length;
  assert.ok(n(lower, 'lower') > n(lower, 'upper'));
  const focus = gen({ where: 'area', focus: 'glutes', minutes: 20 });
  assert.ok(train(focus).filter((i) => exById[i.id].primary.includes('glutes')).length >= 2);
  for (const it of train(gen({ effect: 'recover' }))) { assert.equal(exById[it.id].level, 1); assert.equal(it.sets, 1); }
  assert.ok(gen({ effect: 'mobility' }).reasons.some((x) => x.includes('還沒有伸展')));
  const easy = gen({ intensity: 'easy', minutes: 20 }), push = gen({ intensity: 'push', minutes: 20 });
  assert.ok(Math.max(...train(easy).map((i) => i.sets)) <= 2);
  assert.ok(train(push).reduce((a, i) => a + i.sets, 0) >= train(easy).reduce((a, i) => a + i.sets, 0));
});

test('在床上做：只排床上做得了的', () => {
  const r = gen({ place: 'bed', minutes: 15 });
  assert.ok(train(r).length >= 2);
  for (const it of train(r)) assert.ok(facets[it.id].special.includes('bed_ok'), it.id);
});

test('自己注意到的地方：多排相關部位，理由寫明不是矯正；小腹不會變成多做腹部', () => {
  const p = emptyProfile(); p.observations = ['round_shoulders', 'belly'];
  const r = gen({ profile: p, minutes: 20 });
  assert.ok(train(r).some((i) => exById[i.id].primary.includes('upper_back')));
  assert.ok(r.reasons.some((x) => x.includes('圓肩') && x.includes('不是診斷或矯正')));
  assert.ok(r.reasons.some((x) => x.includes('小腹')));
  assert.deepEqual(Object.keys(profileSignals(p).boostAreas).sort(), ['rear_shoulders', 'upper_back']);
});

test('左右分開：會帶上兩邊不同的量', () => {
  const p = emptyProfile();
  p.asym = { has: 'yes', where: ['lower'], mode: 'separate' };
  p.adj['single-leg-stand'] = { dose: 25, L: 15, R: 25 };
  const it = gen({ profile: p, minutes: 30 }).items.find((i) => i.id === 'single-leg-stand');
  assert.deepEqual(it.sideDose, { L: 15, R: 25 });
});

test('試做課表：各一組；沒有彈力帶改用毛巾', () => {
  assert.deepEqual(trialItems(exById, all()).map((i) => i.id), TRIAL_IDS);
  const noBand = all(); noBand.delete('band');
  assert.ok(trialItems(exById, noBand).some((i) => i.id === 'towel-pull-apart-hold'));
  assert.ok(relatedAreas('glutes', exercises).includes('hamstrings'));
});
