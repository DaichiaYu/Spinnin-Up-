import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyProfile, analyze, validateBody, toCSV, fromCSV, tendency, isStale, hasData } from '../../src/profile.js';
import { exById } from './helpers.mjs';

const body = { sex: 'f', age: 28, height: 160, weight: 55, waist: 68, hip: 92, neck: 31, arm_max_l: 26, arm_max_r: 24.5, thigh_max_l: 52, thigh_max_r: 52 };

test('必填只有性別、年紀、身高、體重', () => {
  const r = validateBody({});
  assert.deepEqual(Object.keys(r.errors).sort(), ['age', 'height', 'sex', 'weight']);
  assert.equal(validateBody({ sex: 'f', age: 28, height: 160, weight: 55 }).ok, true);
  assert.ok(validateBody({ sex: 'f', age: 28, height: 16, weight: 55 }).errors.height);
});

test('分析：BMI、腰圍身高比、腰臀比、體脂粗估、左右差', () => {
  const a = analyze(body);
  assert.equal(a.bmi, 21.5);
  assert.equal(a.whtr, 0.43);
  assert.equal(a.whr, 0.74);
  assert.equal(a.shape, 'pear');
  assert.ok(a.bodyfat > 15 && a.bodyfat < 35);
  assert.equal(a.sides[0].bigger, '左');
  assert.equal(a.sides[0].diff, 5.9);
  assert.equal(a.suggestAsym, true);            // 5% 以上建議勾選
  assert.equal(analyze({ ...body, arm_max_r: 25.5 }).suggestAsym, false);
  assert.equal(analyze({ sex: 'm', waist: 95, hip: 100 }).shape, 'apple');
});

test('只填必填也能分析，不會出錯', () => {
  const a = analyze({ sex: 'f', age: 28, height: 160, weight: 55 });
  assert.deepEqual(a.items.map((i) => i.id), ['bmi']);
});

test('表格：寫出去再讀回來，內容一樣', () => {
  const p = emptyProfile();
  p.body = { ...body, hand: 'r' };
  p.asym = { has: 'yes', where: ['upper', 'trunk'], mode: 'structural' };
  p.prefs = { freq: 'some', style: 'hold', avoid: ['hands'], strong: 'lower' };
  p.settings = { owned: 'mat|wall|towel', minutes: '15' };
  p.trials = { 'wall-sit': { how: 'stable', areas: ['quads'] } };
  p.adj = { 'wall-sit': { dose: 25, streak: 1 }, 'single-leg-stand': { dose: 20, L: 15, R: 20, streakL: -1, streakR: 1 }, 'forearm-plank': { stopped: true } };
  const now = new Date('2026-11-13T00:00:00Z');
  const back = fromCSV(toCSV(p, now));
  assert.deepEqual(back.warnings, []);
  assert.deepEqual(back.profile, { ...p, savedAt: now.toISOString() });
});

test('空白表格讀回來是空的；手動填中文選項和帶單位的數字也讀得懂', () => {
  const blank = toCSV(emptyProfile(), null);
  assert.equal(hasData(fromCSV(blank).profile), false);
  const filled = blank.replace('sex,性別,,', 'sex,性別,女,').replace('height,身高,,', 'height,身高,160公分,').replace('waist,腰圍,,', 'waist,腰圍,999,');
  const r = fromCSV(filled);
  assert.equal(r.profile.body.sex, 'f');
  assert.equal(r.profile.body.height, 160);
  assert.equal(r.profile.body.waist, undefined);
  assert.equal(r.warnings.length, 1);
});

test('不是我們的表格會被擋下來', () => {
  assert.equal(fromCSV('a,b,c\n1,2,3').profile, null);
});

test('傾向：先看試做，沒有試做才看自己填的', () => {
  const p = emptyProfile();
  p.prefs.strong = 'upper';
  assert.deepEqual([tendency(p, exById).weak, tendency(p, exById).source], ['lower', 'self']);
  p.trials = { 'wall-sit': { how: 'stable', areas: [] }, 'band-pull-apart-hold': { how: 'short', areas: [] } };
  const t = tendency(p, exById);
  assert.deepEqual([t.weak, t.source], ['upper', 'trial']);
  assert.equal(t.maxLevel.upper, 1);
  assert.equal(t.maxLevel.lower, 3);
});

test('檔案超過 8 週算太久', () => {
  const now = new Date('2026-11-13T00:00:00Z');
  assert.equal(isStale('2026-10-01T00:00:00Z', now), false);
  assert.equal(isStale('2026-09-01T00:00:00Z', now), true);
  assert.equal(isStale(null, now), false);
});
