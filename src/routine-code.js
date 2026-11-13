// 訓練代碼：把課表變成網址 # 後面的一串字，或反過來讀回來。
// 格式（版本 1）：1;動作id.量.組數.休息秒[.左邊的量.右邊的量]~…;隔幾天.總次數
// 已經發出去的連結要一直讀得回來。改格式時要升版本號，並保留讀舊版本的程式。
import { clamp } from './util.js';

export const ROUTINE_VERSION = '1';

export function encode(items, freq) {
  if (!items.length) return '';
  return ROUTINE_VERSION + ';' + items.map(function (it) {
    var f = [it.id, it.dose, it.sets, it.rest];
    if (it.sideDose) f.push(it.sideDose.L, it.sideDose.R);     // 左右分開時多兩欄，舊連結沒有這兩欄
    return f.join('.');
  }).join('~') + ';' + freq.every + '.' + freq.count;
}

// exById：{ 動作id: 動作資料 }。讀不到的動作會略過，數字超出範圍會拉回範圍內。
export function decode(code, exById) {
  var parts = String(code || '').split(';'), lost = 0, items = [];
  if (parts[0] !== ROUTINE_VERSION || !parts[1]) return null;
  parts[1].split('~').forEach(function (s) {
    var f = s.split('.'), ex = exById[f[0]];
    if (!ex) { lost++; return; }
    var it = {
      id: ex.id,
      dose: clamp(parseInt(f[1], 10) || ex.dose.default, ex.dose.min, ex.dose.max),
      sets: clamp(parseInt(f[2], 10) || ex.sets, 1, 6),
      rest: clamp(isNaN(parseInt(f[3], 10)) ? ex.rest_sec : parseInt(f[3], 10), 0, 180)
    };
    var L = parseInt(f[4], 10), R = parseInt(f[5], 10);
    if (ex.sided && !isNaN(L) && !isNaN(R)) {
      it.sideDose = { L: clamp(L, ex.dose.min, ex.dose.max), R: clamp(R, ex.dose.min, ex.dose.max) };
      it.dose = Math.max(it.sideDose.L, it.sideDose.R);
    }
    items.push(it);
  });
  var fq = (parts[2] || '').split('.');
  return {
    items: items, lost: lost,
    freq: { every: clamp(parseInt(fq[0], 10) || 2, 1, 14), count: clamp(parseInt(fq[1], 10) || 10, 1, 60) }
  };
}
