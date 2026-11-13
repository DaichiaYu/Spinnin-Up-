// 畫面：課表頁、加動作／替換、行事曆、聲音設定、播放畫面。
// 這裡只負責顯示和收集操作；訓練規則放 workout-engine.js，時間邏輯放 player.js。
import { clamp, pad } from './util.js';
import { encode, decode } from './routine-code.js';
import { REGION, REGION_ORDER, SAMPLE, newItem, buildSteps, totalSec, regionShare, canDo, missingEquipment, swapSuggestions } from './workout-engine.js';
import { buildICS, validateCalendarInput } from './calendar.js';
import { createPlayer } from './player.js';
import * as sound from './sound.js';

import { db, state, session } from './store.js';
import { h, toast, downloadText } from './dom.js';
import * as screens from './screens.js';
export { db, state };
var app = null;
var player = null, ticker = null, wake = null, hl = null;

export function areaName(id) { return db.areas[id] ? db.areas[id].name : id; }
export function img(ex) { return h('img', { src: 'assets/exercises/' + ex.id + '.svg', alt: ex.name + '的姿勢示意圖', loading: 'lazy' }); }
function doseText(ex, it) {
  var unit = ex.mode === 'hold' ? ' 秒' : ' 下';
  if (it.sideDose) return '左 ' + it.sideDose.L + '／右 ' + it.sideDose.R + unit + ' × ' + it.sets + ' 組';
  return it.dose + unit + ' × ' + it.sets + ' 組' + (ex.sided ? '（每邊）' : '');
}
function steps() { return buildSteps(state.items, db.ex); }

/* ---------- 網址裡的課表 ---------- */
export function currentCode() { return encode(state.items, state.freq); }
function link() { return location.origin + location.pathname + '#r=' + currentCode(); }
export function syncHash() {
  var c = currentCode();
  history.replaceState(null, '', c ? '#r=' + c : location.pathname + location.search);
}
export function loadFromHash() {
  var m = /[#&]r=([^&]+)/.exec(location.hash);
  if (!m) return false;
  var r = decode(decodeURIComponent(m[1]), db.ex);
  if (!r) return false;
  state.items = r.items;
  state.freq = r.freq;
  if (r.lost) toast('連結裡有 ' + r.lost + ' 個動作已經不在資料庫，先略過了');
  return true;
}

/* ========== 課表頁（預覽和編輯） ========== */
export function mount(el) { app = el; }

export function renderPlan() {
  stopPlayer();
  app.textContent = '';
  var wrap = h('div', { class: 'wrap' },
    h('header', { class: 'top' },
      h('h1', { text: 'Spinnin-Up' }),
      h('nav', { class: 'toplinks' },
        state.items.length ? h('button', { class: 'linkbtn', id: 'nav-home', text: '首頁', onclick: goHome }) : null,
        h('a', { href: 'catalog.html', text: '動作總覽' }))));
  app.appendChild(wrap);

  if (!state.items.length) {
    screens.renderHome(wrap, { useSample: useSample, addOwn: function () { openPicker(null); } });
    wrap.appendChild(footerNote());
    return;
  }

  var sec = totalSec(state.items, db.ex), rs = regionShare(state.items, db.ex);
  var bar = h('div', { class: 'bar', role: 'img', 'aria-label': '各部位的時間比例' });
  var legend = h('div', { class: 'legend' });
  REGION_ORDER.forEach(function (r) {
    if (!rs.share[r]) return;
    var pct = Math.round(rs.share[r] / rs.total * 100);
    bar.appendChild(h('span', { class: 'seg-' + r, style: 'width:' + pct + '%' }));
    legend.appendChild(h('span', {}, h('i', { class: 'seg-' + r }), REGION[r] + ' ' + pct + '%'));
  });
  var counts = {};
  state.items.forEach(function (it) {
    db.ex[it.id].primary.forEach(function (a) { counts[a] = (counts[a] || 0) + 1; });
  });
  var chips = h('div', { class: 'chips' }, Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; })
    .map(function (a) { return h('span', { class: 'chip p', text: areaName(a) + (counts[a] > 1 ? ' ×' + counts[a] : '') }); }));

  wrap.appendChild(h('section', { class: 'card summary', 'aria-label': '這組訓練的摘要' },
    h('div', { class: 'big', id: 'sum-total', text: state.items.length + ' 個動作・大約 ' + Math.max(1, Math.round(sec / 60)) + ' 分鐘' }),
    bar, legend,
    h('p', { class: 'mute', text: '這組主要會用到：' }), chips));

  if (session.reasons.length) {
    wrap.appendChild(h('details', { class: 'card reasons', id: 'reasons', open: true },
      h('summary', { text: '為什麼這樣排' }),
      h('ul', {}, session.reasons.map(function (r) { return h('li', { text: r }); })),
      session.used.length ? h('p', { class: 'mute', id: 'used', text: '這次用到的資料：' + session.used.join('、') + '。' }) : null,
      h('p', { class: 'mute', text: '這是系統的建議。每個動作都可以刪掉、替換或改量，最後由你決定。' })));
  }

  wrap.appendChild(h('div', { class: 'row' },
    h('button', { class: 'btn small', id: 'btn-link', text: shareLabel(), onclick: copyLink }),
    h('button', { class: 'btn small', id: 'btn-ics', text: '加入行事曆', onclick: openCalendar }),
    h('button', { class: 'btn small', id: 'btn-sound', text: soundLabel(), onclick: openSound }),
    h('span', { class: 'spacer' }),
    h('button', { class: 'btn small ghost danger', text: '全部清空', onclick: function () {
      if (confirm('確定要清空這組課表嗎？')) goHome();
    } })));

  var list = h('div', { id: 'list' });
  state.items.forEach(function (it, i) { list.appendChild(itemRow(it, i)); });
  wrap.appendChild(list);
  wrap.appendChild(footerNote());

  app.appendChild(h('div', { class: 'dock' }, h('div', { class: 'row' },
    h('button', { class: 'btn', id: 'btn-add', text: '＋ 加動作', onclick: function () { openPicker(null); } }),
    h('button', { class: 'btn accent', id: 'btn-start', text: '開始', onclick: startPlayer }))));
}

function goHome() { state.items = []; session.why = {}; session.reasons = []; session.used = []; syncHash(); renderPlan(); }
export function footerNote() {
  return h('footer', { class: 'note', text: '內容是一般訓練常識的整理，以個人狀況為準；有疼痛或疑慮，請洽自己的物理治療師或醫師。你填的資料只留在這個頁面裡，不會傳到任何地方；要保存請下載檔案。' });
}

function gearNote(ex) {
  var g = session.profile.gear, out = [];
  if (ex.equipment.indexOf('dumbbell') >= 0 && g.dumbbell_kg) out.push('啞鈴 ' + g.dumbbell_kg + ' 公斤');
  if (ex.equipment.indexOf('weight_bag') >= 0 && g.bag_kg) out.push('包包大約 ' + g.bag_kg + ' 公斤');
  if (ex.equipment.indexOf('band') >= 0 && g.band && g.band !== 'unknown') out.push('彈力帶：' + { light: '輕', medium: '中', heavy: '重' }[g.band]);
  return out.length ? '你的器材：' + out.join('、') : '';
}

function stepper(label, text, onMinus, onPlus, canMinus, canPlus) {
  return h('span', { class: 'stepper', role: 'group', 'aria-label': label },
    h('button', { 'aria-label': label + '減少', disabled: !canMinus, onclick: onMinus, text: '−' }),
    h('output', { text: text }),
    h('button', { 'aria-label': label + '增加', disabled: !canPlus, onclick: onPlus, text: '＋' }));
}

function itemRow(it, i) {
  var ex = db.ex[it.id], d = ex.dose;
  var unit = ex.mode === 'hold' ? ' 秒' : ' 下';
  function change(fn) { fn(); syncHash(); renderPlan(); }
  function setSide(k, v) { it.sideDose[k] = clamp(v, d.min, d.max); it.dose = Math.max(it.sideDose.L, it.sideDose.R); }
  var row = h('article', { class: 'card item', 'data-id': ex.id },
    h('div', { class: 'fig' }, img(ex)),
    h('div', {},
      h('h3', { text: (i + 1) + '. ' + ex.name }),
      h('p', { class: 'mute', text: REGION[ex.region] + '｜' + doseText(ex, it) }),
      h('div', { class: 'chips' },
        ex.primary.map(function (a) { return h('span', { class: 'chip p', text: areaName(a) }); }),
        ex.secondary.map(function (a) { return h('span', { class: 'chip', text: areaName(a) }); })),
      h('p', { class: 'effect', text: ex.effect }),
      session.why[ex.id] ? h('p', { class: 'why', text: '為什麼排這個：' + session.why[ex.id] }) : null,
      gearNote(ex) ? h('p', { class: 'mute', text: gearNote(ex) }) : null),
    h('details', { class: 'how' },
      h('summary', { text: '怎麼做、注意什麼' }),
      h('h4', { text: '步驟' }), h('ol', {}, ex.setup.map(function (s) { return h('li', { text: s }); })),
      h('h4', { text: '提示' }), h('ul', {}, ex.cues.map(function (s) { return h('li', { text: s }); })),
      ex.avoid.length ? [h('h4', { text: '避免' }), h('ul', {}, ex.avoid.map(function (s) { return h('li', { text: s }); }))] : null,
      ex.watch.length ? [h('h4', { text: '如果這些地方有感覺' }),
        h('ul', {}, ex.watch.map(function (w) { return h('li', {}, h('b', { text: areaName(w.area) }), '：' + w.meaning); }))] : null,
      ex.easier_tip ? h('p', { class: 'mute', text: '太難的話：' + ex.easier_tip }) : null),
    h('div', { class: 'controls' },
      it.sideDose ? ['L', 'R'].map(function (k) {
        var nm = k === 'L' ? '左邊' : '右邊';
        return stepper(nm + (ex.mode === 'hold' ? '秒數' : '次數'), nm.charAt(0) + ' ' + it.sideDose[k] + unit,
          function () { change(function () { setSide(k, it.sideDose[k] - d.step); }); },
          function () { change(function () { setSide(k, it.sideDose[k] + d.step); }); },
          it.sideDose[k] > d.min, it.sideDose[k] < d.max);
      }) : stepper(ex.mode === 'hold' ? '秒數' : '次數', it.dose + unit,
        function () { change(function () { it.dose = clamp(it.dose - d.step, d.min, d.max); }); },
        function () { change(function () { it.dose = clamp(it.dose + d.step, d.min, d.max); }); },
        it.dose > d.min, it.dose < d.max),
      stepper('組數', it.sets + ' 組',
        function () { change(function () { it.sets = clamp(it.sets - 1, 1, 6); }); },
        function () { change(function () { it.sets = clamp(it.sets + 1, 1, 6); }); },
        it.sets > 1, it.sets < 6),
      ex.sided ? h('button', { class: 'btn small', 'data-sides': ex.id, 'aria-pressed': String(!!it.sideDose), text: it.sideDose ? '左右改回一樣' : '左右分開',
        onclick: function () { change(function () { if (it.sideDose) delete it.sideDose; else it.sideDose = { L: it.dose, R: it.dose }; }); } }) : null,
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn small', 'aria-label': '往上移', disabled: i === 0, text: '↑',
        onclick: function () { change(function () { state.items.splice(i - 1, 0, state.items.splice(i, 1)[0]); }); } }),
      h('button', { class: 'btn small', 'aria-label': '往下移', disabled: i === state.items.length - 1, text: '↓',
        onclick: function () { change(function () { state.items.splice(i + 1, 0, state.items.splice(i, 1)[0]); }); } }),
      h('button', { class: 'btn small', text: '替換', onclick: function () { openPicker(i); } }),
      h('button', { class: 'btn small danger', text: '刪除',
        onclick: function () { change(function () { state.items.splice(i, 1); }); } })));
  if (it.sideDose) row.querySelector('.controls').appendChild(
    h('p', { class: 'mute', style: 'flex-basis:100%', text: '左右兩邊不一樣是可以的。以個人狀況為準，有疑慮請洽自己的物理治療師。' }));
  if (d.max === it.dose) row.querySelector('.controls').appendChild(
    h('p', { class: 'mute', style: 'flex-basis:100%', text: '已經是建議範圍的上限。' }));
  return row;
}

function useSample() {
  session.why = {}; session.reasons = []; session.used = [];
  state.items = SAMPLE.filter(function (id) { return db.ex[id]; }).map(function (id) { return newItem(db.ex[id]); });
  syncHash(); renderPlan();
}

/* ---------- 加動作／替換 ---------- */
function openPicker(swapIndex) {
  var swapping = swapIndex != null, cur = swapping ? db.ex[state.items[swapIndex].id] : null;
  var filter = swapping ? cur.region : 'all';
  var dlg = h('dialog', { 'aria-label': swapping ? '替換動作' : '加動作' });
  var body = h('div', { class: 'dlg-body' });
  var filters = h('div', { class: 'filters' });
  function close() { dlg.close(); dlg.remove(); }

  var equipBox = h('fieldset', {}, h('legend', { text: '我手邊有的東西（沒有的取消打勾）' }),
    h('p', { class: 'mute', text: '取消打勾後，需要那樣東西的動作會變淡、不能加入。打勾回來就能加。' }),
    h('div', { class: 'checks' }, db.equip.filter(function (e) { return e.id !== 'none'; }).map(function (e) {
      return h('label', {}, h('input', { type: 'checkbox', checked: state.owned.has(e.id), value: e.id,
        onchange: function (ev) {
          if (ev.target.checked) state.owned.add(e.id); else state.owned.delete(e.id);
          draw();
        } }), e.name);
    })));

  function choose(ex) {
    if (swapping) state.items[swapIndex] = newItem(ex); else state.items.push(newItem(ex));
    syncHash(); close(); renderPlan();
    toast(swapping ? '已換成「' + ex.name + '」' : '已加入「' + ex.name + '」');
  }
  function pickRow(ex) {
    var ok = canDo(ex, state.owned);
    return h('div', { class: 'pick' + (ok ? '' : ' off') }, img(ex),
      h('div', {}, h('b', { text: ex.name }),
        h('small', { text: ex.primary.map(areaName).join('、') + '｜難度 ' + ex.level + '/5' +
          (ex.upper_load === 'full' ? '｜手要撐體重' : '') }),
        ok ? null : h('small', { class: 'need', text: '需要：' + missingEquipment(ex, state.owned, db.equip).join('、') })),
      h('button', { class: 'btn small', text: swapping ? '換成這個' : '加入', 'data-pick': ex.id, disabled: !ok,
        'aria-label': (swapping ? '換成' : '加入') + ex.name + (ok ? '' : '（缺少器材，不能加入）'),
        onclick: function () { if (canDo(ex, state.owned)) choose(ex); } }));
  }
  function draw() {
    body.textContent = '';
    filters.textContent = '';
    [['all', '全部']].concat(REGION_ORDER.map(function (r) { return [r, REGION[r]]; })).forEach(function (f) {
      filters.appendChild(h('button', { class: 'btn small', 'aria-pressed': String(filter === f[0]), text: f[1],
        onclick: function () { filter = f[0]; draw(); } }));
    });
    body.appendChild(equipBox);
    var shown = {};
    if (swapping) {
      var rec = swapSuggestions(cur, db.ex);
      if (rec.length) {
        body.appendChild(h('p', { class: 'group-title', text: '建議替換（練的地方和方式接近）' }));
        rec.forEach(function (ex) { shown[ex.id] = 1; body.appendChild(pickRow(ex)); });
      }
      if (cur.easier_tip) body.appendChild(h('p', { class: 'mute', text: '不想換動作的話：' + cur.easier_tip }));
      shown[cur.id] = 1;
    }
    REGION_ORDER.forEach(function (r) {
      if (filter !== 'all' && filter !== r) return;
      var rows = db.list.filter(function (ex) { return ex.region === r && !shown[ex.id]; })
        .sort(function (a, b) { return (canDo(b, state.owned) - canDo(a, state.owned)) || (a.level - b.level); });
      if (!rows.length) return;
      body.appendChild(h('p', { class: 'group-title', text: REGION[r] }));
      rows.forEach(function (ex) { body.appendChild(pickRow(ex)); });
    });
  }
  dlg.appendChild(h('div', { class: 'dlg-head' },
    h('div', { class: 'row' },
      h('h2', { text: swapping ? '把「' + cur.name + '」換成…' : '加動作' }),
      h('button', { class: 'btn small', text: '關閉', onclick: close })),
    filters));
  dlg.appendChild(body);
  dlg.addEventListener('cancel', function () { dlg.remove(); });
  document.body.appendChild(dlg);
  draw();
  dlg.showModal();
}

/* ---------- 連結和行事曆 ---------- */
function canShare() {
  return !!navigator.share && window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
}
export function shareLabel() { return canShare() ? '分享訓練連結' : '複製訓練連結'; }
export function copyLink() {
  var url = link();
  if (canShare()) {
    navigator.share({ title: 'Spinnin-Up 訓練', text: '這組訓練：' + state.items.map(function (it) { return db.ex[it.id].name; }).join('、'), url: url })
      .catch(function (e) { if (e && e.name !== 'AbortError') copyToClipboard(url); });
    return;
  }
  copyToClipboard(url);
}
function copyToClipboard(url) {
  function fallback() { window.prompt('長按複製這個連結：', url); }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(function () { toast('已複製連結，下次打開就是這一組'); }, fallback);
  } else fallback();
}
export function openCalendar() {
  var d = new Date(Date.now() + 86400000);
  d.setMinutes(0, 0, 0);
  var def = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':00';
  var when = h('input', { type: 'datetime-local', value: def, id: 'ics-when' });
  var every = h('select', { id: 'ics-every' }, [1, 2, 3, 4, 7].map(function (n) {
    return h('option', { value: n, selected: n === state.freq.every, text: n === 1 ? '每天' : n === 7 ? '每週一次' : '每 ' + n + ' 天一次' + (n === 2 ? '（隔天）' : '') });
  }));
  var count = h('input', { type: 'number', min: 1, max: 60, step: 1, value: state.freq.count, id: 'ics-count', inputmode: 'numeric',
    'aria-describedby': 'ics-count-err' });
  var errs = {
    start: h('p', { class: 'err', id: 'ics-when-err', role: 'alert' }),
    every: h('p', { class: 'err', id: 'ics-every-err', role: 'alert' }),
    count: h('p', { class: 'err', id: 'ics-count-err', role: 'alert' })
  };
  when.setAttribute('aria-describedby', 'ics-when-err');
  var fields = { start: when, every: every, count: count };
  var dlg = h('dialog', { 'aria-label': '加入行事曆' },
    h('div', { class: 'dlg-head' }, h('div', { class: 'row' }, h('h2', { text: '加入行事曆' }),
      h('button', { class: 'btn small', text: '關閉', onclick: function () { dlg.close(); dlg.remove(); } }))),
    h('div', { class: 'dlg-body' },
      h('p', { class: 'mute', text: '建議同一組隔天做一次。你可以照自己的情況調整。行事曆的活動裡會附上這組訓練的連結，到時候點一下就能開始。' }),
      h('label', { class: 'field' }, h('span', { text: '第一次是什麼時候' }), when), errs.start,
      h('label', { class: 'field' }, h('span', { text: '多久做一次' }), every), errs.every,
      h('label', { class: 'field' }, h('span', { text: '總共做幾次（1–60）' }), count), errs.count,
      h('button', { class: 'btn accent', id: 'ics-go', text: '下載行事曆檔', onclick: function () {
        var r = validateCalendarInput({ start: when.value, every: every.value, count: count.value });
        Object.keys(errs).forEach(function (k) {
          errs[k].textContent = r.ok ? '' : (r.errors[k] || '');
          fields[k].setAttribute('aria-invalid', String(!r.ok && !!r.errors[k]));
        });
        if (!r.ok) { fields[Object.keys(r.errors)[0]].focus(); return; }
        state.freq = { every: r.value.every, count: r.value.count };
        syncHash();
        downloadICS(r.value.start);
        dlg.close(); dlg.remove();
        toast('打開下載的檔案，就能加進行事曆');
      } })));
  dlg.addEventListener('cancel', function () { dlg.remove(); });
  document.body.appendChild(dlg);
  dlg.showModal();
}
function icsText(start) {
  return buildICS({ start: start, every: state.freq.every, count: state.freq.count,
    minutes: Math.round(totalSec(state.items, db.ex) / 60), url: link(),
    names: state.items.map(function (it) { return db.ex[it.id].name; }) });
}
function downloadICS(start) { downloadText('spinnin-up.ics', icsText(start), 'text/calendar;charset=utf-8'); }

/* ---------- 聲音設定 ---------- */
function soundLabel() { return '聲音：' + sound.SOUND_MODES[sound.settings.mode].short; }
function openSound() {
  sound.ensureAudio();
  var S = sound.settings;
  var dlg = h('dialog', { 'aria-label': '聲音設定' });
  function close() {
    dlg.close(); dlg.remove();
    if (player) renderStep(); else { var b = document.getElementById('btn-sound'); if (b) b.textContent = soundLabel(); }
  }
  function slider(id, label, key, test) {
    var out = h('output', { text: Math.round(S[key] * 100) + '%' });
    var r = h('input', { type: 'range', id: id, min: 0, max: 100, step: 5, value: Math.round(S[key] * 100),
      'aria-label': label, oninput: function () { S[key] = r.value / 100; out.textContent = r.value + '%'; sound.save(); } });
    return h('div', { class: 'vol' }, h('div', { class: 'row' }, h('b', { text: label }), h('span', { class: 'spacer' }), out),
      r, h('button', { class: 'btn small', text: '試聽', onclick: test }));
  }
  var voiceBox = slider('vol-voice', '語音大小', 'voiceVol', function () { sound.speak('下一個：靠牆蹲。二十秒。', null, true); });
  var beepBox = slider('vol-beep', '提示音大小', 'beepVol', function () {
    sound.beep(660, 120, 0, true); sound.beep(660, 120, 1000, true); sound.beep(660, 120, 2000, true); sound.beep(880, 380, 3000, true);
  });
  function sync() {
    voiceBox.hidden = S.mode !== 'voice';
    beepBox.hidden = S.mode === 'off';
  }
  var modes = h('fieldset', {}, h('legend', { text: '播報方式' }), Object.keys(sound.SOUND_MODES).map(function (k) {
    return h('label', { class: 'mode' }, h('input', { type: 'radio', name: 'sound-mode', value: k, checked: S.mode === k,
      onchange: function () {
        S.mode = k; sound.save(); sound.applyAudioSession(); sync();
        if (k !== 'voice') sound.hush();
      } }),
      h('span', {}, h('b', { text: sound.SOUND_MODES[k].name }), h('small', { text: sound.SOUND_MODES[k].desc })));
  }));
  dlg.appendChild(h('div', { class: 'dlg-head' }, h('div', { class: 'row' }, h('h2', { text: '聲音設定' }),
    h('button', { class: 'btn small', id: 'sound-close', text: '完成', onclick: close }))));
  dlg.appendChild(h('div', { class: 'dlg-body' }, modes, voiceBox, beepBox,
    h('p', { class: 'mute', text: '這裡調的是「相對於手機音量」的大小，最大就是手機目前的音量。可以先把手機音量調到看影片舒服的大小，再在這裡把播報調小。' }),
    h('p', { class: 'mute', text: '有些手機（特別是 iPhone）不讓網頁調整語音的大小。如果試聽時拉動沒有差別，邊看影片時可以改用「只有提示音」。' }),
    h('h3', { class: 'group-title', text: '提示音代表什麼' }),
    h('ul', { class: 'mute' },
      h('li', { text: '短短的嗶、嗶、嗶：最後 3 秒倒數' }),
      h('li', { text: '高的長音：開始' }),
      h('li', { text: '低的長音：這一組結束，休息' }),
      h('li', { text: '連續兩聲：換邊' }),
      h('li', { text: '往上的兩聲：全部完成' }))));
  dlg.addEventListener('cancel', function (e) { e.preventDefault(); close(); });
  document.body.appendChild(dlg);
  sync();
  dlg.showModal();
}

/* ========== 播放畫面 ========== */
// 播報：說話（語音模式）＋讓畫面上對應的文字變色（所有模式）
function say(text, key) {
  hl = { key: key, until: Date.now() + Math.max(3000, text.length * 260) };
  paintHighlight();
  sound.speak(text, function () { if (hl && hl.key === key) hl.until = Date.now() + 400; });
}
function paintHighlight() {
  var on = player && hl && Date.now() < hl.until ? hl.key : null;
  var els = document.querySelectorAll('[data-say]'), i;
  for (i = 0; i < els.length; i++) els[i].classList.toggle('speaking', els[i].getAttribute('data-say') === on);
}
function keepAwake() {
  if (!('wakeLock' in navigator) || !player) return;
  navigator.wakeLock.request('screen').then(function (w) { wake = w; }, function () {});
}
function onVisible() { if (!document.hidden && player) { keepAwake(); tick(); } }
function tick() { if (!player) return; player.tick(Date.now()); if (player) updateClock(); }

function narrate(s, pos) {
  if (s.kind === 'ready') {
    var w = s.next;
    if (s.label === '換邊') { sound.SFX.side(); say('換' + w.side + '。', 'side'); }
    else if (s.newEx) say((pos === 0 ? '準備。第一個：' : '休息。下一個：') + w.ex.name + '。' + (w.side ? w.side + '。' : '') +
      w.dose + (w.ex.mode === 'hold' ? '秒。' : '下。'), 'name');
    else say('休息。第 ' + w.set + ' 組。' + (w.side ? w.side + '。' : ''), 'set');
  } else {
    sound.SFX.start();
    var first = s.set === 1 && !(/右/.test(s.side || ''));
    if (!s.timed) say('開始，' + s.dose + '下。做完按一下。' + (first ? s.ex.cues[0] : ''), first ? 'cue-0' : 'clock');
    else if (first) say('開始。' + s.ex.cues[0], 'cue-0');
    else say('開始。', 'clock');
  }
}

export function startPlayer() {
  if (!state.items.length) return;
  sound.ensureAudio();
  var t0 = Date.now();
  player = createPlayer(steps(), {
    onEnter: function (s, pos, fresh) { renderStep(); if (fresh) narrate(s, pos); },
    onWorkEnd: function () { sound.SFX.end(); },
    onSecond: function (s, sec) {
      if (sec <= 3 && sec >= 1) sound.SFX.count(s.kind === 'work');
      if (s.kind === 'work' && s.dur >= 20 && sec === Math.floor(s.dur / 2) && s.ex.cues.length) {
        var k = s.set % s.ex.cues.length;
        say(s.ex.cues[k], 'cue-' + k);
      }
    },
    onFinish: function () { finish(t0); }
  });
  ticker = setInterval(tick, 200);
  document.addEventListener('visibilitychange', onVisible);
  keepAwake();
  player.start(Date.now());
}
function stopPlayer() {
  if (!player) return;
  clearInterval(ticker);
  document.removeEventListener('visibilitychange', onVisible);
  sound.hush();
  if (wake) { wake.release().catch(function () {}); wake = null; }
  player = null; hl = null;
}
export function currentPlayer() { return player; }

function updateClock() {
  if (!player) return;
  var now = Date.now(), s = player.current(), clock = document.getElementById('clock'), bar = document.getElementById('pbar');
  if (!clock || !s) return;
  clock.firstChild.nodeValue = (s.kind === 'ready' || s.timed) ? String(Math.ceil(player.remainingMs(now) / 1000)) : String(s.dose);
  if (bar) bar.style.width = (player.progress(now) * 100).toFixed(1) + '%';
  paintHighlight();
}

function renderStep() {
  var s = player.current(), w = s.kind === 'ready' ? s.next : s, ex = w.ex;
  var isRest = s.kind === 'ready', paused = player.state.paused, next = player.nextExercise();
  app.textContent = '';
  var view = h('div', { class: 'player' },
    h('div', { class: 'progress', role: 'progressbar', 'aria-label': '整體進度' }, h('span', { id: 'pbar' })),
    h('div', { class: 'where' },
      h('span', { text: '第 ' + (w.idx + 1) + '／' + state.items.length + ' 個動作' }),
      h('span', { text: '第 ' + w.set + '／' + w.sets + ' 組' })),
    h('div', { class: 'stage' },
      h('div', { class: 'stage-a' },
        h('div', { class: 'title-row' },
          h('span', { class: 'phase' + (isRest ? ' rest' : ''), id: 'phase', 'data-say': 'set', text: isRest ? s.label + '，接下來是' : '進行中' }),
          w.side ? h('span', { class: 'side', 'data-say': 'side', text: w.side }) : null),
        h('h2', { id: 'ex-name', 'data-say': 'name', text: ex.name }),
        h('div', { class: 'fig' }, img(ex))),
      h('div', { class: 'stage-b' },
        h('div', { class: 'clock', id: 'clock', 'data-say': 'clock', 'aria-live': 'off' }, '',
          h('small', { text: isRest ? '秒後開始' : (s.timed ? '秒' : '下，做完按「做完了」') })),
        h('p', { class: 'feel' }, '應該有感覺的地方：', h('b', { text: ex.primary.length ? ex.primary.map(areaName).join('、') : '全身放鬆' })),
        h('ul', { class: 'cues' }, ex.cues.map(function (c, i) { return h('li', { 'data-say': 'cue-' + i, text: c }); })),
        h('p', { class: 'mute next', text: next ? '之後：' + next.ex.name : '這是最後一個動作' }))),
    h('div', { class: 'ctrl' },
      h('button', { class: 'btn', id: 'p-prev', text: '上一步', onclick: function () { player.prev(Date.now()); } }),
      (!isRest && !s.timed)
        ? h('button', { class: 'btn accent', id: 'p-done', text: '做完了', onclick: function () { player.next(Date.now()); } })
        : h('button', { class: 'btn primary', id: 'p-pause', text: paused ? '繼續' : '暫停', onclick: togglePause }),
      h('button', { class: 'btn', id: 'p-next', text: '跳過', onclick: function () { player.next(Date.now()); } })),
    h('div', { class: 'ctrl2' },
      h('button', { class: 'btn small ghost', id: 'p-sound', text: soundLabel(), onclick: openSound }),
      h('button', { class: 'btn small ghost danger', id: 'p-quit', text: '結束', onclick: function () {
        if (confirm('要結束這次訓練嗎？')) { screens.endTrial(); renderPlan(); }
      } })));
  app.appendChild(view);
  updateClock();
}

function togglePause() {
  if (!player) return;
  player.togglePause(Date.now());
  if (player.state.paused) sound.hush(); else keepAwake();
  renderStep();
}

function finish(t0) {
  var mins = Math.max(1, Math.round((Date.now() - t0) / 60000));
  sound.SFX.finish();
  sound.speak('完成了。辛苦了。');
  stopPlayer();
  screens.renderFeedback(app, mins);
}

export function renderError() {
  app.textContent = '';
  app.appendChild(h('div', { class: 'wrap' }, h('p', { text: '資料讀不到。請重新整理頁面試試看。' })));
}
export { icsText };
