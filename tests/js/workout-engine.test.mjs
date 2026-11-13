import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSteps, totalSec, regionShare, canDo, missingEquipment, swapSuggestions, newItem, SEC_PER_REP } from '../../src/workout-engine.js';
import { exById, equipment } from './helpers.mjs';

const item = (id, dose, sets, rest) => ({ id, dose, sets, rest });

test('每一組前面都有準備、休息或換邊', () => {
  const s = buildSteps([item('wall-sit', 20, 2, 40), item('single-leg-stand', 10, 1, 15)], exById);
  assert.deepEqual(s.map((x) => x.kind === 'ready' ? x.label : x.side || 'work'),
    ['準備', 'work', '休息', 'work', '休息', '左邊', '換邊', '右邊']);
  assert.equal(s[0].dur, 8);          // 第一個準備 8 秒
  assert.equal(s[2].dur, 40);         // 同一個動作的組間休息
  assert.equal(s[4].dur, 40);         // 換動作時用前一個動作的休息秒數（至少 8 秒）
  assert.equal(s[6].dur, 5);          // 換邊 5 秒
});

test('算次數的動作不計時，估時間一下算 SEC_PER_REP 秒', () => {
  const s = buildSteps([item('chair-sit-to-stand', 8, 1, 40)], exById);
  assert.equal(s[1].timed, false);
  assert.equal(s[1].dur, 8 * SEC_PER_REP);
  assert.equal(totalSec([item('chair-sit-to-stand', 8, 1, 40)], exById), 8 + 8 * SEC_PER_REP);
});

test('部位比例只算動作時間', () => {
  const r = regionShare([item('wall-sit', 20, 1, 40), item('prone-w-hold', 10, 1, 30)], exById);
  assert.equal(r.share.lower, 20);
  assert.equal(r.share.upper, 10);
  assert.equal(r.total, 30);
});

test('器材：沒有的器材就不能做，並列出缺什麼', () => {
  const owned = new Set(equipment.map((e) => e.id));
  assert.equal(canDo(exById['dumbbell-curl-hold'], owned), true);
  owned.delete('dumbbell');
  assert.equal(canDo(exById['dumbbell-curl-hold'], owned), false);
  assert.deepEqual(missingEquipment(exById['dumbbell-curl-hold'], owned, equipment), ['啞鈴']);
  assert.equal(canDo(exById['split-squat-hold'], new Set()), true);   // 不需要器材的動作永遠可以
});

test('替換建議不包含自己，也不重複', () => {
  const list = swapSuggestions(exById['tabletop-hold'], exById).map((e) => e.id);
  assert.ok(!list.includes('tabletop-hold'));
  assert.equal(new Set(list).size, list.length);
});

test('新加入的動作用資料庫的預設量', () => {
  assert.deepEqual(newItem(exById['wall-sit']), { id: 'wall-sit', dose: 20, sets: 2, rest: 40 });
});
