import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, stepDose, applyAdj } from '../../src/feedback.js';
import { exById } from './helpers.mjs';

const wall = exById['wall-sit'], stand = exById['single-leg-stand'];

test('穩定做完加一小步，姿勢跑掉或做不到減一小步', () => {
  assert.equal(evaluate(wall, { dose: 20 }, { how: 'stable', areas: ['quads'] }).adj.dose, 25);
  assert.equal(evaluate(wall, { dose: 20 }, { how: 'form', areas: ['quads'] }).adj.dose, 15);
  assert.equal(evaluate(wall, { dose: 20 }, { how: 'short', areas: [] }).adj.dose, 15);
});

test('連續三次同方向才調兩步，換方向就重新算', () => {
  let s = stepDose(wall, 20, 'stable', 0); assert.deepEqual([s.dose, s.streak], [25, 1]);
  s = stepDose(wall, s.dose, 'stable', s.streak); assert.deepEqual([s.dose, s.streak], [30, 2]);
  s = stepDose(wall, s.dose, 'stable', s.streak); assert.deepEqual([s.dose, s.streak], [40, 3]);
  s = stepDose(wall, s.dose, 'form', s.streak); assert.deepEqual([s.dose, s.streak], [35, -1]);
});

test('不會超出建議範圍', () => {
  assert.equal(stepDose(wall, wall.dose.max, 'stable', 5).dose, wall.dose.max);
  assert.equal(stepDose(wall, wall.dose.min, 'short', -5).dose, wall.dose.min);
});

test('在該注意的地方有感覺：不加量，並給出對應的說明', () => {
  const r = evaluate(wall, { dose: 20 }, { how: 'stable', areas: ['knee'] });
  assert.equal(r.adj.dose, 20);
  assert.ok(r.messages.some((m) => m.includes('膝蓋') || m.includes('knee')));
  assert.ok(r.messages.some((m) => m.includes('先不加量')));
});

test('沒有在應該的地方有感覺：不加量', () => {
  const r = evaluate(wall, { dose: 20 }, { how: 'stable', areas: ['calves'] });
  assert.equal(r.adj.dose, 20);
});

test('回報疼痛是停掉，不是調整', () => {
  const r = evaluate(wall, { dose: 20 }, { how: 'stable', areas: ['quads'], pain: true });
  assert.equal(r.adj.stopped, true);
  assert.equal(r.adj.dose, undefined);
  assert.ok(r.messages[0].includes('物理治療師'));
});

test('已經是最少的量還做不到，有簡單版就改排簡單版', () => {
  const hard = exById['split-squat-hold'];
  const r = evaluate(hard, { dose: hard.dose.min }, { how: 'short', areas: [] });
  assert.equal(r.adj.avoid, true);
});

test('左右分開回報：兩邊各自調整', () => {
  const r = evaluate(stand, { dose: 20 }, { howL: 'form', howR: 'stable', areas: ['glute_side'] });
  assert.deepEqual([r.adj.L, r.adj.R, r.adj.dose], [15, 25, 25]);
  const it = applyAdj({ id: stand.id, dose: 20, sets: 2, rest: 15 }, stand, r.adj, true);
  assert.deepEqual(it.sideDose, { L: 15, R: 25 });
  assert.equal(applyAdj({ id: stand.id, dose: 20, sets: 2, rest: 15 }, stand, r.adj, false).sideDose, undefined);
});

test('做不到時有填實際做到幾秒，下次就用實際做到的量', () => {
  assert.equal(evaluate(wall, { dose: 30 }, { how: 'short', actual: 18, areas: [] }).adj.dose, 15);
});
