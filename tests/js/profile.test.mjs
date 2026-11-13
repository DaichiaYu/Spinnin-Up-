import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyProfile, analyze, validateValues, basicsDone, toCSV, fromCSV, tendency, isStale, hasData, FIELDS, OBSERVATIONS, REGIONS, regionCount, isRequired } from '../../src/profile.js';
import { exById } from './helpers.mjs';

function sample() {
  const p = emptyProfile();
  p.basics = { sex: 'f', age: 28, height: 160, weight: 55 };
  p.measurements = { waist: 68, hip: 92, neck: 31, arm_max_l: 26, arm_max_r: 24.5, thigh_max_l: 52, thigh_max_r: 52 };
  return p;
}

test('必填只有性別、年紀、身高、體重', () => {
  assert.deepEqual(FIELDS.filter(isRequired).map((f) => f.key).sort(), ['age', 'height', 'sex', 'weight']);
  assert.deepEqual(Object.keys(validateValues({}).errors).sort(), ['age', 'height', 'sex', 'weight']);
  assert.equal(basicsDone(sample()), true);
  assert.ok(validateValues({ sex: 'f', age: 28, height: 16, weight: 55 }).errors.height);
});

test('每個欄位都屬於某一層；身體區域的欄位分基本和更多', () => {
  for (const f of FIELDS) {
    assert.ok(['basics', 'measurements', 'structure'].includes(f.layer), f.key);
    assert.ok(['basic', 'more'].includes(f.level), f.key);
    if (f.layer !== 'basics') assert.ok(REGIONS.some((r) => r.id === f.region), f.key);
  }
  for (const r of REGIONS) assert.ok(OBSERVATIONS.some((o) => o.region === r.id), r.id);
});

test('欄位說明不再把圍度說成可以估肌肉量', () => {
  for (const f of FIELDS) assert.ok(!f.why.includes('肌肉量'), f.key);
});

test('分析：BMI、腰圍身高比、腰臀比、體脂粗估、左右差，每項都附怎麼算的', () => {
  const a = analyze(sample());
  assert.equal(a.bmi, 21.5);
  assert.equal(a.whtr, 0.43);
  assert.equal(a.shape, 'pear');
  assert.ok(a.bodyfat > 15 && a.bodyfat < 35);
  assert.equal(a.sides[0].diff, 5.9);
  assert.equal(a.suggestAsym, true);
  for (const i of a.items) assert.ok(i.how, i.id);
});

test('體架大小只是估計；沒量手腕就不估', () => {
  const p = sample();
  assert.equal(analyze(p).frame, undefined);
  p.measurements.forearm_min_l = 14; p.measurements.forearm_min_r = 14;
  const a = analyze(p);
  assert.equal(a.frame, 'small');
  assert.ok(a.items.find((i) => i.id === 'frame').label.includes('估計'));
});

test('不用量數字，只說左右哪邊長／短，也算有左右差', () => {
  const p = emptyProfile();
  p.structure.arm_len = 'r_short';
  const a = analyze(p);
  assert.equal(a.suggestAsym, true);
  assert.deepEqual(a.relative, ['手臂長度：右邊比較短']);
  p.structure.arm_len = 'unknown';
  assert.equal(analyze(p).suggestAsym, false);
});

test('表格：寫出去再讀回來，內容一樣', () => {
  const p = sample();
  p.basics.hand = 'r';
  p.structure = { arm_len: 'r_short', arch: 'low' };
  p.observations = ['round_shoulders', 'belly', 'arch_low'];
  p.otherNote = '想讓肩膀放鬆, "右邊"比較緊';
  p.asym = { has: 'yes', where: ['upper', 'trunk'], mode: 'structural' };
  p.prefs = { freq: 'some', style: 'hold', strong: 'lower', avoid: ['hands'], longGoals: ['fat', 'function'] };
  p.gear = { dumbbell_kg: 2, band: 'light' };
  p.settings = { owned: 'mat|wall|towel', minutes: '15' };
  p.capability = { 'wall-sit': { how: 'stable', areas: ['quads'], sec: 20, rpe: 6 }, 'single-leg-stand': { how: 'form', areas: [], howL: 'form', howR: 'stable' } };
  p.adj = { 'wall-sit': { dose: 25, streak: 1 }, 'single-leg-stand': { dose: 20, L: 15, R: 20, streakL: -1, streakR: 1 }, 'forearm-plank': { stopped: true } };
  const now = new Date('2026-11-13T00:00:00Z');
  const back = fromCSV(toCSV(p, now));
  assert.deepEqual(back.warnings, []);
  assert.deepEqual(back.profile, { ...p, savedAt: now.toISOString() });
});

test('第 3 階段的舊表格（版本 1）還讀得進來', () => {
  const old = ['代號（不要改）,項目,你的值,單位或選項,說明', 'meta.version,表格版本,1,,', 'sex,性別,女,,', 'age,年紀,28,,', 'height,身高,160,,', 'weight,體重,55,,',
    'waist,腰圍,68,,', 'forearm_min_l,左前臂最細處（手腕上方）,14,,', 'asym.has,左右,有,,', 'prefs.avoid,不想做,用手撐體重、躺或趴在地上,,',
    'trial.wall-sit,試做結果,how=stable;areas=quads,,', 'adj.wall-sit,依回報的調整,dose=25;streak=1,,'].join('\r\n');
  const r = fromCSV(old).profile;
  assert.equal(r.basics.sex, 'f');
  assert.equal(r.measurements.waist, 68);
  assert.equal(r.measurements.forearm_min_l, 14);
  assert.equal(r.asym.has, 'yes');
  assert.deepEqual(r.prefs.avoid, ['hands']);            // 舊選項「躺或趴在地上」改名了，讀不到就略過
  assert.equal(r.capability['wall-sit'].how, 'stable');
  assert.equal(r.adj['wall-sit'].dose, 25);
});

test('空白表格讀回來是空的；手動填中文和帶單位的數字也讀得懂', () => {
  const blank = toCSV(emptyProfile(), null);
  assert.equal(hasData(fromCSV(blank).profile), false);
  const filled = blank.replace('sex,性別（必填）,,', 'sex,性別（必填）,女,').replace('height,身高（必填）,,', 'height,身高（必填）,160公分,')
    .replace('waist,腰圍,,', 'waist,腰圍,999,').replace('obs.trunk,軀幹／腹部：我注意到的,,', 'obs.trunk,軀幹／腹部：我注意到的,小腹明顯、亂填的,');
  const r = fromCSV(filled);
  assert.equal(r.profile.basics.sex, 'f');
  assert.equal(r.profile.basics.height, 160);
  assert.equal(r.profile.measurements.waist, undefined);
  assert.deepEqual(r.profile.observations, ['belly']);
  assert.equal(r.warnings.length, 2);
});

test('不是我們的表格會被擋下來', () => {
  assert.equal(fromCSV('a,b,c\n1,2,3').profile, null);
});

test('能力以動作類型保存：知道是哪一類動作吃力', () => {
  const p = emptyProfile();
  p.prefs.strong = 'upper';
  assert.deepEqual([tendency(p, exById).weak, tendency(p, exById).source], ['lower', 'self']);
  p.capability = { 'wall-sit': { how: 'stable', areas: [] }, 'glute-bridge-hold': { how: 'stable', areas: [] }, 'band-pull-apart-hold': { how: 'short', areas: [] }, 'tabletop-hold': { how: 'form', areas: [] } };
  const t = tendency(p, exById);
  assert.deepEqual(t.weakPatterns.sort(), ['anti_extension', 'pull_horizontal']);
  assert.equal(t.patternLevel.pull_horizontal, 1);
  assert.equal(t.patternLevel.squat, 3);
  assert.deepEqual([t.weak, t.source], ['upper', 'trial']);
});

test('每個身體區域填了幾項', () => {
  const p = sample(); p.observations = ['belly'];
  assert.equal(regionCount(p, 'trunk'), 2);
  assert.equal(regionCount(p, 'foot'), 0);
});

test('檔案超過 8 週算太久', () => {
  const now = new Date('2026-11-13T00:00:00Z');
  assert.equal(isStale('2026-10-01T00:00:00Z', now), false);
  assert.equal(isStale('2026-09-01T00:00:00Z', now), true);
});
