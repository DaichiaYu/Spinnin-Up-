// 自動排課表的規則。不碰畫面。
// 輸入：今天的狀態和設定＋身體資料、試做結果、回報；輸出：課表＋每個動作為什麼排進來＋用了哪些資料。
// 使用者拿到之後仍然可以刪、換、改量。
//
// 資料的優先順序（body-profile-spec.md 第十一節）：
//   1 疼痛和今天不舒服的地方 → 2 不能做的 → 3 試做和回報 → 4 今天的狀態 → 5 今天的目標 → 6 偏好 → 7 尺寸 → 8 預設
import { REGION, canDo, totalSec } from './workout-engine.js';
import { tendency, analyze, OBSERVATIONS, REGIONS, REGION_AREAS, fieldOf } from './profile.js';
import { applyAdj } from './feedback.js';
import { clamp } from './util.js';

export const EFFECTS = { strength: '增加力量', muscle: '增加肌肉量', endurance: '增加肌耐力', activity: '提高活動量', control: '穩定、控制身體', mobility: '活動度、伸展', recover: '恢復、放鬆' };
export const WHERE = { all: '全身', upper: '上半身', lower: '下半身', core: '核心', area: '自己選部位' };
export const INTENSITY = { easy: '輕鬆動一下', normal: '正常訓練', push: '可以挑戰一點' };
export const ENERGY = { tired: '很累', normal: '普通', great: '精神很好' };
export const FATIGUE = { none: '幾乎沒有', some: '有點累', sore: '明顯痠累' };
export const PLACE = { any: '一般（地板、站著都可以）', bed: '在床上' };
export const MINUTES = [5, 10, 15, 20, 30, 45];
export const TRIAL_IDS = ['wall-sit', 'glute-bridge-hold', 'band-pull-apart-hold', 'tabletop-hold', 'single-leg-stand'];
export const PATTERN_NAMES = { squat: '蹲', hinge: '髖鉸鏈（彎腰）', bridge: '臀橋', lunge: '分腿蹲', calf: '小腿', balance: '單腳平衡', hip_abduction: '髖外展', hip_adduction: '大腿內夾',
  knee_extension: '伸膝', pull_horizontal: '水平拉', push_horizontal: '水平推', scap_retraction: '肩胛後收', elbow_flexion: '手臂彎舉', carry: '抱或提重物',
  anti_extension: '核心抗伸展', anti_rotation: '核心抗旋轉', anti_lateral_flexion: '核心抗側彎' };
var TRAIN_REGIONS = ['lower', 'core', 'upper'];
var CORE_PATTERNS = { squat: 1, hinge: 1, pull_horizontal: 1, push_horizontal: 1, anti_extension: 1 };
var CONTROL_PATTERNS = { balance: 1, anti_extension: 1, anti_rotation: 1, anti_lateral_flexion: 1 };
var FLOOR_POS = { supine: 1, prone: 1, side_lying: 1, plank: 1 };

// 彈性時間最多可以多幾分鐘（畫面上要用人話寫出來）
export function flexExtra(minutes) { return Math.max(1, Math.round(minutes * 0.15)); }

export function trialItems(exById, owned) {
  return TRIAL_IDS.map(function (id) {
    if (id === 'band-pull-apart-hold' && !canDo(exById[id], owned)) id = 'towel-pull-apart-hold';
    var ex = exById[id];
    return ex && canDo(ex, owned) ? { id: ex.id, dose: ex.dose.default, sets: 1, rest: 20 } : null;
  }).filter(Boolean);
}

export function relatedAreas(areaId, exercises) {
  var count = {};
  exercises.forEach(function (ex) {
    if (ex.primary.indexOf(areaId) < 0) return;
    ex.primary.concat(ex.secondary).forEach(function (a) { if (a !== areaId) count[a] = (count[a] || 0) + 1; });
  });
  return Object.keys(count).sort(function (a, b) { return count[b] - count[a] || a.localeCompare(b); }).slice(0, 4);
}

// 從身體資料整理出：要避開什麼、要多排什麼（各附原因，之後寫進理由）
export function profileSignals(P) {
  var limits = {}, boostAreas = {}, boostPatterns = {}, notes = [];
  function limit(k, whyText) { if (!limits[k]) limits[k] = whyText; }
  function boost(b, whyText) {
    (b.areas || []).forEach(function (a) { if (!boostAreas[a]) boostAreas[a] = whyText; });
    (b.patterns || []).forEach(function (x) { if (!boostPatterns[x]) boostPatterns[x] = whyText; });
  }
  (P.prefs.avoid || []).forEach(function (k) { limit(k, '你選了不想做或不能做'); });
  OBSERVATIONS.forEach(function (x) {
    if (P.observations.indexOf(x.id) < 0) return;
    if (x.limit) limit(x.limit, '你提到「' + x.label + '」');
    if (x.boost) boost(x.boost, '你提到「' + x.label + '」');
    if (x.note) notes.push(x.note);
  });
  var s = P.structure;
  if (s.grip === 'limited') limit('grip', '你填了握力有限');
  if (s.arm_len === 'l_short' || s.arm_len === 'r_short') limit('hands', '你填了左右手臂長度不同');
  if (P.asym.has === 'yes' && P.asym.mode === 'structural' && (P.asym.where || []).indexOf('upper') >= 0) limit('hands', '你的上肢左右差異是天生或受傷造成的');
  if (s.knee_track === 'in') boost({ areas: ['glute_side'] }, '你填了蹲下時膝蓋容易往內');
  if (s.arch === 'low' || s.arch === 'diff') boost({ areas: ['feet', 'calves'], patterns: ['balance'] }, '你填了足弓' + fieldOf('arch').options[s.arch].replace('我覺得', ''));
  if (s.ankle_roll === 'in' || s.ankle_roll === 'out') boost({ areas: ['feet'], patterns: ['balance'] }, '你填了腳踝' + fieldOf('ankle_roll').options[s.ankle_roll]);
  return { limits: limits, boostAreas: boostAreas, boostPatterns: boostPatterns, notes: notes };
}

// o：{ exercises, exById, areas, facets, owned, minutes, strict, effect, where, focus, intensity, energy, fatigue, sore: [身體區域], place, profile }
// 回傳 { items, why: {動作id: 文字}, reasons: [文字], used: [用了哪些資料] }
export function generateWorkout(o) {
  var P = o.profile, exById = o.exById, facets = o.facets || {}, t = tendency(P, exById), sig = profileSignals(P), body = analyze(P);
  var effect = EFFECTS[o.effect] ? o.effect : 'strength', where = WHERE[o.where] ? o.where : 'all';
  var gentle = effect === 'recover' || effect === 'mobility';
  var level = gentle ? 0 : ['easy', 'normal', 'push'].indexOf(INTENSITY[o.intensity] ? o.intensity : 'normal');
  var tiredToday = o.energy === 'tired' || o.fatigue === 'sore';
  if (tiredToday && level > 0) level--;
  var focusArea = where === 'area' && o.areas[o.focus] ? o.focus : null;
  var focusRegion = focusArea ? (TRAIN_REGIONS.indexOf(o.areas[focusArea].region) >= 0 ? o.areas[focusArea].region : null) : (where !== 'all' && where !== 'area' ? where : null);
  var asymMode = P.asym.has === 'yes' ? P.asym.mode : '';
  var wantSides = asymMode === 'separate' || asymMode === 'structural', allowSides = asymMode !== 'same';
  var sore = (o.sore || []).filter(function (r) { return REGION_AREAS[r]; }), soreAreas = {};
  sore.forEach(function (r) { REGION_AREAS[r].forEach(function (a) { soreAreas[a] = r; }); });
  var extra = o.strict ? 0 : flexExtra(o.minutes), budget = (o.minutes + extra) * 60;
  var maxSets = gentle ? 1 : level === 0 ? 2 : 3;
  var reasons = [], used = [], why = {}, dropped = { equip: 0, limit: {}, level: 0, stopped: 0, sore: 0, place: 0 };
  function areaName(id) { return o.areas[id] ? o.areas[id].name : id; }
  function capOf(ex) {
    var cap = t.patternLevel[ex.pattern] || t.maxLevel[ex.region];
    return gentle ? 1 : level === 0 ? Math.max(1, cap - 1) : cap;
  }
  function limitHit(ex) {
    var f = facets[ex.id] || {};
    if (sig.limits.hands && (ex.upper_load === 'full' || f.hand_support === 'bodyweight')) return 'hands';
    if (sig.limits.floor && o.place !== 'bed' && (f.positions ? f.positions.some(function (x) { return FLOOR_POS[x]; }) : ex.equipment.indexOf('mat') >= 0)) return 'floor';
    if (sig.limits.grip && f.grip === 'required') return 'grip';
    if (sig.limits.single && ex.sided) return 'single';
    return null;
  }
  function bedOk(ex) { var f = facets[ex.id]; return !!f && (f.special || []).indexOf('bed_ok') >= 0; }

  var targets = { lower: 0.4, core: 0.3, upper: 0.3 };
  if (focusRegion) { targets = { lower: 0.2, core: 0.2, upper: 0.2 }; targets[focusRegion] = 0.6; }
  else if (t.weak) TRAIN_REGIONS.forEach(function (r) { targets[r] += r === t.weak ? 0.1 : -0.05; });

  var pool = o.exercises.filter(function (ex) {
    var adj = P.adj[ex.id] || {}, hit;
    if (ex.category !== 'train') return false;
    if (ex.primary.some(function (a) { return soreAreas[a]; })) { dropped.sore++; return false; }
    if (adj.stopped) { dropped.stopped++; return false; }
    if (!canDo(ex, o.owned)) { dropped.equip++; return false; }
    if (o.place === 'bed' && !bedOk(ex)) { dropped.place++; return false; }
    if ((hit = limitHit(ex))) { dropped.limit[hit] = (dropped.limit[hit] || 0) + 1; return false; }
    if (adj.avoid || ex.level > capOf(ex)) { dropped.level++; return false; }
    return true;
  });

  function mkItem(ex) {
    var rest = effect === 'activity' ? Math.max(15, Math.round(ex.rest_sec * 0.6 / 5) * 5) : effect === 'endurance' ? Math.max(15, Math.round(ex.rest_sec * 0.7 / 5) * 5) : ex.rest_sec;
    var dose = ex.dose.default, hasAdj = P.adj[ex.id] && P.adj[ex.id].dose != null;
    if (!hasAdj && (effect === 'endurance' || level === 2)) dose = clamp(dose + ex.dose.step, ex.dose.min, ex.dose.max);
    if (!hasAdj && level === 0 && !gentle) dose = clamp(dose - ex.dose.step, ex.dose.min, ex.dose.max);
    return applyAdj({ id: ex.id, dose: dose, sets: gentle || level === 0 ? 1 : Math.min(ex.sets, maxSets), rest: rest }, ex, P.adj[ex.id], allowSides);
  }
  var warm = exById['march-in-place'], cool = exById['supine-breathing'], frame = [];
  var warmSore = warm && warm.primary.some(function (x) { return soreAreas[x]; });
  if (warm && !warmSore && o.place !== 'bed' && o.minutes >= 10) frame.push({ id: warm.id, dose: warm.dose.default, sets: 1, rest: 0 });
  var coolOk = cool && canDo(cool, o.owned) && !(sig.limits.floor && o.place !== 'bed') && (o.minutes >= 10 || gentle);
  var coolItem = coolOk ? { id: cool.id, dose: gentle ? 120 : cool.dose.default, sets: 1, rest: 0 } : null;

  var picked = [], usedIds = {}, patterns = {}, covered = {}, work = { lower: 0, core: 0, upper: 0 }, dead = {};
  function withFrame(list) { return frame.concat(list, coolItem ? [coolItem] : []); }
  function fits(list) { return totalSec(withFrame(list), exById) <= budget; }
  function score(ex) {
    var s = 0, cap = capOf(ex), target = effect === 'strength' || level === 2 ? cap : Math.min(cap, 2);
    if (!patterns[ex.pattern]) s += 3 + (CORE_PATTERNS[ex.pattern] ? 1 : 0);
    if (ex.primary.some(function (a) { return !covered[a]; })) s += 2;
    if (effect === 'activity' && ex.mode === 'reps') s += 2;
    if (effect === 'control' && (CONTROL_PATTERNS[ex.pattern] || ex.sided)) s += 2;
    if (effect !== 'activity' && P.prefs.style === 'hold' && ex.mode === 'hold') s += 1;
    if (effect !== 'activity' && P.prefs.style === 'reps' && ex.mode === 'reps') s += 1;
    if (focusArea && ex.primary.indexOf(focusArea) >= 0) s += 4;
    else if (focusArea && ex.secondary.indexOf(focusArea) >= 0) s += 1.5;
    if (ex.primary.some(function (a) { return sig.boostAreas[a]; }) || sig.boostPatterns[ex.pattern]) s += 2;
    if (t.weakPatterns.indexOf(ex.pattern) >= 0) s += 2;
    if (wantSides && ex.sided) s += 1;
    return s - Math.abs(ex.level - target);
  }
  function reason(ex, it) {
    var text, fresh = ex.primary.filter(function (a) { return !covered[a]; });
    var boostA = ex.primary.filter(function (a) { return sig.boostAreas[a]; })[0];
    if (focusArea && ex.primary.indexOf(focusArea) >= 0) text = '你選了「' + areaName(focusArea) + '」，這個動作主要練這裡。';
    else if (focusArea && ex.secondary.indexOf(focusArea) >= 0) text = '會一起用到「' + areaName(focusArea) + '」。';
    else if (t.weakPatterns.indexOf(ex.pattern) >= 0) text = '你試做「' + (PATTERN_NAMES[ex.pattern] || ex.pattern) + '」這類動作比較吃力，所以排一個難度合適的來練。';
    else if (boostA) text = sig.boostAreas[boostA] + '，所以多排會練到「' + areaName(boostA) + '」的動作。這只是讓這裡多練到，不是矯正。';
    else if (sig.boostPatterns[ex.pattern]) text = sig.boostPatterns[ex.pattern] + '，所以多排「' + (PATTERN_NAMES[ex.pattern] || ex.pattern) + '」。這只是多練到，不是矯正。';
    else if (where !== 'all' && focusRegion === ex.region) text = '你今天想練' + REGION[ex.region] + '。';
    else if (t.weak === ex.region) text = (t.source === 'trial' ? '你的' + REGION[ex.region] + '試做比較吃力' : '你說' + REGION[ex.region] + '比較沒力') + '，所以多排一點。';
    else if (fresh.length) text = '這組還沒練到「' + fresh.map(areaName).join('、') + '」。';
    else text = '補足' + REGION[ex.region] + '的份量。';
    if (P.adj[ex.id] && P.adj[ex.id].dose != null && P.adj[ex.id].dose !== ex.dose.default) text += '量是依你上次的回報調的。';
    if (it.sideDose) text += '左右分開設定。';
    return text;
  }

  var maxItems = Math.max(2, Math.round(o.minutes / 2.5));
  while (picked.length < maxItems) {
    var total = work.lower + work.core + work.upper || 1;
    var open = TRAIN_REGIONS.filter(function (r) { return !dead[r]; })
      .sort(function (a, b) { return (work[a] / total - targets[a]) - (work[b] / total - targets[b]); });
    if (!open.length) break;
    var region = open[0], placed = false;
    var cands = pool.filter(function (ex) { return ex.region === region && !usedIds[ex.id]; })
      .map(function (ex) { return { ex: ex, s: score(ex) }; })
      .sort(function (a, b) { return b.s - a.s || a.ex.level - b.ex.level || a.ex.id.localeCompare(b.ex.id); });
    for (var i = 0; i < cands.length && !placed; i++) {
      var ex = cands[i].ex, it = mkItem(ex);
      if (!fits(picked.concat([it]))) { if (it.sets > 1) it.sets = 1; if (!fits(picked.concat([it]))) continue; }
      why[ex.id] = reason(ex, it);
      picked.push(it); usedIds[ex.id] = 1; patterns[ex.pattern] = 1; work[region] += 1;
      ex.primary.forEach(function (a) { covered[a] = 1; });
      placed = true;
    }
    if (!placed) dead[region] = 1;
  }
  var grew = maxSets > 1 && picked.length > 0;
  while (grew) {
    grew = false;
    for (var g = 0; g < picked.length; g++) {
      if (picked[g].sets >= maxSets) continue;
      picked[g].sets++;
      if (fits(picked)) grew = true; else picked[g].sets--;
    }
  }

  var byRegion = { lower: [], upper: [], core: [] }, ordered = [], last = null;
  picked.forEach(function (it) { byRegion[exById[it.id].region].push(it); });
  Object.keys(byRegion).forEach(function (r) { byRegion[r].sort(function (a, b) { return exById[b.id].level - exById[a.id].level; }); });
  while (ordered.length < picked.length) {
    var choices = ['lower', 'upper', 'core'].filter(function (r) { return byRegion[r].length; })
      .sort(function (a, b) { return (a === last) - (b === last) || byRegion[b].length - byRegion[a].length; });
    last = choices[0];
    ordered.push(byRegion[last].shift());
  }
  if (frame.length) why[warm.id] = '暖身，讓身體熱起來。';
  if (coolItem) why[cool.id] = '收操，讓呼吸慢下來。';
  var items = picked.length ? withFrame(ordered) : [];

  // ---- 理由（照資料的優先順序寫） ----
  var regionName = function (id) { return REGIONS.filter(function (r) { return r.id === id; })[0].name; };
  if (sore.length) { reasons.push('你今天「' + sore.map(regionName).join('、') + '」不舒服，主要練這些地方的 ' + dropped.sore + ' 個動作先不排。不舒服持續的話，請洽物理治療師或醫師。'); used.push('今天不舒服的地方'); }
  if (dropped.stopped) { reasons.push('有 ' + dropped.stopped + ' 個動作你之前回報過疼痛，先不排。'); used.push('之前的疼痛回報'); }
  var LIMIT_NAME = { hands: '用手撐體重', floor: '躺或趴著', grip: '用力握東西', single: '一次只做一邊' };
  Object.keys(dropped.limit).forEach(function (k) { reasons.push(sig.limits[k] + '，所以需要「' + LIMIT_NAME[k] + '」的 ' + dropped.limit[k] + ' 個動作沒有排。'); });
  if (Object.keys(dropped.limit).length) used.push('不能做或不想做的');
  if (o.place === 'bed') reasons.push('你選了在床上做，只排床上做得了的動作（有 ' + dropped.place + ' 個不適合，沒有排）。床太軟的話，撐住的動作會比較晃。');
  if (dropped.equip) reasons.push('有 ' + dropped.equip + ' 個動作因為沒有需要的器材，沒有排進來。');
  if (t.tested) {
    used.push('試做結果');
    if (t.weakPatterns.length) reasons.push('試做時比較吃力的是：' + t.weakPatterns.map(function (k) { return PATTERN_NAMES[k] || k; }).join('、') + '。這類動作會排，但選難度低一點的。');
    else reasons.push('試做的幾類動作都還穩，難度照一般的排。');
  } else reasons.push('還沒有試做結果，難度先用一般的預設。做過試做動作後會更準。');
  if (Object.keys(P.adj).length) used.push('之前的回報');
  if (tiredToday && !gentle) reasons.push('你今天' + (o.energy === 'tired' ? '很累' : '明顯痠累') + '，所以比你選的強度再降一級。');
  if (o.energy || o.fatigue) used.push('今天的狀態');
  reasons.push('今天的目標：' + EFFECTS[effect] + '；範圍：' + (focusArea ? areaName(focusArea) : WHERE[where]) + '；強度：' + (gentle ? '輕鬆' : INTENSITY[['easy', 'normal', 'push'][level]]) + '。');
  if (effect === 'mobility') reasons.push('動作庫目前還沒有伸展和活動度的動作，所以這次先排最簡單的動作各一組。');
  if (effect === 'recover') reasons.push('只排最簡單的動作、每個做一組。');
  if (effect === 'endurance') reasons.push('練肌耐力：每個動作的量多一點、休息短一點。');
  if (effect === 'activity') reasons.push('提高活動量：多排會動的動作、休息短一點。');
  if (effect === 'control') reasons.push('練穩定和控制：多排平衡、核心抗動、一次做一邊的動作。');
  if (focusArea && !focusRegion) reasons.push('「' + areaName(focusArea) + '」沒有專門的動作，改成平均排。');
  var boostWhy = {};
  Object.keys(sig.boostAreas).forEach(function (a) { boostWhy[sig.boostAreas[a]] = 1; });
  Object.keys(sig.boostPatterns).forEach(function (a) { boostWhy[sig.boostPatterns[a]] = 1; });
  if (Object.keys(boostWhy).length) { reasons.push(Object.keys(boostWhy).join('、') + '，相關的部位會多排一點。這些是你自己的觀察，這裡只是讓那些地方多練到，不是診斷或矯正。'); used.push('你注意到的地方'); }
  sig.notes.forEach(function (x) { reasons.push(x); });
  if ((P.prefs.longGoals || []).indexOf('fat') >= 0) reasons.push('你的長期目標有減脂。減脂主要看飲食和整體活動量，單次課表的差別不大；持續做比較重要。');
  if (!focusRegion && t.weak) reasons.push(t.source === 'trial' ? '整體來看' + REGION[t.weak] + '比較吃力，所以多排一點。' : '你說' + REGION[t.weak] + '比較沒力，所以多排一點。');
  if (wantSides) reasons.push((asymMode === 'structural' ? '你的左右差異是天生或受傷造成的，這裡不把「兩邊練成一樣」當目標' : '你選了左右分開') + '，所以多排一次做一邊的動作，兩邊可以用不同的量。左右差異以個人狀況為準，有疑慮請洽自己的物理治療師。');
  if (body.sides.length || body.relative.length) used.push('身體尺寸（只用來提醒左右差異，不直接決定難度）');
  if (P.prefs.style && P.prefs.style !== 'both') used.push('動作偏好');
  reasons.push('時間：' + o.minutes + ' 分鐘' + (o.strict ? '，不超過。' : '左右，最多可以多 ' + extra + ' 分鐘。'));
  if (!picked.length) reasons.push('照這些條件排不出動作。可以把時間拉長，或把器材和限制放寬一點。');
  return { items: items, why: why, reasons: reasons, used: used };
}
