// 訓練邏輯：課表怎麼展開成一步一步、總時間、部位比例、器材夠不夠。
// 這一層不碰畫面，第 3 階段的「產生課表」規則也放這裡。
export const SEC_PER_REP = 4;            // 算次數的動作，估時間時一下算幾秒
export const REGION = { lower: '下半身', core: '核心', upper: '上半身', full: '暖身／收操' };
export const REGION_ORDER = ['lower', 'core', 'upper', 'full'];
export const SAMPLE = ['march-in-place', 'wall-sit', 'glute-bridge-hold', 'single-leg-tabletop-hold',
  'prone-w-hold', 'calf-raise-hold', 'supine-breathing'];

export function newItem(ex) { return { id: ex.id, dose: ex.dose.default, sets: ex.sets, rest: ex.rest_sec }; }

// 每個動作的每一組（左右分開的拆成兩步）前面都有一個「準備／休息／換邊」的步驟。
export function buildSteps(items, exById) {
  var steps = [], prev = null;
  items.forEach(function (it, idx) {
    var ex = exById[it.id], sides = ex.sided ? ['左邊', '右邊'] : [null], s;
    for (s = 1; s <= it.sets; s++) {
      sides.forEach(function (side) {
        var work = { kind: 'work', idx: idx, ex: ex, it: it, set: s, sets: it.sets, side: side,
          timed: ex.mode === 'hold', dur: ex.mode === 'hold' ? it.dose : it.dose * SEC_PER_REP };
        var ready = { kind: 'ready', timed: true, next: work };
        if (!prev) { ready.dur = 8; ready.label = '準備'; ready.newEx = true; }
        else if (prev.idx === idx && prev.set === s) { ready.dur = 5; ready.label = '換邊'; }
        else if (prev.idx === idx) { ready.dur = Math.max(5, it.rest); ready.label = '休息'; }
        else { ready.dur = Math.max(8, prev.it.rest); ready.label = '休息'; ready.newEx = true; }
        steps.push(ready, work);
        prev = work;
      });
    }
  });
  return steps;
}

export function totalSec(items, exById) {
  return buildSteps(items, exById).reduce(function (a, s) { return a + s.dur; }, 0);
}

export function regionShare(items, exById) {
  var share = { lower: 0, core: 0, upper: 0, full: 0 }, total = 0;
  buildSteps(items, exById).forEach(function (s) {
    if (s.kind === 'work') { share[s.ex.region] += s.dur; total += s.dur; }
  });
  return { share: share, total: total };
}

// owned：Set，使用者手邊有的器材 id。
export function canDo(ex, owned) {
  return ex.equipment.every(function (q) { return q === 'none' || owned.has(q); });
}
export function missingEquipment(ex, owned, equipList) {
  return ex.equipment.filter(function (q) { return q !== 'none' && !owned.has(q); }).map(function (q) {
    var e = equipList.find(function (x) { return x.id === q; });
    return e ? e.name : q;
  });
}

// 替換時建議的動作：資料裡寫的替代、簡單一級、難一級。
export function swapSuggestions(ex, exById) {
  return ex.swaps.concat([ex.easier, ex.harder]).filter(function (id, i, a) {
    return id && exById[id] && a.indexOf(id) === i && id !== ex.id;
  }).map(function (id) { return exById[id]; });
}
