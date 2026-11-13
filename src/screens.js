// 第 3 階段的畫面：首頁、我的資料、今天的設定、做完回報。
// 規則都在 profile.js / generator.js / feedback.js，這裡只負責顯示和收集。
import { db, state, session } from './store.js';
import { h, toast, downloadText, readTextFile, pills } from './dom.js';
import { pad } from './util.js';
import { FIELDS, CHOICES, STALE_WEEKS, emptyProfile, hasData, validateBody, analyze, tendency, isStale, toCSV, fromCSV } from './profile.js';
import { GOALS, MINUTES, generateWorkout, trialItems, relatedAreas } from './generator.js';
import { HOW, evaluate, applyAdj } from './feedback.js';
import { REGION } from './workout-engine.js';
import * as ui from './ui.js';

function root() { return document.getElementById('app'); }
function page(title, backLabel, onBack) {
  var app = root();
  app.textContent = '';
  var wrap = h('div', { class: 'wrap' },
    h('header', { class: 'top' }, h('h1', { text: title }),
      h('nav', { class: 'toplinks' }, h('button', { class: 'linkbtn', id: 'nav-back', text: backLabel || '回首頁', onclick: onBack || ui.renderPlan }))));
  app.appendChild(wrap);
  window.scrollTo(0, 0);
  return wrap;
}
function areaName(id) { return ui.areaName(id); }
function dateText(iso) { var d = new Date(iso); return d.getFullYear() + '/' + pad(d.getMonth() + 1) + '/' + pad(d.getDate()); }

/* ---------- 檔案：下載空白表格、下載最新檔案、上傳 ---------- */
function downloadBlank() {
  downloadText('spinnin-up-空白表格.csv', toCSV(emptyProfile(), null), 'text/csv;charset=utf-8');
  toast('用 Excel、Numbers 或 Google 試算表打開，填「你的值」那一欄，再傳上來');
}
function downloadLatest() {
  var p = session.profile, now = new Date(), t = session.today;
  p.settings = { owned: Array.from(state.owned).join('|'), every: state.freq.every, count: state.freq.count,
    minutes: t.minutes, strict: t.strict ? 1 : 0, goal: t.goal, focus: t.focus };
  p.savedAt = now.toISOString();
  downloadText('spinnin-up-我的資料-' + now.getFullYear() + pad(now.getMonth() + 1) + pad(now.getDate()) + '.csv', toCSV(p, now), 'text/csv;charset=utf-8');
  session.dirty = false;
  toast('已下載。下次打開頁面時，把這個檔案傳上來就能接著用');
}
function applySettings(p) {
  var s = p.settings || {}, t = session.today;
  if (s.owned != null) { state.owned.clear(); state.owned.add('none'); String(s.owned).split('|').forEach(function (q) { if (db.equip.some(function (e) { return e.id === q; })) state.owned.add(q); }); }
  if (Number(s.every) >= 1 && Number(s.every) <= 14) state.freq.every = Number(s.every);
  if (Number(s.count) >= 1 && Number(s.count) <= 60) state.freq.count = Number(s.count);
  if (MINUTES.indexOf(Number(s.minutes)) >= 0) t.minutes = Number(s.minutes);
  if (s.strict != null) t.strict = String(s.strict) === '1';
  if (GOALS[s.goal]) t.goal = s.goal;
  if (db.areas[s.focus]) t.focus = s.focus;
}
function upload(after) {
  var input = h('input', { type: 'file', accept: '.csv,text/csv', id: 'file-input', hidden: true, onchange: function () {
    var f = input.files[0];
    if (!f) return;
    readTextFile(f).then(function (text) { loadCSVText(text); (after || ui.renderPlan)(); }, function () { toast('這個檔案讀不到'); });
    input.remove();
  } });
  document.body.appendChild(input);
  input.click();
}
export function loadCSVText(text) {
  var r = fromCSV(text);
  if (!r.profile) { alert(r.warnings[0]); return false; }
  session.profile = r.profile;
  session.dirty = false;
  applySettings(r.profile);
  var msg = '已讀入你的資料。';
  if (r.warnings.length) alert('讀入時有幾個地方要注意：\n\n' + r.warnings.join('\n'));
  if (isStale(r.profile.savedAt, new Date())) msg += '這份檔案已經超過 ' + STALE_WEEKS + ' 週，建議重新量一次。';
  toast(msg);
  return true;
}

/* ========== 首頁 ========== */
export function renderHome(wrap, actions) {
  var p = session.profile, has = hasData(p), t = tendency(p, db.ex), tried = Object.keys(p.trials).length;
  wrap.appendChild(h('section', { class: 'card home' },
    h('h2', { text: '今天的訓練' }),
    h('p', { class: 'mute', text: '告訴它今天有多少時間、想練什麼、手邊有什麼，它會排出一組給你看。排出來的每個動作你都可以刪、換、改量。' }),
    h('div', { class: 'row' },
      h('button', { class: 'btn accent', id: 'btn-today', text: '幫我排一組', onclick: renderToday }),
      h('button', { class: 'btn', id: 'btn-sample', text: '用範例開始', onclick: actions.useSample }),
      h('button', { class: 'btn', id: 'btn-add-empty', text: '自己加動作', onclick: actions.addOwn }))));

  var status = !has ? '還沒有資料。不填也能用，填了會排得更適合你。'
    : (validateBody(p.body).ok ? '身體數值已填。' : '身體數值還沒填完。') + (tried ? '試做過 ' + tried + ' 個動作。' : '還沒做試做動作。') +
      (t.weak ? '目前看起來' + REGION[t.weak] + '比較需要加強。' : '');
  var card = h('section', { class: 'card home', id: 'my-data' },
    h('h2', { text: '我的資料' }),
    h('p', { class: 'mute', id: 'data-status', text: status }),
    p.savedAt ? h('p', { class: 'mute', text: '檔案的時間：' + dateText(p.savedAt) }) : null,
    isStale(p.savedAt, new Date()) ? h('p', { class: 'banner', text: '這份資料已經超過 ' + STALE_WEEKS + ' 週，建議重新量一次、重做試做動作。' }) : null,
    session.dirty ? h('p', { class: 'banner', id: 'dirty-note', text: '有新的資料還沒下載。關掉頁面就會不見，記得按「下載最新檔案」。' }) : null,
    h('div', { class: 'row' },
      h('button', { class: 'btn', id: 'btn-profile', text: has ? '查看或修改' : '在頁面上填', onclick: renderProfile }),
      h('button', { class: 'btn', id: 'btn-trial', text: tried ? '重做試做動作' : '做試做動作（約 3 分鐘）', onclick: startTrial })),
    h('div', { class: 'row', style: 'margin-top:8px' },
      h('button', { class: 'btn small', id: 'btn-upload', text: '上傳我的檔案', onclick: function () { upload(); } }),
      h('button', { class: 'btn small', id: 'btn-blank', text: '下載空白表格', onclick: downloadBlank }),
      has ? h('button', { class: 'btn small' + (session.dirty ? ' primary' : ''), id: 'btn-save-file', text: '下載最新檔案', onclick: function () { downloadLatest(); ui.renderPlan(); } }) : null),
    h('p', { class: 'mute', text: '這個頁面不會幫你存資料。要留到下次，就下載檔案，下次再傳上來。也可以下載空白表格，用試算表填好再上傳。' }));
  wrap.appendChild(card);
}

/* ========== 我的資料 ========== */
export function renderProfile() {
  var p = session.profile, draft = Object.assign({}, p.body), errs = {};
  var wrap = page('我的資料');
  var out = h('section', { id: 'analysis' });

  function field(f) {
    var input, err = h('p', { class: 'err', role: 'alert', id: 'err-' + f.key });
    errs[f.key] = err;
    if (f.type === 'choice') {
      input = pills('f-' + f.key, f.options, draft[f.key], function (k) { draft[f.key] = k; });
    } else {
      input = h('span', { class: 'numwrap' },
        h('input', { type: 'number', id: 'f-' + f.key, inputmode: 'decimal', step: 'any', min: f.min, max: f.max, value: draft[f.key] == null ? '' : draft[f.key],
          'aria-describedby': 'why-' + f.key + ' err-' + f.key,
          oninput: function (e) { var v = e.target.value.trim(); if (v === '') delete draft[f.key]; else draft[f.key] = Number(v); } }),
        h('span', { class: 'unit', text: f.unit }));
    }
    return h('div', { class: 'frow' },
      h('label', { for: f.type === 'choice' ? null : 'f-' + f.key, class: 'flabel', text: f.label + (f.tier === 'required' ? '（必填）' : '') }),
      input, h('p', { class: 'why', id: 'why-' + f.key, text: f.why }), err);
  }
  function group(tier) { return FIELDS.filter(function (f) { return f.tier === tier; }).map(field); }
  function choice(key, onChange) {
    var c = CHOICES[key], parts = key.split('.'), obj = p[parts[0]];
    return h('div', { class: 'frow' }, h('span', { class: 'flabel', text: c.label + (c.multi ? '（可以選多個）' : '') }),
      pills('c-' + key, c.options, obj[parts[1]], function (k, on) {
        if (c.multi) { var list = obj[parts[1]] || []; obj[parts[1]] = on ? list.concat([k]) : list.filter(function (x) { return x !== k; }); }
        else obj[parts[1]] = k;
        session.dirty = true;
        if (onChange) onChange();
      }, c.multi));
  }
  var asymMore = h('div', { id: 'asym-more' });
  function drawAsym() {
    asymMore.textContent = '';
    if (p.asym.has !== 'yes') return;
    asymMore.appendChild(choice('asym.where'));
    asymMore.appendChild(choice('asym.mode'));
    asymMore.appendChild(h('p', { class: 'banner', text: '這裡只提供調整的選項，不是診斷。左右差異以個人狀況為準，有疑慮請洽自己的物理治療師。' }));
  }
  function drawAnalysis() {
    out.textContent = '';
    var a = analyze(p.body);
    if (!a.items.length && !a.sides.length) return;
    out.appendChild(h('div', { class: 'card' },
      h('h2', { text: '從這些數字看得出來的' }),
      h('p', { class: 'mute', text: '都是用皮尺量的粗估，只能看傾向，不是診斷。' }),
      h('dl', { class: 'facts' }, a.items.map(function (i) {
        return [h('dt', {}, i.label + '：', h('b', { text: i.value })), h('dd', { text: i.note })];
      })),
      a.sides.length ? [h('h3', { text: '左右比較' }),
        h('ul', { class: 'sides' }, a.sides.map(function (s) {
          return h('li', { class: s.diff >= 5 ? 'big' : '', text: s.label + '：左 ' + s.l + '、右 ' + s.r + '，' + (s.bigger ? s.bigger + '邊大 ' + s.diff + '%' : '兩邊一樣') });
        }))] : null,
      a.suggestAsym && p.asym.has !== 'yes' ? h('p', { class: 'banner', id: 'asym-suggest' }, '左右量起來差了 ' + a.maxDiff + '%（5% 以上）。建議在上面的「左右有沒有明顯差異」選「有」，就可以設定兩邊要怎麼練。') : null));
  }

  wrap.appendChild(h('p', { class: 'mute', text: '只有前四項必填。其他的填越多，能看出來的越多；每一項下面都寫了它可以算出什麼。' }));
  wrap.appendChild(h('section', { class: 'card' }, h('h2', { text: '基本資料' }), group('required')));
  wrap.appendChild(h('section', { class: 'card' }, h('h2', { text: '建議填' }), group('recommended')));
  wrap.appendChild(h('details', { class: 'card' }, h('summary', { text: '可有可無（想看得更細再填）' }), group('optional')));
  wrap.appendChild(h('div', { class: 'row', style: 'margin:12px 0' },
    h('button', { class: 'btn accent', id: 'btn-save-body', text: '記下來並看分析', onclick: function () {
      var r = validateBody(draft), first = null;
      FIELDS.forEach(function (f) {
        errs[f.key].textContent = r.errors[f.key] || '';
        var el = document.getElementById('f-' + f.key);
        if (el) el.setAttribute('aria-invalid', String(!!r.errors[f.key]));
        if (r.errors[f.key] && !first) first = errs[f.key];
      });
      if (!r.ok) { first.scrollIntoView({ block: 'center' }); toast('有幾格要修正'); return; }
      p.body = Object.assign({}, draft);
      session.dirty = true;
      drawAnalysis();
      out.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } })));
  wrap.appendChild(h('section', { class: 'card' }, h('h2', { text: '左右差異' }),
    h('p', { class: 'mute', text: '不管量出來差多少，你都可以自己決定要不要分開練。' }),
    choice('asym.has', drawAsym), asymMore));
  wrap.appendChild(h('section', { class: 'card' }, h('h2', { text: '運動經驗和偏好' }),
    choice('prefs.freq'), choice('prefs.style'), choice('prefs.strong'), choice('prefs.avoid')));
  wrap.appendChild(out);
  wrap.appendChild(h('div', { class: 'row', style: 'margin:16px 0' },
    h('button', { class: 'btn primary', id: 'btn-save-file2', text: '下載最新檔案', onclick: downloadLatest }),
    h('button', { class: 'btn', text: '做試做動作', onclick: startTrial }),
    h('button', { class: 'btn', text: '回首頁', onclick: ui.renderPlan })));
  wrap.appendChild(ui.footerNote());
  drawAsym();
  drawAnalysis();
}

/* ========== 試做 ========== */
function startTrial() {
  var items = trialItems(db.ex, state.owned);
  if (!items.length) { toast('目前勾選的器材做不了試做動作'); return; }
  session.trial = { items: state.items, why: session.why, reasons: session.reasons };
  state.items = items;
  ui.startPlayer();
}
export function endTrial() {
  if (!session.trial) return;
  state.items = session.trial.items; session.why = session.trial.why; session.reasons = session.trial.reasons;
  session.trial = null;
}

/* ========== 今天的設定 → 排課表 ========== */
export function renderToday() {
  var t = session.today, p = session.profile;
  var wrap = page('今天的訓練');
  var focusBox = h('div', { id: 'focus-box' });
  var muscles = Object.keys(db.areas).filter(function (id) {
    return db.areas[id].kind === 'muscle' && db.list.some(function (ex) { return ex.primary.indexOf(id) >= 0; });
  });
  function drawFocus() {
    focusBox.textContent = '';
    if (t.goal !== 'focus') return;
    if (!t.focus || muscles.indexOf(t.focus) < 0) t.focus = 'glutes';
    var rel = relatedAreas(t.focus, db.list);
    focusBox.appendChild(h('label', { class: 'field' }, h('span', { text: '想加強哪裡' }),
      h('select', { id: 'focus-area', onchange: function (e) { t.focus = e.target.value; drawFocus(); } }, muscles.map(function (id) {
        return h('option', { value: id, selected: id === t.focus, text: REGION[db.areas[id].region] + '｜' + db.areas[id].name });
      }))));
    if (rel.length) focusBox.appendChild(h('p', { class: 'mute', id: 'focus-related', text: '練這裡的動作，通常也會用到：' + rel.map(areaName).join('、') + '。' }));
  }
  var minuteOpts = {}; MINUTES.forEach(function (m) { minuteOpts[m] = m + ' 分鐘'; });
  wrap.appendChild(h('section', { class: 'card' },
    h('div', { class: 'frow' }, h('span', { class: 'flabel', text: '今天有多少時間' }),
      pills('t-min', minuteOpts, String(t.minutes), function (k) { t.minutes = Number(k); })),
    h('div', { class: 'frow' }, h('span', { class: 'flabel', text: '時間要多嚴格' }),
      pills('t-strict', { 1: '不能超過', 0: '可以多一點' }, t.strict ? '1' : '0', function (k) { t.strict = k === '1'; })),
    h('div', { class: 'frow' }, h('span', { class: 'flabel', text: '今天想偏重什麼' }),
      pills('t-goal', GOALS, t.goal, function (k) { t.goal = k; drawFocus(); })),
    focusBox));
  wrap.appendChild(h('section', { class: 'card' },
    h('fieldset', {}, h('legend', { text: '手邊有的東西（沒有的取消打勾）' }),
      h('div', { class: 'checks' }, db.equip.filter(function (e) { return e.id !== 'none'; }).map(function (e) {
        return h('label', {}, h('input', { type: 'checkbox', value: e.id, checked: state.owned.has(e.id),
          onchange: function (ev) { if (ev.target.checked) state.owned.add(e.id); else state.owned.delete(e.id); } }),
          e.name + (e.substitute ? '（或' + e.substitute + '）' : ''));
      })))));
  if (!hasData(p)) wrap.appendChild(h('p', { class: 'mute', text: '你還沒填資料或做試做動作，這次會先用一般的預設來排。' }));
  wrap.appendChild(h('div', { class: 'row', style: 'margin:14px 0' },
    h('button', { class: 'btn accent', id: 'btn-generate', text: '排出課表', onclick: function () {
      var r = generateWorkout({ exercises: db.list, exById: db.ex, areas: db.areas, owned: state.owned,
        minutes: t.minutes, strict: t.strict, goal: t.goal, focus: t.focus, profile: p });
      if (!r.items.length) { alert(r.reasons[r.reasons.length - 1]); return; }
      state.items = r.items; session.why = r.why; session.reasons = r.reasons;
      ui.syncHash(); ui.renderPlan();
    } })));
  wrap.appendChild(ui.footerNote());
  drawFocus();
}

/* ========== 做完回報 ========== */
export function renderFeedback(app, mins) {
  var trial = !!session.trial, p = session.profile, answers = {};
  var list = state.items.filter(function (it, i, a) { return db.ex[it.id].category === 'train' && a.findIndex(function (x) { return x.id === it.id; }) === i; });
  if (!list.length) { renderDone(mins, [], trial); return; }
  var wrap = page(trial ? '試做回報' : '做完了，回報一下', '先跳過', function () { renderDone(mins, [], trial); });
  wrap.appendChild(h('p', { class: 'mute', text: '每個動作兩題：做得怎麼樣、哪裡有感覺。有回答的動作，下次會依這個小幅調整；沒做或不想答的可以留空。' }));

  list.forEach(function (it) {
    var ex = db.ex[it.id], a = answers[ex.id] = { areas: [] };
    var near = ex.primary.concat(ex.secondary, ex.watch.map(function (w) { return w.area; })).filter(function (x, i, arr) { return arr.indexOf(x) === i; });
    var rest = Object.keys(db.areas).filter(function (id) { return near.indexOf(id) < 0; });
    function chip(id) {
      return h('button', { class: 'chipbtn', type: 'button', 'aria-pressed': 'false', 'data-area': id, text: areaName(id), onclick: function (e) {
        var on = a.areas.indexOf(id) < 0;
        a.areas = on ? a.areas.concat([id]) : a.areas.filter(function (x) { return x !== id; });
        e.currentTarget.setAttribute('aria-pressed', String(on));
      } });
    }
    wrap.appendChild(h('section', { class: 'card fb', 'data-fb': ex.id },
      h('div', { class: 'fbhead' }, ui.img(ex), h('div', {}, h('h2', { text: ex.name }),
        h('p', { class: 'mute', text: '應該有感覺的地方：' + ex.primary.map(areaName).join('、') }))),
      h('p', { class: 'flabel', text: '做得怎麼樣？' }),
      ex.sided ? [h('p', { class: 'mute', text: '左邊' }), pills('how-L-' + ex.id, HOW, null, function (k) { a.howL = k; }),
        h('p', { class: 'mute', text: '右邊' }), pills('how-R-' + ex.id, HOW, null, function (k) { a.howR = k; })]
        : pills('how-' + ex.id, HOW, null, function (k) { a.how = k; }),
      h('p', { class: 'flabel', text: '哪裡有感覺？（可以選多個）' }),
      h('div', { class: 'chipset' }, near.map(chip)),
      h('details', {}, h('summary', { text: '其他地方' }), h('div', { class: 'chipset' }, rest.map(chip))),
      h('label', { class: 'painrow' }, h('input', { type: 'checkbox', 'data-pain': ex.id, onchange: function (e) { a.pain = e.target.checked; } }),
        '這個動作有疼痛或明顯不舒服')));
  });

  wrap.appendChild(h('div', { class: 'row', style: 'margin:14px 0' },
    h('button', { class: 'btn accent', id: 'btn-fb-send', text: '送出回報', onclick: function () {
      var results = [];
      list.forEach(function (it) {
        var ex = db.ex[it.id], a = answers[ex.id];
        if (ex.sided && (a.howL || a.howR) && !(a.howL && a.howR)) { a.howL = a.howL || a.howR; a.howR = a.howR || a.howL; }
        if (!a.pain && !a.how && !a.howL) return;
        if (a.pain && !a.how && !a.howL) a.how = 'short';
        var r = evaluate(ex, it, a, p.adj[ex.id], areaName);
        p.adj[ex.id] = r.adj;
        if (trial) {
          var worst = [a.how, a.howL, a.howR].filter(Boolean).sort(function (x, y) { return ['short', 'form', 'stable'].indexOf(x) - ['short', 'form', 'stable'].indexOf(y); })[0];
          p.trials[ex.id] = { how: a.pain ? 'short' : worst, areas: a.areas.slice() };
        }
        results.push({ ex: ex, messages: r.messages, adj: r.adj });
      });
      if (results.length) session.dirty = true;
      if (!trial) {
        state.items = state.items.filter(function (it) { return !(p.adj[it.id] && p.adj[it.id].stopped); })
          .map(function (it) { return results.some(function (r) { return r.ex.id === it.id; }) ? applyAdj(it, db.ex[it.id], p.adj[it.id], p.asym.mode !== 'same') : it; });
        ui.syncHash();
      }
      renderDone(mins, results, trial);
    } }),
    h('button', { class: 'btn', id: 'btn-fb-skip', text: '這次先跳過', onclick: function () { renderDone(mins, [], trial); } })));
}

function renderDone(mins, results, trial) {
  var count = state.items.length;
  if (trial) endTrial();
  var p = session.profile, t = tendency(p, db.ex);
  var wrap = page(trial ? '試做完成' : '完成了');
  wrap.appendChild(h('div', { class: 'card', id: 'done' },
    h('p', { class: 'big', text: trial ? '試做完成' : '完成了' }),
    h('p', { class: 'mute', text: '這次花了大約 ' + mins + ' 分鐘，做了 ' + count + ' 個動作。' }),
    trial ? h('p', { id: 'trial-result', text: !results.length ? '這次沒有回報，所以還看不出傾向。'
      : t.weak ? '從試做看起來，你的' + REGION[t.weak] + '比較吃力，之後排課表會多排一點。這只是傾向，會隨著之後的回報調整。'
      : '從試做看起來，上下半身和核心沒有明顯差很多，之後會先平均排。' })
      : h('p', { class: 'mute', text: '建議 ' + (state.freq.every === 1 ? '明天' : state.freq.every + ' 天後') + '再做一次。這個頻率可以在「加入行事曆」裡調整。' })));
  if (results.length) {
    wrap.appendChild(h('section', { class: 'card', id: 'fb-result' },
      h('h2', { text: trial ? '依你的回報' : '下次的調整' }),
      results.map(function (r) { return h('div', { class: 'fbr' }, h('h3', { text: r.ex.name }), h('ul', {}, r.messages.map(function (m) { return h('li', { text: m }); }))); }),
      trial ? null : h('p', { class: 'mute', text: '這些調整已經套用到這組課表和訓練連結，你還是可以自己再改。' })));
    wrap.appendChild(h('p', { class: 'banner', text: '回報只留在這個頁面裡。要讓下次也記得，請下載最新檔案。' }));
  }
  wrap.appendChild(h('div', { class: 'row', style: 'margin:14px 0' },
    results.length ? h('button', { class: 'btn primary', id: 'btn-save-file3', text: '下載最新檔案', onclick: downloadLatest }) : null,
    trial ? h('button', { class: 'btn accent', text: '幫我排一組', onclick: renderToday }) : null,
    h('button', { class: 'btn', id: 'btn-back-plan', text: trial ? '回首頁' : '回到課表', onclick: ui.renderPlan }),
    trial ? null : h('button', { class: 'btn', text: '加入行事曆', onclick: ui.openCalendar }),
    trial ? null : h('button', { class: 'btn', text: ui.shareLabel(), onclick: ui.copyLink })));
  wrap.appendChild(ui.footerNote());
}
