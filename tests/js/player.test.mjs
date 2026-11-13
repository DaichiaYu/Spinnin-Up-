import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlayer } from '../../src/player.js';
import { buildSteps } from '../../src/workout-engine.js';
import { exById } from './helpers.mjs';

function make(items) {
  const log = [];
  const p = createPlayer(buildSteps(items, exById), {
    onEnter: (s, pos, fresh) => log.push(['enter', pos, s.kind, fresh]),
    onWorkEnd: () => log.push(['end']),
    onSecond: (s, sec) => log.push(['sec', sec]),
    onFinish: () => log.push(['finish'])
  });
  return { p, log };
}
const W = [{ id: 'wall-sit', dose: 10, sets: 1, rest: 5 }, { id: 'chair-sit-to-stand', dose: 5, sets: 1, rest: 5 }];

test('照時間往下走：準備 8 秒 → 動作 10 秒 → 休息', () => {
  const { p, log } = make(W);
  p.start(0);
  assert.equal(p.state.pos, 0);
  p.tick(7999); assert.equal(p.state.pos, 0);
  p.tick(8000); assert.equal(p.state.pos, 1);
  p.tick(18000); assert.equal(p.state.pos, 2);
  assert.ok(log.some((x) => x[0] === 'end'));
});

test('算次數的動作會停著等，按下一步才繼續', () => {
  const { p } = make(W);
  p.start(0);
  p.tick(8000 + 10000 + 8000);             // 到椅子坐站
  assert.equal(p.current().kind, 'work');
  assert.equal(p.current().timed, false);
  p.tick(999999);
  assert.equal(p.state.pos, 3);            // 還停在這裡
  p.next(1000000);
  assert.equal(p.state.done, true);
});

test('暫停時時間不走，繼續後接著算', () => {
  const { p } = make(W);
  p.start(0);
  p.togglePause(3000);
  assert.equal(p.remainingMs(50000), 5000);
  p.tick(50000); assert.equal(p.state.pos, 0);
  p.togglePause(50000);
  p.tick(54999); assert.equal(p.state.pos, 0);
  p.tick(55000); assert.equal(p.state.pos, 1);
});

test('從背景回來：一次補上經過的步驟，補的步驟標成不是剛發生（不唸）', () => {
  const { p, log } = make([{ id: 'single-leg-stand', dose: 10, sets: 1, rest: 15 }, { id: 'wall-sit', dose: 10, sets: 1, rest: 5 }]);
  p.start(0);
  log.length = 0;
  p.tick(8000 + 10000 + 5000 + 10000 + 3000);   // 準備、左、換邊、右 都過了，在下一個休息
  assert.equal(p.state.pos, 4);
  const enters = log.filter((x) => x[0] === 'enter');
  assert.deepEqual(enters.map((x) => x[3]), [false, false, false, false]);
  assert.ok(!log.some((x) => x[0] === 'end'));   // 補的時候不響結束音
});

test('上一步：在動作中回到它前面的準備；在休息中回到上一個動作', () => {
  const { p } = make(W);
  p.start(0); p.tick(9000);
  assert.equal(p.state.pos, 1);
  p.prev(9000); assert.equal(p.state.pos, 0);
  p.next(9000); p.next(9000); assert.equal(p.state.pos, 2);
  p.prev(9000); assert.equal(p.state.pos, 0);
});

test('倒數每秒只通知一次', () => {
  const { p, log } = make(W);
  p.start(0); log.length = 0;
  p.tick(100); p.tick(150); p.tick(1000); p.tick(1100);
  assert.deepEqual(log.filter((x) => x[0] === 'sec').map((x) => x[1]), [7]);
});
