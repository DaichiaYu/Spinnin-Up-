// 做完回報 → 下次怎麼調。不碰畫面。
// 規則：每次只調一小步；連續三次同方向才調兩步；回報疼痛是停掉這個動作，不是調整。
import { clamp } from './util.js';

export const HOW = { stable: '穩定做完', form: '後半段姿勢跑掉', short: '做不到預定的量' };

// 一邊（或不分邊）的量要怎麼變。回傳 { dose, streak, dir }
export function stepDose(ex, dose, how, streak, blockIncrease) {
  var dir = how === 'stable' ? 1 : -1;
  if (dir > 0 && blockIncrease) return { dose: dose, streak: 0, dir: 0 };
  streak = (streak || 0) * dir > 0 ? streak + dir : dir;
  var steps = Math.abs(streak) >= 3 ? 2 : 1;
  return { dose: clamp(dose + dir * steps * ex.dose.step, ex.dose.min, ex.dose.max), streak: streak, dir: dir };
}

// cur：{ dose, sideDose?: {L, R} }。answer：{ how } 或 { howL, howR }，加上 areas: [部位id]、pain: bool。
// 回傳 { adj, messages: [文字] }。adj 會存進檔案，下次排課表時用。
export function evaluate(ex, cur, answer, prevAdj, areaName) {
  var adj = Object.assign({}, prevAdj || {}), msgs = [], unit = ex.mode === 'hold' ? ' 秒' : ' 下';
  var name = areaName || function (id) { return id; };
  if (answer.pain) {
    adj.stopped = true;
    msgs.push('你回報有疼痛或不舒服，「' + ex.name + '」先停掉，之後排課表不會再排它。持續不舒服的話，請洽物理治療師或醫師。');
    return { adj: adj, messages: msgs };
  }
  var areas = answer.areas || [];
  var watchHits = ex.watch.filter(function (w) { return areas.indexOf(w.area) >= 0; });
  var primaryHit = !ex.primary.length || ex.primary.some(function (a) { return areas.indexOf(a) >= 0; });
  var block = watchHits.length > 0 || (areas.length > 0 && !primaryHit);
  watchHits.forEach(function (w) { msgs.push('你在「' + name(w.area) + '」有感覺：' + w.meaning); });
  if (areas.length && !primaryHit && !watchHits.length) {
    msgs.push('這個動作應該在「' + ex.primary.map(name).join('、') + '」有感覺，這次沒有。下次留意：' + (ex.cues[0] || ''));
  }
  var sided = ex.sided && answer.howL && answer.howR;
  if (sided) {
    var L0 = cur.sideDose ? cur.sideDose.L : cur.dose, R0 = cur.sideDose ? cur.sideDose.R : cur.dose;
    var l = stepDose(ex, L0, answer.howL, adj.streakL != null ? adj.streakL : adj.streak, block);
    var r = stepDose(ex, R0, answer.howR, adj.streakR != null ? adj.streakR : adj.streak, block);
    adj.L = l.dose; adj.R = r.dose; adj.streakL = l.streak; adj.streakR = r.streak;
    adj.dose = Math.max(l.dose, r.dose);
    delete adj.streak;
    if (l.dose !== L0 || r.dose !== R0) msgs.push('下次：左邊 ' + l.dose + unit + '、右邊 ' + r.dose + unit + '（這次是左 ' + L0 + '、右 ' + R0 + '）。');
    else if (!block) msgs.push('量先維持：左邊 ' + L0 + unit + '、右邊 ' + R0 + unit + '。');
    if (answer.howL !== answer.howR) msgs.push('左右兩邊做起來不一樣，下次兩邊分開設定。兩邊不一樣是可以的。');
  } else {
    var how = answer.how || answer.howL || answer.howR;
    var s = stepDose(ex, cur.dose, how, adj.streak, block);
    adj.dose = s.dose; adj.streak = s.streak;
    delete adj.L; delete adj.R; delete adj.streakL; delete adj.streakR;
    if (s.dose !== cur.dose) msgs.push('下次：' + s.dose + unit + '（這次是 ' + cur.dose + unit + '）。');
    else if (s.dir > 0 && ex.harder) msgs.push('已經到建議範圍的上限，想更難可以換成難一級的動作。');
    else if (s.dir < 0 && cur.dose <= ex.dose.min) {
      if (ex.easier) { adj.avoid = true; msgs.push('已經是最少的量還是吃力，下次改排簡單一級的動作。'); }
      else if (ex.easier_tip) msgs.push('已經是最少的量。可以這樣降低難度：' + ex.easier_tip);
    } else if (!block) msgs.push('量先維持在 ' + cur.dose + unit + '。');
  }
  if (block && !msgs.some(function (m) { return m.indexOf('下次：') === 0; })) msgs.push('這次先不加量，等感覺對了再加。');
  return { adj: adj, messages: msgs };
}

// 把調整套到課表上的一個動作。allowSides=false 時兩邊用一樣的量。
export function applyAdj(item, ex, adj, allowSides) {
  if (!adj || adj.dose == null) return item;
  var out = { id: item.id, dose: clamp(adj.dose, ex.dose.min, ex.dose.max), sets: item.sets, rest: item.rest };
  if (ex.sided && allowSides && adj.L != null && adj.R != null && adj.L !== adj.R) {
    out.sideDose = { L: clamp(adj.L, ex.dose.min, ex.dose.max), R: clamp(adj.R, ex.dose.min, ex.dose.max) };
    out.dose = Math.max(out.sideDose.L, out.sideDose.R);
  }
  return out;
}
