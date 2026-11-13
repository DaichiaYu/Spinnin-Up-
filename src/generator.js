// 自動排課表的規則。不碰畫面。
// 輸入：今天的設定（時間、目標、器材）＋身體資料和回報；輸出：課表＋每個動作為什麼排進來。
// 使用者拿到之後仍然可以刪、換、改量。
import { REGION, canDo, totalSec } from './workout-engine.js';
import { tendency } from './profile.js';
import { applyAdj } from './feedback.js';

export const GOALS = { strength: '增肌、練力氣', fat: '減脂', focus: '加強某個部位', relax: '輕鬆動一動' };
export const MINUTES = [10, 15, 20, 30];
export const TRIAL_IDS = ['wall-sit', 'glute-bridge-hold', 'band-pull-apart-hold', 'tabletop-hold'];
var TRAIN_REGIONS = ['lower', 'core', 'upper'];
// 基本的動作類型，優先排進來
var CORE_PATTERNS = { squat: 1, hinge: 1, pull_horizontal: 1, push_horizontal: 1, anti_extension: 1 };
var MAX_SETS = 3;

// 試做的課表：四個動作各一組。沒有彈力帶就用毛巾。
export function trialItems(exById, owned) {
  return TRIAL_IDS.map(function (id) {
    if (id === 'band-pull-apart-hold' && !canDo(exById[id], owned)) id = 'towel-pull-apart-hold';
    var ex = exById[id];
    return ex && canDo(ex, owned) ? { id: ex.id, dose: ex.dose.default, sets: 1, rest: 20 } : null;
  }).filter(Boolean);
}

// 跟某個部位常常一起用到的部位（選「加強某個部位」時顯示）
export function relatedAreas(areaId, exercises) {
  var count = {};
  exercises.forEach(function (ex) {
    if (ex.primary.indexOf(areaId) < 0) return;
    ex.primary.concat(ex.secondary).forEach(function (a) { if (a !== areaId) count[a] = (count[a] || 0) + 1; });
  });
  return Object.keys(count).sort(function (a, b) { return count[b] - count[a] || a.localeCompare(b); }).slice(0, 4);
}

// o：{ exercises, exById, areas: {id: {name, region}}, owned: Set, minutes, strict, goal, focus, profile }
// 回傳 { items, why: {動作id: 文字}, reasons: [文字] }
export function generateWorkout(o) {
  var P = o.profile, exById = o.exById, t = tendency(P, exById);
  var relax = o.goal === 'relax', fat = o.goal === 'fat';
  var focusArea = o.goal === 'focus' && o.areas[o.focus] ? o.focus : null;
  var focusRegion = focusArea && TRAIN_REGIONS.indexOf(o.areas[focusArea].region) >= 0 ? o.areas[focusArea].region : null;
  var avoid = P.prefs.avoid || [], asymMode = P.asym.has === 'yes' ? P.asym.mode : '';
  var wantSides = asymMode === 'separate' || asymMode === 'structural';
  var allowSides = asymMode !== 'same';     // 除非使用者選了「兩邊用一樣的量」，回報出來的左右差會保留
  var noHands = avoid.indexOf('hands') >= 0 || (asymMode === 'structural' && (P.asym.where || []).indexOf('upper') >= 0);
  var noFloor = avoid.indexOf('floor') >= 0;
  var budget = o.minutes * 60 * (o.strict ? 1 : 1.15);
  var reasons = [], why = {}, dropped = { equip: 0, avoid: 0, level: 0, stopped: 0 };
  function areaName(id) { return o.areas[id] ? o.areas[id].name : id; }

  var targets = { lower: 0.4, core: 0.3, upper: 0.3 };
  if (focusRegion) { targets = { lower: 0.2, core: 0.2, upper: 0.2 }; targets[focusRegion] = 0.6; }
  else if (t.weak) { TRAIN_REGIONS.forEach(function (r) { targets[r] += r === t.weak ? 0.1 : -0.05; }); }

  var pool = o.exercises.filter(function (ex) {
    var adj = P.adj[ex.id] || {};
    if (ex.category !== 'train') return false;
    if (!canDo(ex, o.owned)) { dropped.equip++; return false; }
    if ((noHands && ex.upper_load === 'full') || (noFloor && ex.equipment.indexOf('mat') >= 0)) { dropped.avoid++; return false; }
    if (adj.stopped) { dropped.stopped++; return false; }
    if (adj.avoid || ex.level > (relax ? 1 : t.maxLevel[ex.region])) { dropped.level++; return false; }
    return true;
  });

  function mkItem(ex) {
    var rest = fat ? Math.max(15, Math.round(ex.rest_sec * 0.6 / 5) * 5) : ex.rest_sec;
    return applyAdj({ id: ex.id, dose: ex.dose.default, sets: relax ? 1 : ex.sets, rest: rest }, ex, P.adj[ex.id], allowSides);
  }
  var warm = exById['march-in-place'], cool = exById['supine-breathing'], frame = [];
  if (warm) frame.push({ id: warm.id, dose: warm.dose.default, sets: 1, rest: 0 });
  var coolItem = cool && canDo(cool, o.owned) && !noFloor ? { id: cool.id, dose: relax ? 120 : cool.dose.default, sets: 1, rest: 0 } : null;

  var picked = [], used = {}, patterns = {}, covered = {}, work = { lower: 0, core: 0, upper: 0 }, dead = {};
  function withFrame(list) { return frame.concat(list, coolItem ? [coolItem] : []); }
  function fits(list) { return totalSec(withFrame(list), exById) <= budget; }
  function score(ex) {
    var s = 0, target = Math.min(t.maxLevel[ex.region], 2);
    if (!patterns[ex.pattern]) s += 3 + (CORE_PATTERNS[ex.pattern] ? 1 : 0);
    if (ex.primary.some(function (a) { return !covered[a]; })) s += 2;
    if (fat && ex.mode === 'reps') s += 2;
    if (!fat && P.prefs.style === 'hold' && ex.mode === 'hold') s += 1;
    if (!fat && P.prefs.style === 'reps' && ex.mode === 'reps') s += 1;
    if (focusArea && ex.primary.indexOf(focusArea) >= 0) s += 4;
    else if (focusArea && ex.secondary.indexOf(focusArea) >= 0) s += 1.5;
    if (wantSides && ex.sided) s += 1;
    return s - Math.abs(ex.level - target);
  }
  function reason(ex, it) {
    var text, fresh = ex.primary.filter(function (a) { return !covered[a]; });
    if (focusArea && ex.primary.indexOf(focusArea) >= 0) text = '你選了加強「' + areaName(focusArea) + '」，這個動作主要練這裡。';
    else if (focusArea && ex.secondary.indexOf(focusArea) >= 0) text = '會一起用到「' + areaName(focusArea) + '」。';
    else if (t.weak === ex.region) text = (t.source === 'trial' ? '你的' + REGION[ex.region] + '試做比較吃力' : '你說' + REGION[ex.region] + '比較沒力') + '，所以多排一點。';
    else if (fresh.length) text = '這組還沒練到「' + fresh.map(areaName).join('、') + '」。';
    else text = '補足' + REGION[ex.region] + '的份量。';
    if (P.adj[ex.id] && P.adj[ex.id].dose != null && P.adj[ex.id].dose !== ex.dose.default) text += '量是依你上次的回報調的。';
    if (it.sideDose) text += '左右分開設定。';
    return text;
  }

  // 各部位的比例用「動作數」算
  var maxItems = Math.max(3, Math.round(o.minutes / 2.5));     // 大約每 2.5 分鐘一個動作，剩下的時間用來多做幾組
  while (picked.length < maxItems) {
    var total = work.lower + work.core + work.upper || 1;
    var open = TRAIN_REGIONS.filter(function (r) { return !dead[r]; })
      .sort(function (a, b) { return (work[a] / total - targets[a]) - (work[b] / total - targets[b]); });
    if (!open.length) break;
    var region = open[0], placed = false;
    var cands = pool.filter(function (ex) { return ex.region === region && !used[ex.id]; })
      .map(function (ex) { return { ex: ex, s: score(ex) }; })
      .sort(function (a, b) { return b.s - a.s || a.ex.level - b.ex.level || a.ex.id.localeCompare(b.ex.id); });
    for (var i = 0; i < cands.length && !placed; i++) {
      var ex = cands[i].ex, it = mkItem(ex);
      if (!fits(picked.concat([it]))) { if (it.sets > 1) it.sets = 1; if (!fits(picked.concat([it]))) continue; }
      why[ex.id] = reason(ex, it);
      picked.push(it); used[ex.id] = 1; patterns[ex.pattern] = 1; work[region] += 1;
      ex.primary.forEach(function (a) { covered[a] = 1; });
      placed = true;
    }
    if (!placed) dead[region] = 1;
  }

  // 動作都排完了還有時間：輪流多加一組（最多 MAX_SETS 組）
  var grew = !relax && picked.length > 0;
  while (grew) {
    grew = false;
    for (var g = 0; g < picked.length; g++) {
      if (picked[g].sets >= MAX_SETS) continue;
      picked[g].sets++;
      if (fits(picked)) grew = true; else picked[g].sets--;
    }
  }

  // 順序：同一個部位盡量不連排；每個部位裡比較難的先做
  var byRegion = { lower: [], upper: [], core: [] }, ordered = [];
  picked.forEach(function (it) { byRegion[exById[it.id].region].push(it); });
  Object.keys(byRegion).forEach(function (r) { byRegion[r].sort(function (a, b) { return exById[b.id].level - exById[a.id].level; }); });
  var last = null;
  while (ordered.length < picked.length) {
    var choices = ['lower', 'upper', 'core'].filter(function (r) { return byRegion[r].length; })
      .sort(function (a, b) { return (a === last) - (b === last) || byRegion[b].length - byRegion[a].length; });
    last = choices[0];
    ordered.push(byRegion[last].shift());
  }

  if (warm) why[warm.id] = '暖身，讓身體熱起來。';
  if (coolItem) why[cool.id] = '收操，讓呼吸慢下來。';
  var items = picked.length ? withFrame(ordered) : [];
  reasons.push('時間：' + o.minutes + ' 分鐘' + (o.strict ? '，不超過。' : '，可以多一點點（最多多 15%）。'));
  reasons.push('目標：' + GOALS[o.goal] + (focusArea ? '「' + areaName(focusArea) + '」' : '') + '。');
  if (focusArea && !focusRegion) reasons.push('這個部位沒有專門的動作，改成排一組平均的。');
  if (!focusRegion && t.weak) reasons.push(t.source === 'trial' ? '依試做的結果，' + REGION[t.weak] + '比較吃力，所以多排一點。' : '你說' + REGION[t.weak] + '比較沒力，所以多排一點。做過試做動作後會改用試做的結果。');
  if (!focusRegion && !t.weak) reasons.push('還看不出上下半身哪邊比較需要加強，先平均排。做過試做動作後會更準。');
  if (fat) reasons.push('減脂主要還是看飲食。這組只是選比較多會動的動作、休息短一點，讓整體活動量高一些。');
  if (relax) reasons.push('只排最簡單的動作、每個做一組。目前動作庫還沒有伸展動作。');
  if (dropped.equip) reasons.push('有 ' + dropped.equip + ' 個動作因為沒有需要的器材，沒有排進來。');
  if (dropped.avoid) reasons.push('有 ' + dropped.avoid + ' 個動作因為你不想做或不適合（' + (noHands ? '用手撐體重' : '') + (noHands && noFloor ? '、' : '') + (noFloor ? '躺或趴在地上' : '') + '），沒有排進來。');
  if (dropped.stopped) reasons.push('有 ' + dropped.stopped + ' 個動作你之前回報過疼痛，先不排。');
  if (wantSides) reasons.push('你選了左右分開，所以多排了一次做一邊的動作。左右差異以個人狀況為準，有疑慮請洽自己的物理治療師。');
  if (!picked.length) reasons.push('照這些條件排不出動作。可以把時間拉長，或把器材和限制放寬一點。');
  return { items: items, why: why, reasons: reasons };
}
