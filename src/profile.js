// 身體資料：分層的資料模型、欄位、表格檔（CSV）讀寫、分析、傾向。不碰畫面。
// 規格見私人倉庫 Spin-Up 的 body-profile-spec.md。
// 分層：basics 基本資料／measurements 量出來的尺寸／structure 長度與左右的相對描述／
//       observations 使用者自己的觀察（不是診斷）／capability 試做的原始結果／adj 回報後的調整。
// 資料不自動存在任何地方；使用者下載檔案、下次上傳。
export const PROFILE_VERSION = '2';
export const STALE_WEEKS = 8;            // 檔案超過幾週建議重新測量
export const SIDE_DIFF_PCT = 5;          // 左右差幾 % 以上，建議勾選「左右有差」

export const REGIONS = [
  { id: 'head_neck', name: '頭頸' }, { id: 'shoulder_chest', name: '肩／胸／上背' }, { id: 'arms', name: '手臂' },
  { id: 'trunk', name: '軀幹／腹部' }, { id: 'pelvis', name: '骨盆／髖' }, { id: 'thigh', name: '大腿／膝' },
  { id: 'calf', name: '小腿' }, { id: 'foot', name: '腳踝／足部' }
];
// 身體區域對應到 areas.json 的部位（今天哪裡不舒服、自我觀察會用到）
export const REGION_AREAS = {
  head_neck: ['neck'], shoulder_chest: ['upper_back', 'rear_shoulders', 'shoulders', 'chest', 'shoulder_joint', 'lats'],
  arms: ['biceps', 'triceps', 'forearms', 'elbow', 'wrist'], trunk: ['abs', 'obliques', 'lower_back_muscle', 'lower_back'],
  pelvis: ['glutes', 'glute_side', 'hip_flexors', 'hip_joint'], thigh: ['quads', 'hamstrings', 'adductors', 'knee'],
  calf: ['calves'], foot: ['feet', 'ankle']
};

function n(key, label, unit, layer, region, level, min, max, why) {
  return { key: key, label: label, unit: unit, layer: layer, region: region, level: level, type: 'number', min: min, max: max, why: why };
}
function lr(key, label, layer, region, level, min, max, why) {
  return [n(key + '_l', '左' + label, '公分', layer, region, level, min, max, why), n(key + '_r', '右' + label, '公分', layer, region, level, min, max, why)];
}
function c(key, label, layer, region, level, options, why) {
  return { key: key, label: label, layer: layer, region: region, level: level, type: 'choice', options: options, why: why };
}
var SIDE = '左右一起量，可以看兩邊差多少。';
var SHAPE = '記錄外形和之後的變化；也能看左右差。';
var UNK = '不知道';

export const FIELDS = [].concat(
  [c('sex', '性別', 'basics', null, 'basic', { f: '女', m: '男' }, '腰臀比和體脂的估算，男女的算法和參考範圍不一樣。'),
    n('age', '年紀', '歲', 'basics', null, 'basic', 10, 100, '用來調整一開始的強度。'),
    n('height', '身高', '公分', 'basics', null, 'basic', 100, 230, '和體重一起算出體重相對身高的範圍（BMI）；也是各種比例的基準。'),
    n('weight', '體重', '公斤', 'basics', null, 'basic', 25, 250, '和身高一起算出 BMI。'),
    c('hand', '慣用手', 'basics', null, 'more', { l: '左', r: '右' }, '左右有差時，分得出是不是慣用側造成的。'),
    c('foot', '慣用腳', 'basics', null, 'more', { l: '左', r: '右' }, '同上。')],
  // 頭頸
  [n('neck', '頸圍', '公分', 'measurements', 'head_neck', 'basic', 20, 70, '加上腰圍、臀圍、身高，可以估大概的體脂率。'),
    c('neck_turn', '左右轉頭', 'structure', 'head_neck', 'more', { same: '差不多', l_less: '往左比較轉不過去', r_less: '往右比較轉不過去', unknown: UNK }, '記下來，之後有頸部動作時會用到。')],
  // 肩／胸／上背
  [n('shoulder', '肩寬', '公分', 'measurements', 'shoulder_chest', 'basic', 25, 70, '和臀寬一起看肩和髖的比例。'),
    n('chest', '胸圍', '公分', 'measurements', 'shoulder_chest', 'basic', 50, 200, '記錄上半身的外形和變化。'),
    c('shoulder_height', '左右肩膀高度', 'structure', 'shoulder_chest', 'basic', { same: '差不多', l_high: '左邊比較高', r_high: '右邊比較高', unknown: UNK }, '不用量，憑照鏡子的印象就可以。'),
    n('torso_len', '軀幹長度（肩到髖）', '公分', 'measurements', 'shoulder_chest', 'more', 30, 90, '看四肢和軀幹的比例。'),
    n('sit_height', '坐高', '公分', 'measurements', 'shoulder_chest', 'more', 50, 130, '看上下半身長度的比例。')],
  // 手臂
  lr('arm_max', '上臂最粗處', 'measurements', 'arms', 'basic', 10, 80, SIDE),
  [c('arm_len', '左右手臂長度', 'structure', 'arms', 'basic', { same: '差不多', l_short: '左邊比較短', r_short: '右邊比較短', unknown: UNK }, '不用量。知道有差，排動作時就會少排需要兩手一樣高支撐的。'),
    c('grip', '握東西', 'structure', 'arms', 'basic', { ok: '沒問題', limited: '握力有限或不好握', unknown: UNK }, '握力有限時，會少排需要用力握住東西的動作。')],
  lr('arm_len_n', '手臂長度（肩到手腕）', 'measurements', 'arms', 'more', 30, 100, '有量的話可以算出差多少。'),
  lr('arm_min', '上臂較細處', 'measurements', 'arms', 'more', 10, 80, SHAPE),
  lr('forearm_max', '前臂最粗處', 'measurements', 'arms', 'more', 10, 60, SHAPE),
  lr('forearm_min', '手腕圍', 'measurements', 'arms', 'more', 8, 40, '和身高一起估體架大小的傾向。'),
  // 軀幹／腹部
  [n('waist', '腰圍', '公分', 'measurements', 'trunk', 'basic', 40, 200, '腰圍÷身高，看脂肪是不是偏集中在腹部。'),
    n('belly', '腹圍（肚子最突出的地方）', '公分', 'measurements', 'trunk', 'more', 40, 200, '小腹明顯不一定會反映在腰圍，所以另外記。')],
  // 骨盆／髖
  [n('hip', '臀圍', '公分', 'measurements', 'pelvis', 'basic', 50, 200, '腰圍÷臀圍（腰臀比），看體型偏腰腹還是偏臀腿。'),
    c('pelvis_height', '左右骨盆高度', 'structure', 'pelvis', 'basic', { same: '差不多', l_high: '左邊比較高', r_high: '右邊比較高', unknown: UNK }, '憑自己的感覺就可以，不是診斷。'),
    n('pelvis_w', '臀寬（骨盆最寬處，量寬度不是繞一圈）', '公分', 'measurements', 'pelvis', 'more', 20, 60, '和肩寬一起看肩和髖的比例。')],
  // 大腿／膝
  lr('thigh_max', '大腿最粗處', 'measurements', 'thigh', 'basic', 25, 120, SIDE),
  [c('leg_len', '左右腿長', 'structure', 'thigh', 'basic', { same: '差不多', l_long: '左邊比較長', r_long: '右邊比較長', unknown: UNK }, '不用量，知道有差就有用。'),
    c('knee_track', '蹲下時膝蓋', 'structure', 'thigh', 'basic', { ok: '大致對著腳尖', in: '容易往內', out: '容易往外', unknown: UNK }, '膝蓋容易往內時，會多排臀部外側的動作。')],
  lr('thigh_min', '大腿較細處（膝蓋上方）', 'measurements', 'thigh', 'more', 20, 100, SHAPE),
  lr('leg_len_n', '腿長（髖到腳踝）', 'measurements', 'thigh', 'more', 50, 130, '有量的話可以算出差多少。'),
  // 小腿
  lr('calf_max', '小腿最粗處', 'measurements', 'calf', 'basic', 15, 80, SIDE),
  lr('calf_min', '腳踝上方', 'measurements', 'calf', 'more', 10, 50, SHAPE),
  // 腳踝／足部
  [c('arch', '足弓', 'structure', 'foot', 'basic', { unknown: UNK, low: '我覺得偏低', normal: '我覺得一般', high: '我覺得偏高', diff: '左右不同' }, '自己覺得的就可以。偏低或左右不同時，會多排腳掌和腳踝的動作。'),
    c('ankle_roll', '腳踝', 'structure', 'foot', 'basic', { none: '沒有特別', in: '容易往內倒', out: '容易往外', unknown: UNK }, '會多排平衡和腳踝穩定的動作。'),
    n('foot_len', '腳長', '公分', 'measurements', 'foot', 'more', 15, 35, '記錄用。'),
    n('foot_w', '腳寬', '公分', 'measurements', 'foot', 'more', 5, 15, '記錄用。')]
);
export const SIDE_PARTS = [['arm_max', '上臂最粗處'], ['arm_min', '上臂較細處'], ['forearm_max', '前臂最粗處'], ['forearm_min', '手腕圍'],
  ['thigh_max', '大腿最粗處'], ['thigh_min', '大腿較細處'], ['calf_max', '小腿最粗處'], ['calf_min', '腳踝上方'],
  ['arm_len_n', '手臂長度'], ['leg_len_n', '腿長']];

// 自己注意到／想改善的地方。這些是使用者的觀察，不是診斷。
// boost：排課表時多排哪些部位（areas）或動作類型（patterns）；limit：要避開什麼。
function o(id, region, label, boost, extra) { return Object.assign({ id: id, region: region, label: label, boost: boost || null }, extra || {}); }
var UPPER_BACK = { areas: ['upper_back', 'rear_shoulders'] }, CORE = { patterns: ['anti_extension'] }, GLUTE = { areas: ['glutes'] },
  GLUTE_SIDE = { areas: ['glute_side'] }, FEET = { areas: ['feet', 'calves'], patterns: ['balance'] };
export const OBSERVATIONS = [
  o('forward_head', 'head_neck', '頭容易往前', UPPER_BACK), o('neck_hump', 'head_neck', '後頸或上背凸起', UPPER_BACK), o('tight_neck', 'head_neck', '肩頸容易痠或緊', UPPER_BACK),
  o('round_shoulders', 'shoulder_chest', '圓肩', UPPER_BACK), o('hunch', 'shoulder_chest', '駝背感', UPPER_BACK), o('shoulder_uneven', 'shoulder_chest', '肩膀一高一低', null, { asym: true }),
  o('scapula', 'shoulder_chest', '肩胛骨突出', UPPER_BACK), o('upper_back_tired', 'shoulder_chest', '上背容易累', UPPER_BACK), o('chest_side_weak', 'shoulder_chest', '一側胸肩很難出力', null, { asym: true }),
  o('arm_diff', 'arms', '左右手臂力量差很多', null, { asym: true }), o('arm_limited', 'arms', '手臂或肩膀活動受限', null), o('grip_hard', 'arms', '握東西有困難', null, { limit: 'grip' }),
  o('hands_hard', 'arms', '手撐地不舒服或做不到', null, { limit: 'hands' }),
  o('belly', 'trunk', '小腹明顯', null, { note: '你提到在意小腹。這不等於要多做腹部動作；外觀主要跟整體活動量和飲食有關，課表照常平均排。' }),
  o('waist_fat', 'trunk', '腰腹脂肪比較集中', null, { note: '你提到腰腹脂肪。局部的動作沒辦法只減那個地方的脂肪，課表照常平均排。' }),
  o('weak_core', 'trunk', '核心很難出力', CORE), o('back_tired', 'trunk', '久站腰容易累', CORE), o('hold_fades', 'trunk', '撐住姿勢很快沒力', CORE), o('side_feel', 'trunk', '身體左右側感覺不一樣', null, { asym: true }),
  o('apt', 'pelvis', '覺得骨盆前傾', { areas: ['glutes'], patterns: ['anti_extension'] }), o('ppt', 'pelvis', '覺得骨盆後傾', GLUTE), o('pelvis_uneven', 'pelvis', '左右骨盆不同', null, { asym: true }),
  o('glute_weak', 'pelvis', '臀部某側比較難出力', { areas: ['glutes', 'glute_side'] }, { asym: true }), o('hip_tight', 'pelvis', '髖前側容易緊', GLUTE),
  o('knee_in', 'thigh', '膝蓋容易內扣', GLUTE_SIDE), o('knee_out', 'thigh', '膝蓋容易外開', null), o('leg_diff', 'thigh', '左右腿力量差', null, { asym: true }),
  o('leg_tired', 'thigh', '某側腿特別容易疲勞', null, { asym: true }), o('unstable', 'thigh', '單腳站不穩', { patterns: ['balance'] }),
  o('calf_diff', 'calf', '左右小腿外觀差很多', null, { asym: true }), o('calf_tight', 'calf', '某側小腿很容易緊', null), o('calf_weak', 'calf', '某側踮腳明顯比較弱', { areas: ['calves'] }, { asym: true }),
  o('arch_low', 'foot', '足弓偏低', FEET), o('arch_high', 'foot', '足弓偏高', null), o('ankle_in', 'foot', '腳踝容易往內倒', FEET), o('ankle_out', 'foot', '腳踝容易往外', FEET),
  o('foot_tired', 'foot', '久站或走路某處容易累', FEET)
];

export const CHOICES = {
  'asym.has': { label: '左右有沒有明顯差異', options: { no: '沒有', yes: '有', unsure: '不確定' } },
  'asym.where': { label: '差異主要在哪裡', multi: true, options: { upper: '手臂或肩膀', trunk: '胸背或腰', lower: '腿或臀' } },
  'asym.mode': { label: '左右兩邊要怎麼練', options: { same: '兩邊用一樣的量', separate: '兩邊分開設定', structural: '天生或受傷造成的，不以練成一樣為目標' } },
  'prefs.freq': { label: '目前的運動頻率', options: { none: '幾乎沒有', some: '每週 1–2 次', often: '每週 3 次以上' } },
  'prefs.style': { label: '比較喜歡哪種動作', options: { hold: '撐住不動的', reps: '重複動的', both: '都可以' } },
  'prefs.strong': { label: '覺得自己哪裡比較有力', options: { upper: '上半身', lower: '下半身', even: '差不多', unknown: UNK } },
  'prefs.avoid': { label: '不想做或不能做的', multi: true, options: { hands: '用手撐體重', floor: '躺或趴著', grip: '用力握東西', single: '一次只做一邊' } },
  'prefs.longGoals': { label: '長期想達到的', multi: true, options: { fat: '減脂', muscle: '增肌', fitness: '體力變好', function: '改善某個在意的地方' } }
};
export const GEAR = [
  { key: 'dumbbell_kg', label: '啞鈴每顆多重', unit: '公斤', min: 0.3, max: 40 },
  { key: 'bag_kg', label: '有重量的包包大概多重', unit: '公斤', min: 0.5, max: 30 },
  { key: 'band', label: '彈力帶的阻力', options: { light: '輕', medium: '中', heavy: '重', unknown: UNK } }
];

export function emptyProfile() {
  return { basics: {}, measurements: {}, structure: {}, observations: [], otherNote: '',
    asym: { has: '', where: [], mode: '' }, prefs: { freq: '', style: '', strong: '', avoid: [], longGoals: [] },
    gear: {}, capability: {}, adj: {}, settings: {}, savedAt: null };
}
export function get(p, key) { var f = FIELD_BY_KEY[key]; return f ? p[f.layer][key] : undefined; }
var FIELD_BY_KEY = {};
FIELDS.forEach(function (f) { FIELD_BY_KEY[f.key] = f; });
export function fieldOf(key) { return FIELD_BY_KEY[key]; }
export function isRequired(f) { return f.layer === 'basics' && f.level === 'basic'; }
export function hasData(p) {
  return Object.keys(p.basics).length + Object.keys(p.measurements).length + Object.keys(p.structure).length + p.observations.length +
    Object.keys(p.capability).length + Object.keys(p.adj).length > 0 || !!p.asym.has || !!p.prefs.freq || !!p.otherNote;
}
// 每個身體區域填了幾項（畫面上顯示用）
export function regionCount(p, regionId) {
  return FIELDS.filter(function (f) { return f.region === regionId && get(p, f.key) != null && get(p, f.key) !== ''; }).length +
    OBSERVATIONS.filter(function (x) { return x.region === regionId && p.observations.indexOf(x.id) >= 0; }).length;
}

// 檢查必填和範圍。values：{欄位: 值}（各層攤平）。回傳 { ok, errors }
export function validateValues(values, onlyKeys) {
  var errors = {};
  FIELDS.forEach(function (f) {
    if (onlyKeys && onlyKeys.indexOf(f.key) < 0) return;
    var v = values[f.key];
    if (v == null || v === '') { if (isRequired(f)) errors[f.key] = '請填' + f.label + '。'; return; }
    if (f.type === 'number' && (typeof v !== 'number' || isNaN(v) || v < f.min || v > f.max)) errors[f.key] = f.label + '要在 ' + f.min + ' 到 ' + f.max + ' 之間。';
    if (f.type === 'choice' && !f.options[v]) errors[f.key] = '請選' + f.label + '。';
  });
  return { ok: !Object.keys(errors).length, errors: errors };
}
export function basicsDone(p) { return validateValues(p.basics, FIELDS.filter(isRequired).map(function (f) { return f.key; })).ok; }

function r1(x) { return Math.round(x * 10) / 10; }
function r2(x) { return Math.round(x * 100) / 100; }
function log10(x) { return Math.log(x) / Math.LN10; }

// 從身體數值算出比例和傾向。都是皮尺量的粗估，畫面上要寫成「傾向」。每一項都附「怎麼算的」。
export function analyze(p) {
  var b = Object.assign({}, p.basics, p.measurements), out = { items: [], sides: [], maxDiff: 0, suggestAsym: false, summary: [] };
  var h = b.height, w = b.weight, waist = b.waist, hip = b.hip, neck = b.neck, sex = b.sex;
  function add(id, label, value, note, how) { out.items.push({ id: id, label: label, value: value, note: note, how: how }); }
  if (h && w) {
    var bmi = w / Math.pow(h / 100, 2);
    out.bmi = r1(bmi);
    add('bmi', '體重相對身高（BMI）', String(r1(bmi)), '落在「' + (bmi < 18.5 ? '偏輕' : bmi < 24 ? '一般範圍' : bmi < 27 ? '偏重' : '偏高') + '」。BMI 分不出肌肉和脂肪，肌肉多的人也會偏高。', '體重（公斤）÷ 身高（公尺）的平方。分級用台灣常用的 18.5／24／27。');
  }
  if (h && waist) {
    out.whtr = r2(waist / h);
    add('whtr', '腰圍÷身高', String(out.whtr), waist / h >= 0.5 ? '腰圍超過身高的一半，脂肪可能偏集中在腹部。' : '腰圍不到身高的一半。', '腰圍 ÷ 身高。常用 0.5 當參考線。');
  }
  if (waist && hip && sex) {
    var whr = waist / hip, hi = sex === 'f' ? 0.85 : 0.9, lo = sex === 'f' ? 0.75 : 0.85;
    out.whr = r2(whr);
    out.shape = whr > hi ? 'apple' : whr < lo ? 'pear' : 'mid';
    add('whr', '腰臀比', String(out.whr), out.shape === 'apple' ? '體型傾向偏腰腹（俗稱蘋果型）。' : out.shape === 'pear' ? '體型傾向偏臀腿（俗稱梨型）。' : '介於中間，腰腹和臀腿的比例比較平均。', '腰圍 ÷ 臀圍。' + (sex === 'f' ? '女性' : '男性') + '高於 ' + hi + ' 算偏腰腹，低於 ' + lo + ' 算偏臀腿。');
  }
  if (h && waist && neck && sex && (sex === 'm' || hip)) {
    var girth = sex === 'm' ? waist - neck : waist + hip - neck, bf = null;
    if (girth > 0) bf = sex === 'm' ? 495 / (1.0324 - 0.19077 * log10(girth) + 0.15456 * log10(h)) - 450 : 495 / (1.29579 - 0.35004 * log10(girth) + 0.22100 * log10(h)) - 450;
    if (bf != null && bf > 3 && bf < 60) {
      out.bodyfat = Math.round(bf);
      add('bodyfat', '體脂率（粗估）', '大約 ' + Math.max(3, Math.round(bf) - 4) + '–' + (Math.round(bf) + 4) + '%', '用圍度估的，誤差可能有好幾個百分點，只能看大概。', '用腰圍、頸圍' + (sex === 'f' ? '、臀圍' : '') + '和身高代入常見的圍度估算公式。');
    }
  }
  var wrist = b.forearm_min_l && b.forearm_min_r ? (b.forearm_min_l + b.forearm_min_r) / 2 : (b.forearm_min_l || b.forearm_min_r);
  if (h && wrist && sex) {
    var fr = h / wrist, small = sex === 'f' ? 11 : 10.4, large = sex === 'f' ? 10.1 : 9.6;
    out.frame = fr > small ? 'small' : fr < large ? 'large' : 'medium';
    add('frame', '體架大小（估計）', { small: '可能偏小', medium: '中等', large: '可能偏大' }[out.frame], '只是用手腕粗細估的傾向，不是骨架的分類。', '身高 ÷ 手腕圍 = ' + r1(fr) + '。' + (sex === 'f' ? '女性' : '男性') + '大於 ' + small + ' 估偏小，小於 ' + large + ' 估偏大。');
    out.summary.push('體架：' + { small: '可能偏小', medium: '中等', large: '可能偏大' }[out.frame]);
  }
  if (b.shoulder && b.pelvis_w) {
    var sh = b.shoulder / b.pelvis_w;
    add('shoulder_hip', '肩寬÷臀寬', String(r2(sh)), sh > 1.25 ? '肩相對比較寬。' : sh < 1.05 ? '肩和髖寬度接近，或髖比較寬。' : '肩比髖寬一些。', '肩寬 ÷ 臀寬。這個比例沒有公認的標準，分界只是方便描述。');
    out.summary.push('肩／髖：' + (sh > 1.25 ? '肩較寬' : sh < 1.05 ? '接近' : '肩略寬'));
  }
  if (h && b.leg_len_n_l && b.leg_len_n_r) add('leg_ratio', '腿長÷身高', String(r2((b.leg_len_n_l + b.leg_len_n_r) / 2 / h)), '只當記錄，沒有公認的標準。', '左右腿長的平均 ÷ 身高。');
  SIDE_PARTS.forEach(function (sp) {
    var l = b[sp[0] + '_l'], r = b[sp[0] + '_r'];
    if (!l || !r) return;
    var diff = Math.abs(l - r) / ((l + r) / 2) * 100;
    out.sides.push({ key: sp[0], label: sp[1], l: l, r: r, diff: r1(diff), bigger: l === r ? '' : l > r ? '左' : '右' });
    if (diff > out.maxDiff) out.maxDiff = r1(diff);
  });
  // 相對描述的左右差（沒有數字，但知道有差）
  out.relative = [];
  [['arm_len', '手臂長度'], ['leg_len', '腿長'], ['shoulder_height', '肩膀高度'], ['pelvis_height', '骨盆高度']].forEach(function (x) {
    var v = p.structure[x[0]];
    if (v && v !== 'same' && v !== 'unknown') out.relative.push(x[1] + '：' + FIELD_BY_KEY[x[0]].options[v]);
  });
  if (p.structure.arch === 'diff') out.relative.push('足弓：左右不同');
  out.suggestAsym = out.maxDiff >= SIDE_DIFF_PCT || out.relative.length > 0 ||
    OBSERVATIONS.some(function (x) { return x.asym && p.observations.indexOf(x.id) >= 0; });
  out.summary.push('左右：' + (out.maxDiff >= SIDE_DIFF_PCT || out.relative.length ? (out.relative.length ? '有結構上的差異' : '有部分差異') : (out.sides.length ? '接近' : '還沒有資料')));
  return out;
}

// 功能能力的傾向：以「動作類型」看試做結果；沒有試做才看自己填的。
var HOW_SCORE = { stable: 2, form: 1, short: 0 };
export function tendency(p, exById) {
  var base = p.prefs.freq === 'often' ? 3 : 2;
  var out = { weak: null, source: null, maxLevel: { lower: base, core: base, upper: base }, patternLevel: {}, weakPatterns: [], tested: 0 };
  var rs = {}, rc = {}, ps = {};
  Object.keys(p.capability).forEach(function (id) {
    var ex = exById[id], t = p.capability[id];
    if (!ex || HOW_SCORE[t.how] == null) return;
    var sc = HOW_SCORE[t.how];
    out.tested++;
    ps[ex.pattern] = ps[ex.pattern] == null ? sc : Math.min(ps[ex.pattern], sc);
    rs[ex.region] = (rs[ex.region] || 0) + sc; rc[ex.region] = (rc[ex.region] || 0) + 1;
  });
  var best = Math.max.apply(null, Object.keys(ps).map(function (k) { return ps[k]; }).concat([0]));
  Object.keys(ps).forEach(function (k) {
    out.patternLevel[k] = ps[k] === 0 ? 1 : ps[k] === 1 ? 2 : 3;
    if (ps[k] === 0 || (ps[k] === 1 && best === 2)) out.weakPatterns.push(k);
  });
  var regions = Object.keys(rc), avg = {};
  regions.forEach(function (r) { avg[r] = rs[r] / rc[r]; out.maxLevel[r] = avg[r] < 1 ? 1 : avg[r] < 2 ? 2 : 3; });
  if (regions.length >= 2) {
    var sorted = regions.slice().sort(function (a, b) { return avg[a] - avg[b]; });
    if (avg[sorted[sorted.length - 1]] - avg[sorted[0]] >= 1) { out.weak = sorted[0]; out.source = 'trial'; }
  }
  if (!out.weak && !regions.length) {
    if (p.prefs.strong === 'upper') { out.weak = 'lower'; out.source = 'self'; }
    if (p.prefs.strong === 'lower') { out.weak = 'upper'; out.source = 'self'; }
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
function kv(obj) { return Object.keys(obj).filter(function (k) { return obj[k] !== '' && obj[k] != null && obj[k] !== false && !(Array.isArray(obj[k]) && !obj[k].length); }).map(function (k) { return k + '=' + (Array.isArray(obj[k]) ? obj[k].join('|') : obj[k] === true ? 1 : obj[k]); }).join(';'); }
function unkv(s) {
  var out = {};
  String(s || '').split(';').forEach(function (part) { var i = part.indexOf('='); if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim(); });
  return out;
}
function optText(options) { return Object.keys(options).map(function (k) { return options[k]; }).join('／'); }

// 把資料寫成表格。空的 profile 就是空白表格。
export function toCSV(p, now) {
  var rows = [['代號（不要改）', '項目', '你的值', '單位或選項', '說明']];
  rows.push(['meta.version', '表格版本', PROFILE_VERSION, '', '不要改']);
  rows.push(['meta.saved_at', '這份檔案的時間', now ? now.toISOString() : '', '', '下載時自動填。超過 ' + STALE_WEEKS + ' 週會建議重新測量']);
  function fieldRows(list) {
    list.forEach(function (f) {
      var v = get(p, f.key);
      rows.push([f.key, f.label + (isRequired(f) ? '（必填）' : ''), v == null ? '' : f.type === 'choice' ? f.options[v] : v, f.type === 'choice' ? optText(f.options) : f.unit, f.why]);
    });
  }
  rows.push(['', '【基本資料】', '', '', '只有標「必填」的四項一定要填，其他都可以留空']);
  fieldRows(FIELDS.filter(function (f) { return !f.region; }));
  REGIONS.forEach(function (r) {
    rows.push(['', '【' + r.name + '】', '', '', '']);
    fieldRows(FIELDS.filter(function (f) { return f.region === r.id; }));
    var mine = OBSERVATIONS.filter(function (x) { return x.region === r.id; });
    rows.push(['obs.' + r.id, r.name + '：我注意到的', mine.filter(function (x) { return p.observations.indexOf(x.id) >= 0; }).map(function (x) { return x.label; }).join('、'),
      mine.map(function (x) { return x.label; }).join('／'), '可以填多個，用「、」分開。這是你自己的觀察，不是診斷']);
  });
  rows.push(['obs.other', '其他想改善的地方', p.otherNote || '', '', '自由填寫']);
  rows.push(['', '【左右差異、經驗和偏好】', '', '', '可以留空，在頁面上勾選']);
  Object.keys(CHOICES).forEach(function (key) {
    var ch = CHOICES[key], parts = key.split('.'), v = p[parts[0]][parts[1]];
    rows.push([key, ch.label, ch.multi ? (v || []).map(function (k) { return ch.options[k]; }).join('、') : (ch.options[v] || ''), optText(ch.options), ch.multi ? '可以填多個，用「、」分開' : '']);
  });
  rows.push(['', '【器材】', '', '', '可以留空']);
  GEAR.forEach(function (g) {
    var v = p.gear[g.key];
    rows.push(['gear.' + g.key, g.label, v == null ? '' : g.options ? g.options[v] : v, g.options ? optText(g.options) : g.unit, '']);
  });
  var extra = [];
  Object.keys(p.settings).forEach(function (k) { extra.push(['set.' + k, '頁面設定', p.settings[k], '', '']); });
  Object.keys(p.capability).forEach(function (id) { extra.push(['cap.' + id, '試做結果', kv(p.capability[id]), '', '']); });
  Object.keys(p.adj).forEach(function (id) { extra.push(['adj.' + id, '依回報的調整', kv(p.adj[id]), '', '']); });
  if (extra.length) { rows.push(['', '【頁面記下來的設定和回報】', '', '', '由頁面填寫，不用手動改']); rows = rows.concat(extra); }
  return '﻿' + rows.map(function (r) { return r.map(esc).join(','); }).join('\r\n') + '\r\n';
}

export function parseCSV(text) {
  var rows = [], row = [], cell = '', q = false, i, ch;
  text = String(text).replace(/^﻿/, '');
  for (i = 0; i < text.length; i++) {
    ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
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
var SPLIT = /[、,|／\/]/;

// 讀表格（版本 1 和 2 都讀得懂）。回傳 { profile, warnings }；格式完全不對時 profile 是 null。
export function fromCSV(text) {
  var rows = parseCSV(text), map = {}, warnings = [], p = emptyProfile();
  rows.forEach(function (r) { var k = (r[0] || '').trim(); if (k && /^[a-z]/.test(k)) map[k] = (r[2] == null ? '' : String(r[2])).trim(); });
  if (!('meta.version' in map) && !FIELDS.some(function (f) { return f.key in map; })) return { profile: null, warnings: ['這不是 Spinnin-Up 的表格，或第一欄的代號被改掉了。'] };
  if (map['meta.version'] && Number(map['meta.version']) > Number(PROFILE_VERSION)) warnings.push('這份表格的版本比較新，有些內容可能讀不到。');
  if (map['meta.saved_at'] && !isNaN(new Date(map['meta.saved_at']).getTime())) p.savedAt = new Date(map['meta.saved_at']).toISOString();
  FIELDS.forEach(function (f) {
    var raw = map[f.key];
    if (raw == null || raw === '') return;
    if (f.type === 'choice') {
      var code = choiceCode(f.options, raw);
      if (code) p[f.layer][f.key] = code; else warnings.push('「' + f.label + '」填的「' + raw + '」看不懂，先略過。');
    } else {
      var num = Number(raw.replace(/[^\d.\-]/g, ''));
      if (raw.replace(/[^\d]/g, '') === '' || isNaN(num) || num < f.min || num > f.max) warnings.push('「' + f.label + '」填的「' + raw + '」不在合理範圍（' + f.min + '–' + f.max + '），先略過。');
      else p[f.layer][f.key] = num;
    }
  });
  Object.keys(map).forEach(function (k) {
    if (k.indexOf('obs.') !== 0 || k === 'obs.other' || !map[k]) return;
    map[k].split(SPLIT).forEach(function (s) {
      s = s.trim();
      var hit = OBSERVATIONS.filter(function (x) { return x.id === s || x.label === s; })[0];
      if (hit && p.observations.indexOf(hit.id) < 0) p.observations.push(hit.id);
      else if (s && !hit) warnings.push('「' + s + '」不在選項裡，先略過。可以改寫在「其他想改善的地方」。');
    });
  });
  if (map['obs.other']) p.otherNote = map['obs.other'];
  Object.keys(CHOICES).forEach(function (key) {
    var raw = map[key], ch = CHOICES[key], parts = key.split('.');
    if (!raw) return;
    if (ch.multi) p[parts[0]][parts[1]] = raw.split(SPLIT).map(function (s) { return choiceCode(ch.options, s); }).filter(Boolean);
    else { var code = choiceCode(ch.options, raw); if (code) p[parts[0]][parts[1]] = code; else warnings.push('「' + ch.label + '」填的「' + raw + '」看不懂，先略過。'); }
  });
  GEAR.forEach(function (g) {
    var raw = map['gear.' + g.key];
    if (!raw) return;
    if (g.options) { var code = choiceCode(g.options, raw); if (code) p.gear[g.key] = code; }
    else { var num = Number(raw.replace(/[^\d.]/g, '')); if (num >= g.min && num <= g.max) p.gear[g.key] = num; }
  });
  Object.keys(map).forEach(function (k) {
    var kvs, id;
    if (k.indexOf('set.') === 0 && map[k] !== '') p.settings[k.slice(4)] = map[k];
    if (k.indexOf('cap.') === 0 || k.indexOf('trial.') === 0) {       // trial. 是版本 1 的名字
      kvs = unkv(map[k]); id = k.slice(k.indexOf('.') + 1);
      if (kvs.how) {
        p.capability[id] = { how: kvs.how, areas: kvs.areas ? kvs.areas.split('|') : [] };
        ['sec', 'secL', 'secR', 'rpe'].forEach(function (f) { if (kvs[f] != null && !isNaN(Number(kvs[f]))) p.capability[id][f] = Number(kvs[f]); });
        ['howL', 'howR'].forEach(function (f) { if (kvs[f]) p.capability[id][f] = kvs[f]; });
      }
    }
    if (k.indexOf('adj.') === 0) {
      kvs = unkv(map[k]);
      var a = {};
      ['dose', 'L', 'R', 'streak', 'streakL', 'streakR'].forEach(function (f) { if (kvs[f] != null && !isNaN(Number(kvs[f]))) a[f] = Number(kvs[f]); });
      if (kvs.stopped === '1') a.stopped = true;
      if (kvs.avoid === '1') a.avoid = true;
      if (Object.keys(a).length) p.adj[k.slice(4)] = a;
    }
  });
  return { profile: p, warnings: warnings };
}
