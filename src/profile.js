// 身體資料：有哪些欄位、每個數字能算出什麼、表格檔（CSV）的讀寫、分析。不碰畫面。
// 資料不自動存在任何地方；使用者下載檔案、下次上傳。
export const PROFILE_VERSION = '1';
export const STALE_WEEKS = 8;            // 檔案超過幾週建議重新測量
export const SIDE_DIFF_PCT = 5;          // 左右差幾 % 以上，建議勾選「左右有差」

function num(key, label, unit, tier, min, max, why) { return { key: key, label: label, unit: unit, tier: tier, type: 'number', min: min, max: max, why: why }; }
function pair(key, label, tier, min, max, why) {
  return [num(key + '_l', '左' + label, '公分', tier, min, max, why), num(key + '_r', '右' + label, '公分', tier, min, max, why)];
}
var SIDE_WHY = '左右一起量，可以看兩邊差多少。';
var MINMAX_WHY = '同一段最粗和最細的差，大概看得出肌肉量；也能看左右差。';

export const FIELDS = [].concat(
  [{ key: 'sex', label: '性別', tier: 'required', type: 'choice', options: { f: '女', m: '男' }, why: '腰臀比和體脂的估算，男女的算法和參考範圍不一樣。' },
    num('age', '年紀', '歲', 'required', 10, 100, '用來調整一開始的強度。'),
    num('height', '身高', '公分', 'required', 100, 230, '和體重一起算出體重相對身高的範圍（BMI）；也是腰圍比例的基準。'),
    num('weight', '體重', '公斤', 'required', 25, 250, '和身高一起算出 BMI。'),
    num('waist', '腰圍', '公分', 'recommended', 40, 200, '腰圍÷身高，看脂肪是不是偏集中在腹部。'),
    num('hip', '臀圍', '公分', 'recommended', 50, 200, '腰圍÷臀圍（腰臀比），看體型偏腰腹還是偏臀腿。'),
    num('neck', '頸圍', '公分', 'recommended', 20, 70, '加上腰圍、臀圍、身高，可以估大概的體脂率。')],
  pair('arm_max', '上臂最粗處', 'recommended', 10, 80, SIDE_WHY + '也用來看上半身的份量。'),
  pair('thigh_max', '大腿最粗處', 'recommended', 25, 120, SIDE_WHY + '也用來看下半身的份量。'),
  [num('chest', '胸圍', '公分', 'optional', 50, 200, '上半身的骨架和比例。'),
    num('shoulder', '肩寬', '公分', 'optional', 25, 70, '上半身的骨架和比例。')],
  pair('arm_min', '上臂最細處', 'optional', 10, 80, MINMAX_WHY),
  pair('forearm_max', '前臂最粗處', 'optional', 10, 60, MINMAX_WHY),
  pair('forearm_min', '前臂最細處（手腕上方）', 'optional', 8, 40, MINMAX_WHY),
  pair('thigh_min', '大腿最細處（膝蓋上方）', 'optional', 20, 100, MINMAX_WHY),
  pair('calf_max', '小腿最粗處', 'optional', 15, 80, MINMAX_WHY),
  pair('calf_min', '小腿最細處（腳踝上方）', 'optional', 10, 50, MINMAX_WHY),
  [{ key: 'hand', label: '慣用手', tier: 'optional', type: 'choice', options: { l: '左', r: '右' }, why: '左右有差時，分得出是不是慣用側造成的。' },
    { key: 'foot', label: '慣用腳', tier: 'optional', type: 'choice', options: { l: '左', r: '右' }, why: '同上。' }]
);
export const SIDE_PARTS = [['arm_max', '上臂最粗處'], ['arm_min', '上臂最細處'], ['forearm_max', '前臂最粗處'], ['forearm_min', '前臂最細處'],
  ['thigh_max', '大腿最粗處'], ['thigh_min', '大腿最細處'], ['calf_max', '小腿最粗處'], ['calf_min', '小腿最細處']];

// 其他設定（選項的代號和顯示文字）
export const CHOICES = {
  'asym.has': { label: '左右有沒有明顯差異', options: { no: '沒有', yes: '有', unsure: '不確定' } },
  'asym.where': { label: '差異主要在哪裡', multi: true, options: { upper: '手臂或肩膀', trunk: '胸背或腰', lower: '腿或臀' } },
  'asym.mode': { label: '左右兩邊要怎麼練', options: { same: '兩邊用一樣的量', separate: '兩邊分開設定', structural: '天生或受傷造成的，不以練成一樣為目標' } },
  'prefs.freq': { label: '目前的運動頻率', options: { none: '幾乎沒有', some: '每週 1–2 次', often: '每週 3 次以上' } },
  'prefs.style': { label: '比較喜歡哪種動作', options: { hold: '撐住不動的', reps: '重複動的', both: '都可以' } },
  'prefs.avoid': { label: '不想做或不能做的', multi: true, options: { hands: '用手撐體重', floor: '躺或趴在地上' } },
  'prefs.strong': { label: '覺得自己哪裡比較有力', options: { upper: '上半身', lower: '下半身', even: '差不多', unknown: '不知道' } }
};

export function emptyProfile() {
  return { body: {}, asym: { has: '', where: [], mode: '' }, prefs: { freq: '', style: '', avoid: [], strong: '' },
    settings: {}, trials: {}, adj: {}, savedAt: null };
}
export function hasData(p) {
  return Object.keys(p.body).length > 0 || Object.keys(p.trials).length > 0 || Object.keys(p.adj).length > 0 || !!p.asym.has || !!p.prefs.freq;
}

// 檢查必填和範圍。回傳 { ok, errors: {欄位: 訊息} }
export function validateBody(body) {
  var errors = {};
  FIELDS.forEach(function (f) {
    var v = body[f.key];
    if (v == null || v === '') { if (f.tier === 'required') errors[f.key] = '請填' + f.label + '。'; return; }
    if (f.type === 'number' && (typeof v !== 'number' || isNaN(v) || v < f.min || v > f.max)) errors[f.key] = f.label + '要在 ' + f.min + ' 到 ' + f.max + ' 之間。';
    if (f.type === 'choice' && !f.options[v]) errors[f.key] = '請選' + f.label + '。';
  });
  return { ok: !Object.keys(errors).length, errors: errors };
}

function r1(x) { return Math.round(x * 10) / 10; }
function r2(x) { return Math.round(x * 100) / 100; }
function log10(x) { return Math.log(x) / Math.LN10; }

// 從身體數值算出比例和傾向。都是皮尺量的粗估，畫面上要寫成「傾向」。
export function analyze(body) {
  var out = { items: [], sides: [], maxDiff: 0, suggestAsym: false };
  var h = body.height, w = body.weight, waist = body.waist, hip = body.hip, neck = body.neck, sex = body.sex;
  if (h && w) {
    var bmi = w / Math.pow(h / 100, 2);
    var band = bmi < 18.5 ? '偏輕' : bmi < 24 ? '一般範圍' : bmi < 27 ? '偏重' : '偏高';
    out.bmi = r1(bmi);
    out.items.push({ id: 'bmi', label: '體重相對身高（BMI）', value: String(r1(bmi)), note: '落在「' + band + '」。BMI 分不出肌肉和脂肪，肌肉多的人也會偏高。' });
  }
  if (h && waist) {
    var whtr = waist / h;
    out.whtr = r2(whtr);
    out.items.push({ id: 'whtr', label: '腰圍÷身高', value: String(r2(whtr)), note: whtr >= 0.5 ? '腰圍超過身高的一半，脂肪可能偏集中在腹部。' : '腰圍不到身高的一半。' });
  }
  if (waist && hip && sex) {
    var whr = waist / hip, hi = sex === 'f' ? 0.85 : 0.9, lo = sex === 'f' ? 0.75 : 0.85;
    out.whr = r2(whr);
    out.shape = whr > hi ? 'apple' : whr < lo ? 'pear' : 'mid';
    out.items.push({ id: 'whr', label: '腰臀比', value: String(r2(whr)),
      note: out.shape === 'apple' ? '體型傾向偏腰腹（俗稱蘋果型）。' : out.shape === 'pear' ? '體型傾向偏臀腿（俗稱梨型）。' : '介於中間，腰腹和臀腿的比例比較平均。' });
  }
  if (h && waist && neck && sex && (sex === 'm' || hip)) {
    var girth = sex === 'm' ? waist - neck : waist + hip - neck, bf = null;
    if (girth > 0) {
      bf = sex === 'm' ? 495 / (1.0324 - 0.19077 * log10(girth) + 0.15456 * log10(h)) - 450
        : 495 / (1.29579 - 0.35004 * log10(girth) + 0.22100 * log10(h)) - 450;
    }
    if (bf != null && bf > 3 && bf < 60) {
      out.bodyfat = Math.round(bf);
      out.items.push({ id: 'bodyfat', label: '體脂率（粗估）', value: '大約 ' + Math.max(3, Math.round(bf) - 4) + '–' + (Math.round(bf) + 4) + '%', note: '用圍度估的，誤差可能有好幾個百分點，只能看大概。' });
    }
  }
  SIDE_PARTS.forEach(function (p) {
    var l = body[p[0] + '_l'], r = body[p[0] + '_r'];
    if (!l || !r) return;
    var diff = Math.abs(l - r) / ((l + r) / 2) * 100;
    out.sides.push({ key: p[0], label: p[1], l: l, r: r, diff: r1(diff), bigger: l === r ? '' : l > r ? '左' : '右' });
    if (diff > out.maxDiff) out.maxDiff = r1(diff);
  });
  out.suggestAsym = out.maxDiff >= SIDE_DIFF_PCT;
  if (body.arm_max_l && body.arm_max_r && body.thigh_max_l && body.thigh_max_r) {
    out.armThigh = r2((body.arm_max_l + body.arm_max_r) / (body.thigh_max_l + body.thigh_max_r));
    out.items.push({ id: 'armthigh', label: '上臂÷大腿', value: String(out.armThigh), note: '這個比例沒有公認的標準，只當參考。上下半身哪邊比較需要加強，主要看試做動作的結果。' });
  }
  return out;
}

// 上、下半身和核心的傾向：先看試做結果，沒有試做才看自己填的。
var HOW_SCORE = { stable: 2, form: 1, short: 0 };
export function tendency(profile, exById) {
  var base = profile.prefs.freq === 'often' ? 3 : 2, sums = {}, counts = {}, out = { weak: null, source: null, maxLevel: { lower: base, core: base, upper: base } };
  Object.keys(profile.trials).forEach(function (id) {
    var ex = exById[id], t = profile.trials[id];
    if (!ex || HOW_SCORE[t.how] == null) return;
    sums[ex.region] = (sums[ex.region] || 0) + HOW_SCORE[t.how];
    counts[ex.region] = (counts[ex.region] || 0) + 1;
  });
  var regions = Object.keys(counts), avg = {};
  regions.forEach(function (r) {
    avg[r] = sums[r] / counts[r];
    out.maxLevel[r] = avg[r] < 1 ? 1 : avg[r] < 2 ? 2 : 3;
  });
  if (regions.length >= 2) {
    var sorted = regions.slice().sort(function (a, b) { return avg[a] - avg[b]; });
    if (avg[sorted[sorted.length - 1]] - avg[sorted[0]] >= 1) { out.weak = sorted[0]; out.source = 'trial'; }
  }
  if (!out.weak && !regions.length) {
    if (profile.prefs.strong === 'upper') { out.weak = 'lower'; out.source = 'self'; }
    if (profile.prefs.strong === 'lower') { out.weak = 'upper'; out.source = 'self'; }
  }
  return out;
}

export function isStale(savedAt, now) {
  if (!savedAt) return false;
  var t = new Date(savedAt).getTime();
  return !isNaN(t) && (now.getTime() - t) / (7 * 86400000) >= STALE_WEEKS;
}

/* ---------- 表格檔（CSV） ---------- */
function esc(v) { v = String(v == null ? '' : v); return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
function kv(obj) { return Object.keys(obj).filter(function (k) { return obj[k] !== '' && obj[k] != null && obj[k] !== false; }).map(function (k) { return k + '=' + (Array.isArray(obj[k]) ? obj[k].join('|') : obj[k] === true ? 1 : obj[k]); }).join(';'); }
function unkv(s) {
  var o = {};
  String(s || '').split(';').forEach(function (part) { var i = part.indexOf('='); if (i > 0) o[part.slice(0, i).trim()] = part.slice(i + 1).trim(); });
  return o;
}
var TIER = { required: '必填', recommended: '建議填', optional: '可有可無' };

// 把資料寫成表格。空的 profile 就是空白表格。
export function toCSV(profile, now) {
  var rows = [['代號（不要改）', '項目', '你的值', '單位或選項', '說明']], lastTier = null;
  rows.push(['meta.version', '表格版本', PROFILE_VERSION, '', '不要改']);
  rows.push(['meta.saved_at', '這份檔案的時間', now ? now.toISOString() : '', '', '下載時自動填。超過 ' + STALE_WEEKS + ' 週會建議重新測量']);
  FIELDS.forEach(function (f) {
    if (f.tier !== lastTier) { rows.push(['', '【身體數值：' + TIER[f.tier] + '】', '', '', '']); lastTier = f.tier; }
    var v = profile.body[f.key];
    rows.push([f.key, f.label, v == null ? '' : f.type === 'choice' ? f.options[v] : v,
      f.type === 'choice' ? Object.keys(f.options).map(function (k) { return f.options[k]; }).join('／') : f.unit, f.why]);
  });
  rows.push(['', '【左右差異、經驗和偏好】', '', '', '可以留空，在頁面上勾選']);
  Object.keys(CHOICES).forEach(function (key) {
    var c = CHOICES[key], parts = key.split('.'), v = profile[parts[0]][parts[1]];
    var text = c.multi ? (v || []).map(function (k) { return c.options[k]; }).join('、') : (c.options[v] || '');
    rows.push([key, c.label, text, Object.keys(c.options).map(function (k) { return c.options[k]; }).join('／'), c.multi ? '可以填多個，用「、」分開' : '']);
  });
  var extra = [];
  Object.keys(profile.settings).forEach(function (k) { extra.push(['set.' + k, '頁面設定', profile.settings[k], '', '']); });
  Object.keys(profile.trials).forEach(function (id) { extra.push(['trial.' + id, '試做結果', kv(profile.trials[id]), '', '']); });
  Object.keys(profile.adj).forEach(function (id) { extra.push(['adj.' + id, '依回報的調整', kv(profile.adj[id]), '', '']); });
  if (extra.length) { rows.push(['', '【頁面記下來的設定和回報】', '', '', '由頁面填寫，不用手動改']); rows = rows.concat(extra); }
  return '﻿' + rows.map(function (r) { return r.map(esc).join(','); }).join('\r\n') + '\r\n';
}

export function parseCSV(text) {
  var rows = [], row = [], cell = '', q = false, i, c;
  text = String(text).replace(/^﻿/, '');
  for (i = 0; i < text.length; i++) {
    c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
function choiceCode(options, text) {
  text = String(text).trim();
  if (options[text]) return text;
  var hit = Object.keys(options).filter(function (k) { return options[k] === text; });
  return hit.length ? hit[0] : null;
}

// 讀表格。回傳 { profile, warnings: [文字] }；格式完全不對時 profile 是 null。
export function fromCSV(text) {
  var rows = parseCSV(text), map = {}, warnings = [], p = emptyProfile();
  rows.forEach(function (r) { var k = (r[0] || '').trim(); if (k && /^[a-z]/.test(k)) map[k] = (r[2] == null ? '' : String(r[2])).trim(); });
  if (!('meta.version' in map) && !FIELDS.some(function (f) { return f.key in map; })) return { profile: null, warnings: ['這不是 Spinnin-Up 的表格，或第一欄的代號被改掉了。'] };
  if (map['meta.version'] && map['meta.version'] !== PROFILE_VERSION) warnings.push('這份表格的版本比較新，有些內容可能讀不到。');
  if (map['meta.saved_at'] && !isNaN(new Date(map['meta.saved_at']).getTime())) p.savedAt = new Date(map['meta.saved_at']).toISOString();
  FIELDS.forEach(function (f) {
    var raw = map[f.key];
    if (raw == null || raw === '') return;
    if (f.type === 'choice') {
      var code = choiceCode(f.options, raw);
      if (code) p.body[f.key] = code; else warnings.push('「' + f.label + '」填的「' + raw + '」看不懂，先略過。');
    } else {
      var n = Number(raw.replace(/[^\d.\-]/g, ''));
      if (raw.replace(/[^\d]/g, '') === '' || isNaN(n) || n < f.min || n > f.max) warnings.push('「' + f.label + '」填的「' + raw + '」不在合理範圍（' + f.min + '–' + f.max + '），先略過。');
      else p.body[f.key] = n;
    }
  });
  Object.keys(CHOICES).forEach(function (key) {
    var raw = map[key], c = CHOICES[key], parts = key.split('.');
    if (!raw) return;
    if (c.multi) {
      p[parts[0]][parts[1]] = raw.split(/[、,|／\/]/).map(function (s) { return choiceCode(c.options, s); }).filter(Boolean);
    } else {
      var code = choiceCode(c.options, raw);
      if (code) p[parts[0]][parts[1]] = code; else warnings.push('「' + c.label + '」填的「' + raw + '」看不懂，先略過。');
    }
  });
  Object.keys(map).forEach(function (k) {
    var o;
    if (k.indexOf('set.') === 0 && map[k] !== '') p.settings[k.slice(4)] = map[k];
    if (k.indexOf('trial.') === 0) {
      o = unkv(map[k]);
      if (o.how) p.trials[k.slice(6)] = { how: o.how, areas: o.areas ? o.areas.split('|') : [] };
    }
    if (k.indexOf('adj.') === 0) {
      o = unkv(map[k]);
      var a = {};
      ['dose', 'L', 'R', 'streak', 'streakL', 'streakR'].forEach(function (f) { if (o[f] != null && !isNaN(Number(o[f]))) a[f] = Number(o[f]); });
      if (o.stopped === '1') a.stopped = true;
      if (o.avoid === '1') a.avoid = true;
      if (Object.keys(a).length) p.adj[k.slice(4)] = a;
    }
  });
  return { profile: p, warnings: warnings };
}
