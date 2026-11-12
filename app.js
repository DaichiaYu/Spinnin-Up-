/* Spinnin-Up：組課表、預覽和編輯、播放器、訓練連結、行事曆。
   沒有後端，也不存任何資料。課表只記在網址的 # 後面。 */
(function () {
  'use strict';

  var REGION = { lower: '下半身', core: '核心', upper: '上半身', full: '暖身／收操' };
  var REGION_ORDER = ['lower', 'core', 'upper', 'full'];
  var SEC_PER_REP = 4;
  var SAMPLE = ['march-in-place', 'wall-sit', 'glute-bridge-hold', 'single-leg-tabletop-hold',
    'prone-w-hold', 'calf-raise-hold', 'supine-breathing'];

  var db = { ex: {}, list: [], areas: {}, equip: [] };
  var state = {
    items: [],                 // [{id, dose, sets, rest}]
    freq: { every: 2, count: 10 },
    owned: null,               // Set：手邊有的器材
    voice: true
  };
  var app = document.getElementById('app');

  /* ---------- 小工具 ---------- */
  function h(tag, attrs) {
    var el = document.createElement(tag), i, k;
    attrs = attrs || {};
    for (k in attrs) {
      if (attrs[k] === false || attrs[k] == null) continue;
      if (k === 'class') el.className = attrs[k];
      else if (k === 'text') el.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), attrs[k]);
      else el.setAttribute(k, attrs[k] === true ? '' : attrs[k]);
    }
    for (i = 2; i < arguments.length; i++) add(el, arguments[i]);
    return el;
  }
  function add(el, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) c.forEach(function (x) { add(el, x); });
    else el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function fmtTime(sec) {
    sec = Math.round(sec);
    var m = Math.floor(sec / 60), s = sec % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }
  function areaName(id) { return db.areas[id] ? db.areas[id].name : id; }
  function img(ex) { return h('img', { src: 'assets/exercises/' + ex.id + '.svg', alt: ex.name + '的姿勢示意圖', loading: 'lazy' }); }
  var toastTimer;
  function toast(msg) {
    var old = document.querySelector('.toast');
    if (old) old.remove();
    var t = h('div', { class: 'toast', role: 'status', text: msg });
    document.body.appendChild(t);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.remove(); }, 2600);
  }
  function canDo(ex) {
    return ex.equipment.every(function (q) { return state.owned.has(q); });
  }
  function missing(ex) {
    return ex.equipment.filter(function (q) { return !state.owned.has(q); })
      .map(function (q) { var e = db.equip.find(function (x) { return x.id === q; }); return e ? e.name : q; });
  }
  function doseText(ex, it) {
    return it.dose + (ex.mode === 'hold' ? ' 秒' : ' 下') + ' × ' + it.sets + ' 組' + (ex.sided ? '（每邊）' : '');
  }

  /* ---------- 訓練代碼（放在網址 # 後面） ---------- */
  function encode() {
    if (!state.items.length) return '';
    return '1;' + state.items.map(function (it) {
      return [it.id, it.dose, it.sets, it.rest].join('.');
    }).join('~') + ';' + state.freq.every + '.' + state.freq.count;
  }
  function decode(code) {
    var parts = String(code || '').split(';'), lost = 0, items = [];
    if (parts[0] !== '1' || !parts[1]) return null;
    parts[1].split('~').forEach(function (s) {
      var f = s.split('.'), ex = db.ex[f[0]];
      if (!ex) { lost++; return; }
      items.push({
        id: ex.id,
        dose: clamp(parseInt(f[1], 10) || ex.dose.default, ex.dose.min, ex.dose.max),
        sets: clamp(parseInt(f[2], 10) || ex.sets, 1, 6),
        rest: clamp(isNaN(parseInt(f[3], 10)) ? ex.rest_sec : parseInt(f[3], 10), 0, 180)
      });
    });
    var fq = (parts[2] || '').split('.');
    return {
      items: items, lost: lost,
      freq: { every: clamp(parseInt(fq[0], 10) || 2, 1, 14), count: clamp(parseInt(fq[1], 10) || 10, 1, 60) }
    };
  }
  function link() { return location.origin + location.pathname + '#r=' + encode(); }
  function syncHash() {
    var c = encode();
    history.replaceState(null, '', c ? '#r=' + c : location.pathname + location.search);
  }
  function loadFromHash() {
    var m = /[#&]r=([^&]+)/.exec(location.hash);
    if (!m) return false;
    var r = decode(decodeURIComponent(m[1]));
    if (!r) return false;
    state.items = r.items;
    state.freq = r.freq;
    if (r.lost) toast('連結裡有 ' + r.lost + ' 個動作已經不在資料庫，先略過了');
    return true;
  }
  function newItem(ex) { return { id: ex.id, dose: ex.dose.default, sets: ex.sets, rest: ex.rest_sec }; }

  /* ---------- 把課表展開成一步一步 ---------- */
  function buildSteps(items) {
    var steps = [], prev = null;
    items.forEach(function (it, idx) {
      var ex = db.ex[it.id], sides = ex.sided ? ['左邊', '右邊'] : [null], s;
      for (s = 1; s <= it.sets; s++) {
        sides.forEach(function (side) {
          var work = { kind: 'work', idx: idx, ex: ex, it: it, set: s, sets: it.sets, side: side,
            timed: ex.mode === 'hold', dur: ex.mode === 'hold' ? it.dose : it.dose * SEC_PER_REP };
          var ready = { kind: 'ready', timed: true, next: work };
          if (!prev) { ready.dur = 8; ready.label = '準備'; }
          else if (prev.idx === idx && prev.set === s) { ready.dur = 5; ready.label = '換邊'; }
          else if (prev.idx === idx) { ready.dur = Math.max(5, it.rest); ready.label = '休息'; }
          else { ready.dur = Math.max(8, prev.it.rest); ready.label = '休息'; ready.newEx = true; }
          if (!prev) ready.newEx = true;
          steps.push(ready, work);
          prev = work;
        });
      }
    });
    return steps;
  }
  function totalSec(items) {
    return buildSteps(items).reduce(function (a, s) { return a + s.dur; }, 0);
  }
  function regionShare(items) {
    var share = { lower: 0, core: 0, upper: 0, full: 0 }, total = 0;
    buildSteps(items).forEach(function (s) {
      if (s.kind === 'work') { share[s.ex.region] += s.dur; total += s.dur; }
    });
    return { share: share, total: total };
  }

  /* ========== 課表頁（預覽和編輯） ========== */
  function renderPlan() {
    stopPlayer();
    app.textContent = '';
    var wrap = h('div', { class: 'wrap' },
      h('header', { class: 'top' },
        h('h1', { text: 'Spinnin-Up' }),
        h('a', { href: 'catalog.html', text: '動作總覽' })));
    app.appendChild(wrap);

    if (!state.items.length) {
      wrap.appendChild(h('div', { class: 'card empty' },
        h('h2', { text: '先排一組今天要做的動作' }),
        h('p', { text: '可以自己一個一個加，也可以先用範例，再刪掉或換成你想做的。' }),
        h('div', { class: 'row', style: 'justify-content:center' },
          h('button', { class: 'btn accent', id: 'btn-sample', text: '用範例開始', onclick: useSample }),
          h('button', { class: 'btn', id: 'btn-add-empty', text: '自己加動作', onclick: function () { openPicker(null); } }))));
      wrap.appendChild(footerNote());
      return;
    }

    var sec = totalSec(state.items), rs = regionShare(state.items);
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

    wrap.appendChild(h('div', { class: 'row' },
      h('button', { class: 'btn small', id: 'btn-link', text: '複製訓練連結', onclick: copyLink }),
      h('button', { class: 'btn small', id: 'btn-ics', text: '加入行事曆', onclick: openCalendar }),
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn small ghost danger', text: '全部清空', onclick: function () {
        if (confirm('確定要清空這組課表嗎？')) { state.items = []; syncHash(); renderPlan(); }
      } })));

    var list = h('div', { id: 'list' });
    state.items.forEach(function (it, i) { list.appendChild(itemRow(it, i)); });
    wrap.appendChild(list);
    wrap.appendChild(footerNote());

    app.appendChild(h('div', { class: 'dock' }, h('div', { class: 'row' },
      h('button', { class: 'btn', id: 'btn-add', text: '＋ 加動作', onclick: function () { openPicker(null); } }),
      h('button', { class: 'btn accent', id: 'btn-start', text: '開始', onclick: startPlayer }))));
  }

  function footerNote() {
    return h('footer', { class: 'note', text: '內容是一般訓練常識的整理，以個人狀況為準；有疼痛或疑慮，請洽自己的物理治療師或醫師。這個頁面不會儲存或傳送你的任何資料。' });
  }

  function stepper(label, text, onMinus, onPlus, canMinus, canPlus) {
    return h('span', { class: 'stepper', role: 'group', 'aria-label': label },
      h('button', { 'aria-label': label + '減少', disabled: !canMinus, onclick: onMinus, text: '−' }),
      h('output', { text: text }),
      h('button', { 'aria-label': label + '增加', disabled: !canPlus, onclick: onPlus, text: '＋' }));
  }

  function itemRow(it, i) {
    var ex = db.ex[it.id], d = ex.dose;
    function change(fn) { fn(); syncHash(); renderPlan(); }
    var row = h('article', { class: 'card item', 'data-id': ex.id },
      h('div', { class: 'fig' }, img(ex)),
      h('div', {},
        h('h3', { text: (i + 1) + '. ' + ex.name }),
        h('p', { class: 'mute', text: REGION[ex.region] + '｜' + doseText(ex, it) }),
        h('div', { class: 'chips' },
          ex.primary.map(function (a) { return h('span', { class: 'chip p', text: areaName(a) }); }),
          ex.secondary.map(function (a) { return h('span', { class: 'chip', text: areaName(a) }); })),
        h('p', { class: 'effect', text: ex.effect })),
      h('details', { class: 'how' },
        h('summary', { text: '怎麼做、注意什麼' }),
        h('h4', { text: '步驟' }), h('ol', {}, ex.setup.map(function (s) { return h('li', { text: s }); })),
        h('h4', { text: '提示' }), h('ul', {}, ex.cues.map(function (s) { return h('li', { text: s }); })),
        ex.avoid.length ? [h('h4', { text: '避免' }), h('ul', {}, ex.avoid.map(function (s) { return h('li', { text: s }); }))] : null,
        ex.watch.length ? [h('h4', { text: '如果這些地方有感覺' }),
          h('ul', {}, ex.watch.map(function (w) { return h('li', {}, h('b', { text: areaName(w.area) }), '：' + w.meaning); }))] : null,
        ex.easier_tip ? h('p', { class: 'mute', text: '太難的話：' + ex.easier_tip }) : null),
      h('div', { class: 'controls' },
        stepper(ex.mode === 'hold' ? '秒數' : '次數', it.dose + (ex.mode === 'hold' ? ' 秒' : ' 下'),
          function () { change(function () { it.dose = clamp(it.dose - d.step, d.min, d.max); }); },
          function () { change(function () { it.dose = clamp(it.dose + d.step, d.min, d.max); }); },
          it.dose > d.min, it.dose < d.max),
        stepper('組數', it.sets + ' 組',
          function () { change(function () { it.sets = clamp(it.sets - 1, 1, 6); }); },
          function () { change(function () { it.sets = clamp(it.sets + 1, 1, 6); }); },
          it.sets > 1, it.sets < 6),
        h('span', { class: 'spacer' }),
        h('button', { class: 'btn small', 'aria-label': '往上移', disabled: i === 0, text: '↑',
          onclick: function () { change(function () { state.items.splice(i - 1, 0, state.items.splice(i, 1)[0]); }); } }),
        h('button', { class: 'btn small', 'aria-label': '往下移', disabled: i === state.items.length - 1, text: '↓',
          onclick: function () { change(function () { state.items.splice(i + 1, 0, state.items.splice(i, 1)[0]); }); } }),
        h('button', { class: 'btn small', text: '替換', onclick: function () { openPicker(i); } }),
        h('button', { class: 'btn small danger', text: '刪除',
          onclick: function () { change(function () { state.items.splice(i, 1); }); } })));
    if (d.max === it.dose) row.querySelector('.controls').appendChild(
      h('p', { class: 'mute', style: 'flex-basis:100%', text: '已經是建議範圍的上限。' }));
    return row;
  }

  function useSample() {
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
      var ok = canDo(ex);
      return h('div', { class: 'pick' + (ok ? '' : ' off') }, img(ex),
        h('div', {}, h('b', { text: ex.name }),
          h('small', { text: ex.primary.map(areaName).join('、') + '｜難度 ' + ex.level + '/5' +
            (ex.upper_load === 'full' ? '｜手要撐體重' : '') }),
          ok ? null : h('small', { text: '　需要：' + missing(ex).join('、') })),
        h('button', { class: 'btn small', text: swapping ? '換成這個' : '加入', 'data-pick': ex.id, onclick: function () { choose(ex); } }));
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
        var rec = cur.swaps.concat([cur.easier, cur.harder]).filter(function (id, i, a) {
          return id && db.ex[id] && a.indexOf(id) === i;
        }).map(function (id) { return db.ex[id]; });
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
          .sort(function (a, b) { return (canDo(b) - canDo(a)) || (a.level - b.level); });
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
  function copyLink() {
    var url = link();
    function fallback() { window.prompt('長按複製這個連結：', url); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(function () { toast('已複製連結，下次打開就是這一組'); }, fallback);
    } else fallback();
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function icsEscape(s) { return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n'); }
  function buildICS(start, every, count) {
    var mins = Math.max(5, Math.round(totalSec(state.items) / 60)), url = link(), now = new Date();
    var local = start.getFullYear() + pad(start.getMonth() + 1) + pad(start.getDate()) + 'T' + pad(start.getHours()) + pad(start.getMinutes()) + '00';
    var stamp = now.getUTCFullYear() + pad(now.getUTCMonth() + 1) + pad(now.getUTCDate()) + 'T' + pad(now.getUTCHours()) + pad(now.getUTCMinutes()) + pad(now.getUTCSeconds()) + 'Z';
    var names = state.items.map(function (it) { return db.ex[it.id].name; }).join('、');
    return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Spinnin-Up//ZH', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
      'UID:' + Date.now() + '-' + Math.random().toString(36).slice(2) + '@spinnin-up',
      'DTSTAMP:' + stamp, 'DTSTART:' + local, 'DURATION:PT' + mins + 'M',
      'RRULE:FREQ=DAILY;INTERVAL=' + every + ';COUNT=' + count,
      'SUMMARY:' + icsEscape('Spinnin-Up 訓練（約 ' + mins + ' 分鐘）'),
      'DESCRIPTION:' + icsEscape('點連結開始這組訓練：\n' + url + '\n\n動作：' + names),
      'URL:' + url, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n') + '\r\n';
  }
  function openCalendar() {
    var d = new Date(Date.now() + 86400000);
    d.setMinutes(0, 0, 0);
    var def = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':00';
    var when = h('input', { type: 'datetime-local', value: def, id: 'ics-when' });
    var every = h('select', { id: 'ics-every' }, [1, 2, 3, 4, 7].map(function (n) {
      return h('option', { value: n, selected: n === state.freq.every, text: n === 1 ? '每天' : n === 7 ? '每週一次' : '每 ' + n + ' 天一次' + (n === 2 ? '（隔天）' : '') });
    }));
    var count = h('input', { type: 'number', min: 1, max: 60, value: state.freq.count, id: 'ics-count', inputmode: 'numeric' });
    var dlg = h('dialog', { 'aria-label': '加入行事曆' },
      h('div', { class: 'dlg-head' }, h('div', { class: 'row' }, h('h2', { text: '加入行事曆' }),
        h('button', { class: 'btn small', text: '關閉', onclick: function () { dlg.close(); dlg.remove(); } }))),
      h('div', { class: 'dlg-body' },
        h('p', { class: 'mute', text: '建議同一組隔天做一次。你可以照自己的情況調整。行事曆的活動裡會附上這組訓練的連結，到時候點一下就能開始。' }),
        h('label', { class: 'field' }, h('span', { text: '第一次是什麼時候' }), when),
        h('label', { class: 'field' }, h('span', { text: '多久做一次' }), every),
        h('label', { class: 'field' }, h('span', { text: '總共做幾次' }), count),
        h('button', { class: 'btn accent', id: 'ics-go', text: '下載行事曆檔', onclick: function () {
          var start = new Date(when.value);
          if (isNaN(start)) { toast('請選第一次的時間'); return; }
          state.freq = { every: clamp(parseInt(every.value, 10) || 2, 1, 14), count: clamp(parseInt(count.value, 10) || 10, 1, 60) };
          syncHash();
          var blob = new Blob([buildICS(start, state.freq.every, state.freq.count)], { type: 'text/calendar;charset=utf-8' });
          var a = h('a', { href: URL.createObjectURL(blob), download: 'spinnin-up.ics' });
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
          dlg.close(); dlg.remove();
          toast('打開下載的檔案，就能加進行事曆');
        } })));
    dlg.addEventListener('cancel', function () { dlg.remove(); });
    document.body.appendChild(dlg);
    dlg.showModal();
  }

  /* ========== 播放器 ========== */
  var P = null, audio = null, wake = null;

  function beep(freq, ms) {
    if (!audio) return;
    try {
      var o = audio.createOscillator(), g = audio.createGain();
      o.frequency.value = freq; o.connect(g); g.connect(audio.destination);
      g.gain.setValueAtTime(0.18, audio.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + ms / 1000);
      o.start(); o.stop(audio.currentTime + ms / 1000);
    } catch (e) { /* 沒有聲音也能繼續 */ }
  }
  function speak(text) {
    if (!state.voice || !('speechSynthesis' in window)) return;
    try {
      speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(text);
      u.lang = 'zh-TW'; u.rate = 1;
      speechSynthesis.speak(u);
    } catch (e) { /* 沒有語音也能繼續 */ }
  }
  function keepAwake() {
    if (!('wakeLock' in navigator) || !P) return;
    navigator.wakeLock.request('screen').then(function (w) { wake = w; }, function () {});
  }

  function startPlayer() {
    if (!state.items.length) return;
    try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); audio.resume(); } catch (e) { audio = null; }
    P = { steps: buildSteps(state.items), pos: -1, endAt: 0, startAt: 0, paused: false, remain: 0, t0: Date.now(), lastSec: null, said: {} };
    P.total = P.steps.reduce(function (a, s) { return a + s.dur; }, 0);
    P.timer = setInterval(tick, 200);
    document.addEventListener('visibilitychange', onVisible);
    keepAwake();
    enter(0, Date.now());
  }
  function stopPlayer() {
    if (!P) return;
    clearInterval(P.timer);
    document.removeEventListener('visibilitychange', onVisible);
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    if (wake) { wake.release().catch(function () {}); wake = null; }
    P = null;
  }
  function onVisible() { if (!document.hidden) { keepAwake(); tick(); } }

  function enter(pos, startTime) {
    if (pos >= P.steps.length) { finish(); return; }
    var s = P.steps[pos], fresh = Date.now() - startTime < 1500;
    P.pos = pos; P.startAt = startTime; P.endAt = startTime + s.dur * 1000; P.lastSec = null; P.said = {};
    if (P.paused) P.remain = s.dur * 1000;
    renderStep();
    if (!fresh) return;                  // 從背景回來補進度時不補唸
    if (s.kind === 'ready') {
      var w = s.next, line;
      if (s.label === '換邊') line = '換' + w.side + '。';
      else if (s.newEx) line = (pos === 0 ? '準備。第一個：' : '休息。下一個：') + w.ex.name + '。' + (w.side ? w.side + '。' : '') +
        w.it.dose + (w.ex.mode === 'hold' ? '秒。' : '下。');
      else line = '休息。第 ' + w.set + ' 組。' + (w.side ? w.side + '。' : '');
      speak(line);
    } else {
      beep(880, 350);
      speak(s.timed ? '開始。' + (s.set === 1 && !(/右/.test(s.side || '')) ? s.ex.cues[0] : '') : '開始，' + s.it.dose + '下。做完按一下。');
    }
  }

  function tick() {
    if (!P || P.paused) return;
    var now = Date.now(), s = P.steps[P.pos];
    while (P && s && (s.kind === 'ready' || s.timed) && now >= P.endAt) {
      if (s.kind === 'work' && now - P.endAt < 1500) beep(520, 500);
      enter(P.pos + 1, P.endAt);
      if (!P) return;
      s = P.steps[P.pos];
    }
    if (!P) return;
    updateClock(now);
  }

  function updateClock(now) {
    var s = P.steps[P.pos], clock = document.getElementById('clock'), bar = document.getElementById('pbar');
    if (!clock) return;
    var done = P.steps.slice(0, P.pos).reduce(function (a, x) { return a + x.dur; }, 0);
    if (s.kind === 'ready' || s.timed) {
      var left = P.paused ? P.remain : Math.max(0, P.endAt - now), sec = Math.ceil(left / 1000);
      clock.firstChild.nodeValue = String(sec);
      done += s.dur - left / 1000;
      if (sec !== P.lastSec && !P.paused) {
        if (sec <= 3 && sec >= 1) beep(s.kind === 'work' ? 660 : 440, 120);
        if (s.kind === 'work' && s.dur >= 20 && sec === Math.floor(s.dur / 2) && !P.said.mid) {
          P.said.mid = 1;
          speak(s.ex.cues[(s.set) % s.ex.cues.length] || '');
        }
        P.lastSec = sec;
      }
    } else {
      clock.firstChild.nodeValue = String(s.it.dose);
    }
    if (bar) bar.style.width = Math.min(100, done / P.total * 100).toFixed(1) + '%';
  }

  function renderStep() {
    var s = P.steps[P.pos], w = s.kind === 'ready' ? s.next : s, ex = w.ex;
    var isRest = s.kind === 'ready';
    app.textContent = '';
    var next = null, i;
    for (i = P.pos + 1; i < P.steps.length; i++) {
      if (P.steps[i].kind === 'work' && P.steps[i].idx !== w.idx) { next = P.steps[i]; break; }
    }
    var view = h('div', { class: 'player' },
      h('div', { class: 'progress', role: 'progressbar', 'aria-label': '整體進度' }, h('span', { id: 'pbar' })),
      h('div', { class: 'where' },
        h('span', { text: '第 ' + (w.idx + 1) + '／' + state.items.length + ' 個動作' }),
        h('span', { text: '第 ' + w.set + '／' + w.sets + ' 組' })),
      h('div', {}, h('span', { class: 'phase' + (isRest ? ' rest' : ''), id: 'phase', text: isRest ? s.label + '，接下來是' : '進行中' })),
      h('h2', { id: 'ex-name', text: ex.name }),
      w.side ? h('div', { class: 'side', text: w.side }) : null,
      h('div', { class: 'fig' }, img(ex)),
      h('div', { class: 'clock', id: 'clock', 'aria-live': 'off' }, '',
        h('small', { text: isRest ? '秒後開始' : (s.timed ? '秒' : '下，做完按「做完了」') })),
      h('p', { class: 'feel' }, '應該有感覺的地方：', h('b', { text: ex.primary.length ? ex.primary.map(areaName).join('、') : '全身放鬆' })),
      h('ul', { class: 'cues' }, ex.cues.map(function (c) { return h('li', { text: c }); })),
      h('div', { class: 'grow' }),
      h('p', { class: 'mute', text: next ? '之後：' + next.ex.name : '這是最後一個動作' }),
      h('div', { class: 'ctrl' },
        h('button', { class: 'btn', id: 'p-prev', text: '上一步', onclick: goPrev }),
        (!isRest && !s.timed)
          ? h('button', { class: 'btn accent', id: 'p-done', text: '做完了', onclick: goNext })
          : h('button', { class: 'btn primary', id: 'p-pause', text: P.paused ? '繼續' : '暫停', onclick: togglePause }),
        h('button', { class: 'btn', id: 'p-next', text: '跳過', onclick: goNext })),
      h('div', { class: 'ctrl2' },
        h('button', { class: 'btn small ghost', id: 'p-voice', 'aria-pressed': String(state.voice), text: state.voice ? '語音：開' : '語音：關',
          onclick: function () { state.voice = !state.voice; if (!state.voice && 'speechSynthesis' in window) speechSynthesis.cancel(); renderStep(); } }),
        h('button', { class: 'btn small ghost danger', id: 'p-quit', text: '結束', onclick: function () {
          if (confirm('要結束這次訓練嗎？')) renderPlan();
        } })));
    app.appendChild(view);
    updateClock(Date.now());
  }

  function togglePause() {
    if (!P) return;
    if (P.paused) { P.paused = false; P.endAt = Date.now() + P.remain; keepAwake(); }
    else { P.paused = true; P.remain = Math.max(0, P.endAt - Date.now()); if ('speechSynthesis' in window) speechSynthesis.cancel(); }
    renderStep();
  }
  function goNext() { if (P) enter(P.pos + 1, Date.now()); }
  function goPrev() {
    if (!P) return;
    var s = P.steps[P.pos];
    enter(Math.max(0, s.kind === 'work' ? P.pos - 1 : P.pos - 2), Date.now());
  }

  function finish() {
    var mins = Math.max(1, Math.round((Date.now() - P.t0) / 60000));
    beep(880, 200); setTimeout(function () { beep(1100, 400); }, 220);
    speak('完成了。辛苦了。');
    stopPlayer();
    app.textContent = '';
    app.appendChild(h('div', { class: 'wrap' }, h('div', { class: 'done', id: 'done' },
      h('p', { class: 'big', text: '完成了' }),
      h('p', { class: 'mute', text: '這次花了大約 ' + mins + ' 分鐘，做了 ' + state.items.length + ' 個動作。' }),
      h('p', { class: 'mute', text: '建議 ' + (state.freq.every === 1 ? '明天' : state.freq.every + ' 天後') + '再做一次。' }),
      h('div', { class: 'row', style: 'justify-content:center;margin-top:18px' },
        h('button', { class: 'btn', text: '回到課表', onclick: renderPlan }),
        h('button', { class: 'btn', text: '加入行事曆', onclick: openCalendar }),
        h('button', { class: 'btn', text: '複製訓練連結', onclick: copyLink })),
      h('p', { class: 'mute', style: 'margin-top:24px', text: '做完之後的回報（做得怎麼樣、哪裡有感覺）會在下一個階段加上。' }))));
  }

  /* ---------- 啟動 ---------- */
  function getJSON(url) { return fetch(url).then(function (r) { if (!r.ok) throw new Error(url); return r.json(); }); }
  Promise.all([getJSON('data/exercises.json'), getJSON('data/areas.json'), getJSON('data/equipment.json')]).then(function (res) {
    db.list = res[0].exercises;
    db.list.forEach(function (e) { db.ex[e.id] = e; });
    res[1].areas.forEach(function (a) { db.areas[a.id] = a; });
    db.equip = res[2].equipment;
    state.owned = new Set(db.equip.map(function (e) { return e.id; }));
    loadFromHash();
    renderPlan();
    window.addEventListener('hashchange', function () { if (!P && loadFromHash()) renderPlan(); });
  }).catch(function () {
    app.textContent = '';
    app.appendChild(h('div', { class: 'wrap' }, h('p', { text: '資料讀不到。請重新整理頁面試試看。' })));
  });

  // 測試用：讓自動測試可以讀到內部狀態
  window.__spin = { state: state, db: db, buildSteps: buildSteps, totalSec: totalSec, encode: encode, decode: decode,
    buildICS: buildICS, player: function () { return P; } };
})();
