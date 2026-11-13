import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorkout, trialItems, relatedAreas, TRIAL_IDS } from '../../src/generator.js';
import { totalSec } from '../../src/workout-engine.js';
import { emptyProfile } from '../../src/profile.js';
import { readFileSync } from 'node:fs';
import { exercises, exById, equipment } from './helpers.mjs';

const areaList = JSON.parse(readFileSync(new URL('../../data/areas.json', import.meta.url), 'utf8')).areas;
const areas = Object.fromEntries(areaList.map((a) => [a.id, a]));
const all = () => new Set(equipment.map((e) => e.id));
const gen = (over = {}) => generateWorkout({ exercises, exById, areas, owned: all(), minutes: 15, strict: true, goal: 'strength', focus: '', profile: emptyProfile(), ...over });
const regions = (r) => r.items.map((i) => exById[i.id].region);

test('嚴格時間：不超過；彈性：最多多 15%；時間越長動作越多', () => {
  for (const m of [10, 15, 20, 30]) {
    assert.ok(totalSec(gen({ minutes: m }).items, exById) <= m * 60, `strict ${m}`);
    assert.ok(totalSec(gen({ minutes: m, strict: false }).items, exById) <= m * 60 * 1.15, `flex ${m}`);
  }
  assert.ok(gen({ minutes: 30 }).items.length > gen({ minutes: 10 }).items.length);
});

test('暖身在最前面、收操在最後面，三個部位都有，每個動作都有理由', () => {
  const r = gen({ minutes: 20 });
  assert.equal(r.items[0].id, 'march-in-place');
  assert.equal(r.items.at(-1).id, 'supine-breathing');
  for (const reg of ['lower', 'core', 'upper']) assert.ok(regions(r).includes(reg), reg);
  for (const it of r.items) assert.ok(r.why[it.id], it.id);
  assert.equal(new Set(r.items.map((i) => i.id)).size, r.items.length);
});

test('同樣的輸入每次排出來都一樣', () => {
  assert.deepEqual(gen().items, gen().items);
});

test('沒有的器材、不想做的姿勢，不會排進來', () => {
  const r = gen({ owned: new Set(['wall', 'chair']), minutes: 20 });
  for (const it of r.items) for (const q of exById[it.id].equipment) assert.ok(['none', 'wall', 'chair'].includes(q), it.id);
  const p = emptyProfile(); p.prefs.avoid = ['hands', 'floor'];
  const r2 = gen({ profile: p, minutes: 30 });
  for (const it of r2.items) {
    assert.notEqual(exById[it.id].upper_load, 'full');
    assert.ok(!exById[it.id].equipment.includes('mat'), it.id);
  }
});

test('回報過疼痛的動作不排；回報調過的量會用上', () => {
  const p = emptyProfile();
  const first = gen({ minutes: 20 }).items.filter((i) => exById[i.id].category === 'train');
  p.adj[first[0].id] = { stopped: true };
  p.adj[first[1].id] = { dose: exById[first[1].id].dose.min };
  const r = gen({ profile: p, minutes: 20 });
  assert.ok(!r.items.some((i) => i.id === first[0].id));
  const again = r.items.find((i) => i.id === first[1].id);
  if (again) assert.equal(again.dose, exById[first[1].id].dose.min);
});

test('試做比較吃力的部位會多排', () => {
  const share = (r, reg) => r.items.filter((i) => exById[i.id].region === reg).length;
  const p = emptyProfile();
  p.trials = { 'wall-sit': { how: 'stable', areas: [] }, 'glute-bridge-hold': { how: 'stable', areas: [] }, 'band-pull-apart-hold': { how: 'form', areas: [] } };
  const r = gen({ profile: p, minutes: 30 });
  assert.ok(share(r, 'upper') >= share(gen({ minutes: 30 }), 'upper'));
  assert.ok(r.reasons.some((x) => x.includes('上半身')));
});

test('加強某個部位：主要練那裡的動作會排進來', () => {
  const r = gen({ goal: 'focus', focus: 'glutes', minutes: 20 });
  const hit = r.items.filter((i) => exById[i.id].primary.includes('glutes'));
  assert.ok(hit.length >= 2);
  assert.ok(r.why[hit[0].id].includes('臀部'));
});

test('輕鬆動一動：只有最簡單的動作、每個一組', () => {
  const r = gen({ goal: 'relax' });
  for (const it of r.items.filter((i) => exById[i.id].category === 'train')) {
    assert.equal(exById[it.id].level, 1);
    assert.equal(it.sets, 1);
  }
});

test('左右分開：會帶上兩邊不同的量', () => {
  const p = emptyProfile();
  p.asym = { has: 'yes', where: ['lower'], mode: 'separate' };
  p.adj['single-leg-stand'] = { dose: 25, L: 15, R: 25 };
  const it = gen({ profile: p, minutes: 30 }).items.find((i) => i.id === 'single-leg-stand');
  assert.deepEqual(it.sideDose, { L: 15, R: 25 });
});

test('試做課表：四個動作各一組；沒有彈力帶改用毛巾', () => {
  assert.deepEqual(trialItems(exById, all()).map((i) => i.id), TRIAL_IDS);
  const noBand = all(); noBand.delete('band');
  assert.ok(trialItems(exById, noBand).some((i) => i.id === 'towel-pull-apart-hold'));
});

test('相關部位', () => {
  assert.ok(relatedAreas('glutes', exercises).includes('hamstrings'));
});
