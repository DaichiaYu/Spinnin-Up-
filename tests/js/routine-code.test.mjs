import test from 'node:test';
import assert from 'node:assert/strict';
import { encode, decode, ROUTINE_VERSION } from '../../src/routine-code.js';
import { exById } from './helpers.mjs';

test('版本號維持 1，已經發出去的連結才讀得回來', () => {
  assert.equal(ROUTINE_VERSION, '1');
});

test('編碼後再解碼，內容一樣', () => {
  const items = [{ id: 'wall-sit', dose: 25, sets: 2, rest: 40 }, { id: 'step-up', dose: 6, sets: 3, rest: 30 }];
  const code = encode(items, { every: 2, count: 10 });
  assert.equal(code, '1;wall-sit.25.2.40~step-up.6.3.30;2.10');
  const r = decode(code, exById);
  assert.deepEqual(r.items, items);
  assert.deepEqual(r.freq, { every: 2, count: 10 });
  assert.equal(r.lost, 0);
});

test('舊格式的連結（第 2 階段發出去的）仍讀得回來', () => {
  const r = decode('1;march-in-place.60.1.0~wall-sit.20.2.40~glute-bridge-hold.20.2.30;2.10', exById);
  assert.equal(r.items.length, 3);
  assert.equal(r.items[1].dose, 20);
});

test('不認得的動作略過，超出範圍的數字拉回範圍內', () => {
  const r = decode('1;nope.20.2.30~wall-sit.999.9.999;0.0', exById);
  assert.equal(r.lost, 1);
  assert.deepEqual(r.items[0], { id: 'wall-sit', dose: exById['wall-sit'].dose.max, sets: 6, rest: 180 });
  assert.deepEqual(r.freq, { every: 2, count: 10 });
});

test('不是版本 1 或空的代碼回傳 null；空課表編成空字串', () => {
  assert.equal(decode('2;wall-sit.20.2.40;2.10', exById), null);
  assert.equal(decode('', exById), null);
  assert.equal(encode([], { every: 2, count: 10 }), '');
});
