// 啟動：讀資料、讀網址裡的課表、畫出課表頁。
import * as ui from './ui.js';
import { session } from './store.js';
import { encode, decode } from './routine-code.js';
import { buildSteps, totalSec } from './workout-engine.js';

function getJSON(url) { return fetch(url).then(function (r) { if (!r.ok) throw new Error(url); return r.json(); }); }

ui.mount(document.getElementById('app'));
Promise.all([getJSON('data/exercises.json'), getJSON('data/areas.json'), getJSON('data/equipment.json')]).then(function (res) {
  var db = ui.db;
  db.list = res[0].exercises;
  db.list.forEach(function (e) { db.ex[e.id] = e; });
  res[1].areas.forEach(function (a) { db.areas[a.id] = a; });
  db.equip = res[2].equipment;
  db.equip.forEach(function (e) { ui.state.owned.add(e.id); });
  ui.loadFromHash();
  ui.renderPlan();
  window.addEventListener('hashchange', function () { if (!ui.currentPlayer() && ui.loadFromHash()) ui.renderPlan(); });
}).catch(function (e) {
  console.error(e);
  ui.renderError();
});

// 測試用：讓自動測試可以讀到內部狀態。不要拿掉（tests/ 會檢查）。
window.__spin = {
  session: session,
  state: ui.state,
  db: ui.db,
  buildSteps: function (items) { return buildSteps(items, ui.db.ex); },
  totalSec: function (items) { return totalSec(items, ui.db.ex); },
  encode: function () { return encode(ui.state.items, ui.state.freq); },
  decode: function (code) { return decode(code, ui.db.ex); },
  buildICS: function (start) { return ui.icsText(start); },
  player: function () { var p = ui.currentPlayer(); return p ? p.state : null; }
};
