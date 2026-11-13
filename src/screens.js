// 首頁、我的身體、今天想怎麼練、做完回報的畫面。
// 規則都在 profile.js / generator.js / feedback.js，這裡只負責顯示和收集。
import { db, state, session } from './store.js';
import { h, toast, downloadText, readTextFile, pills } from './dom.js';
import { pad } from './util.js';
import { FIELDS, CHOICES, GEAR, REGIONS, OBSERVATIONS, STALE_WEEKS, emptyProfile, hasData, get, isRequired, basicsDone, validateValues, regionCount,
  analyze, tendency, isStale, toCSV, fromCSV } from './profile.js';
import { EFFECTS, WHERE, INTENSITY, ENERGY, FATIGUE, PLACE, MINUTES, PATTERN_NAMES, flexExtra, generateWorkout, trialItems, relatedAreas } from './generator.js';
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
function touch() { session.dirty = true; }

/* ---------- 檔案 ---------- */
function downloadBlank() {
  downloadText('spinnin-up-空白表格.csv', toCSV(emptyProfile(), null), 'text/csv;charset=utf-8');
  toast('用 Excel、Numbers 或 Google 試算表打開，填「你的值」那一欄，再傳上來');
}
function downloadLatest() {
  var p = session.profile, now = new Date(), t = session.today;
  p.settings = { owned: Array.from(state.owned).join('|'), every: state.freq.every, count: state.freq.count,
    minutes: t.minutes, strict: t.strict ? 1 : 0, effect: t.effect, where: t.where, focus: t.focus, intensity: t.intensity, place: t.place };
  p.savedAt = now.toISOString();
  downloadText('spinnin-up-我的資料-' + now.getFullYear() + pad(now.getMonth() + 1) + pad(now.getDate()) + '.csv', toCSV(p, now), 'text/csv;charset=utf-8');
  session.dirty = false;
  toast('已下載。下次打開頁面時，把這個檔案傳上來就能接著用');
}
function applySettings(p) {
  var s = p.settings || {}, t = session.today, m = Number(s.minutes);
  if (s.owned != null) { state.owned.clear(); state.owned.add('none'); String(s.owned).split('|').forEach(function (q) { if (db.equip.some(function (e) { return e.id === q; })) state.owned.add(q); }); }
  if (Number(s.every) >= 1 && Number(s.every) <= 14) state.freq.every = Number(s.every);
  if (Number(s.count) >= 1 && Number(s.count) <= 60) state.freq.count = Number(s.count);
  if (m >= 3 && m <= 90) t.minutes = m;
  if (s.strict != null) t.strict = String(s.strict) === '1';
  if (EFFECTS[s.effect]) t.effect = s.effect;
  if (WHERE[s.where]) t.where = s.where;
  if (INTENSITY[s.intensity]) t.intensity = s.intensity;
  if (PLACE[s.place]) t.place = s.place;
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
  var p = session.profile, has = hasData(p), t = tendency(p, db.ex);
  wrap.appendChild(h('section', { class: 'card home' },
    h('h2', { text: '今天的訓練' }),
    h('p', { class: 'mute', text: '告訴它今天的狀態、想怎麼練、有多少時間，它會排出一組給你看。排出來的每個動作你都可以刪、換、改量。' }),
    h('div', { class: 'row' },
      h('button', { class: 'btn accent', id: 'btn-today', text: '幫我排一組', onclick: renderToday }),
      h('button', { class: 'btn', id: 'btn-sample', text: '用範例開始', onclick: actions.useSample }),
      h('button', { class: 'btn', id: 'btn-add-empty', text: '自己加動作', onclick: actions.addOwn }))));

  var status = !has ? '還沒有資料。不填也能用，填了會排得更適合你。'
    : (basicsDone(p) ? '基本資料已填。' : '基本資料還沒填完。') + (t.tested ? '試做過 ' + t.tested + ' 個動作。' : '還沒做試做動作。') +
      (t.weakPatterns.length ? '目前比較吃力的是：' + t.weakPatterns.map(function (k) { return PATTERN_NAMES[k] || k; }).join('、') + '。' : '');
  wrap.appendChild(h('section', { class: 'card home', id: 'my-data' },
    h('h2', { text: '我的身體' }),
    h('p', { class: 'mute', id: 'data-status', text: status }),
    p.savedAt ? h('p', { class: 'mute', text: '檔案的時間：' + dateText(p.savedAt) }) : null,
    isStale(p.savedAt, new Date()) ? h('p', { class: 'banner', text: '這份資料已經超過 ' + STALE_WEEKS + ' 週，建議重新量一次、重做試做動作。' }) : null,
    session.dirty ? h('p', { class: 'banner', id: 'dirty-note', text: '有新的資料還沒下載。關掉頁面就會不見，記得按「下載最新檔案」。' }) : null,
    h('div', { class: 'row' },
      h('button', { class: 'btn', id: 'btn-profile', text: has ? '查看或修改' : '在頁面上填', onclick: function () { renderProfile(); } }),
      h('button', { class: 'btn', id: 'btn-trial', text: t.tested ? '重做試做動作' : '做試做動作（約 4 分鐘）', onclick: startTrial })),
    h('div', { class: 'row', style: 'margin-top:8px' },
      h('button', { class: 'btn small', id: 'btn-upload', text: '上傳我的檔案', onclick: function () { upload(); } }),
      h('button', { class: 'btn small', id: 'btn-blank', text: '下載空白表格', onclick: downloadBlank }),
      has ? h('button', { class: 'btn small' + (session.dirty ? ' primary' : ''), id: 'btn-save-file', text: '下載最新檔案', onclick: function () { downloadLatest(); ui.renderPlan(); } }) : null),
    h('p', { class: 'mute', text: '這個頁面不會幫你存資料。要留到下次，就下載檔案，下次再傳上來。也可以下載空白表格，用試算表填好再上傳。' })));
}

/* ========== 我的身體 ========== */
// 人體圖上的八個區域（正面）。座標是 200×360 的畫布。
var ZONES = {
  head_neck: ['<circle cx="100" cy="30" r="20"/>', '<rect x="91" y="48" width="18" height="14" rx="4"/>'],
  shoulder_chest: ['<rect x="62" y="62" width="76" height="46" rx="14"/>'],
  arms: ['<rect x="38" y="66" width="20" height="96" rx="10"/>', '<rect x="142" y="66" width="20" height="96" rx="10"/>'],
  trunk: ['<rect x="68" y="110" width="64" height="44" rx="8"/>'],
  pelvis: ['<rect x="64" y="156" width="72" height="34" rx="14"/>'],
  thigh: ['<rect x="66" y="192" width="30" height="72" rx="13"/>', '<rect x="104" y="192" width="30" height="72" rx="13"/>'],
  calf: ['<rect x="70" y="266" width="24" height="60" rx="11"/>', '<rect x="106" y="266" width="24" height="60" rx="11"/>'],
  foot: ['<rect x="64" y="328" width="32" height="16" rx="7"/>', '<rect x="104" y="328" width="32" height="16" rx="7"/>']
};
function bodyMap(selected, onPick) {
  var p = session.profile, box = h('div', { class: 'bodymap' });
  var svg = '<svg viewBox="0 0 200 350" role="group" aria-label="人體圖，點部位來填資料">' + REGIONS.map(function (r) {
    var cls = 'zone' + (r.id === selected ? ' on' : '') + (regionCount(p, r.id) ? ' has' : '');
    return '<g class="' + cls + '" data-zone="' + r.id + '" role="button" tabindex="0" aria-label="' + r.name + '" aria-pressed="' + (r.id === selected) + '">' + ZONES[r.id].join('') + '</g>';
  }).join('') + '</svg>';
  var fig = h('div', { class: 'bodyfig' });
  fig.innerHTML = svg;                      // 內容是固定的常數，沒有使用者輸入
  fig.querySelectorAll('.zone').forEach(function (g) {
    g.addEventListener('click', function () { onPick(g.getAttribute('data-zone')); });
    g.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(g.getAttribute('data-zone')); } });
  });
  box.appendChild(fig);
  box.appendChild(h('div', { class: 'regionlist' }, REGIONS.map(function (r) {
    var cnt = regionCount(p, r.id);
    return h('button', { class: 'regionbtn', 'data-region': r.id, 'aria-pressed': String(r.id === selected), onclick: function () { onPick(r.id); } },
      h('span', { text: r.name }), h('small', { text: cnt ? '已填 ' + cnt + ' 項' : '還沒填' }));
  })));
  return box;
}

export function renderProfile(openRegion) {
  var p = session.profile, selected = openRegion || null;
  var wrap = page('我的身體');
  var mapCard = h('section', { class: 'card', id: 'map-card' }), out = h('section', { id: 'analysis' }), asymMore = h('div', { id: 'asym-more' }), need = h('p', { class: 'mute', id: 'need' });

  function refresh() {
    var miss = FIELDS.filter(isRequired).filter(function (f) { return p.basics[f.key] == null; }).map(function (f) { return f.label; });
    need.textContent = miss.length ? '還沒填：' + miss.join('、') + '。' : '基本資料填好了。';
    drawAnalysis();
  }
  function field(f) {
    var input, err = h('p', { class: 'err', role: 'alert', id: 'err-' + f.key }), store = p[f.layer];
    if (f.type === 'choice') {
      input = pills('f-' + f.key, f.options, store[f.key], function (k) { store[f.key] = k; touch(); refresh(); updateMap(); });
    } else {
      input = h('span', { class: 'numwrap' },
        h('input', { type: 'number', id: 'f-' + f.key, inputmode: 'decimal', step: 'any', min: f.min, max: f.max, value: store[f.key] == null ? '' : store[f.key],
          'aria-describedby': 'why-' + f.key + ' err-' + f.key,
          onchange: function (e) {
            var v = e.target.value.trim(), val = {};
            if (v === '') { delete store[f.key]; err.textContent = ''; e.target.setAttribute('aria-invalid', 'false'); }
            else {
              val[f.key] = Number(v);
              var r = validateValues(val, [f.key]);
              err.textContent = r.errors[f.key] || '';
              e.target.setAttribute('aria-invalid', String(!r.ok));
              if (r.ok) store[f.key] = Number(v); else delete store[f.key];
            }
            touch(); refresh(); updateMap();
          } }),
        h('span', { class: 'unit', text: f.unit }));
    }
    return h('div', { class: 'frow' },
      h('label', { for: f.type === 'choice' ? null : 'f-' + f.key, class: 'flabel', text: f.label + (isRequired(f) ? '（必填）' : '') }),
      input, h('p', { class: 'why', id: 'why-' + f.key, text: f.why }), err);
  }
  function choice(key, onChange) {
    var ch = CHOICES[key], parts = key.split('.'), obj = p[parts[0]];
    return h('div', { class: 'frow' }, h('span', { class: 'flabel', text: ch.label + (ch.multi ? '（可以選多個）' : '') }),
      pills('c-' + key, ch.options, obj[parts[1]], function (k, on) {
        if (ch.multi) { var list = obj[parts[1]] || []; obj[parts[1]] = on ? list.concat([k]) : list.filter(function (x) { return x !== k; }); }
        else obj[parts[1]] = k;
        touch();
        if (onChange) onChange();
      }, ch.multi));
  }
  var mapHead = h('div', {}), panel = h('div', { id: 'region-panel' });
  function drawMapHead() {
    mapHead.textContent = '';
    mapHead.appendChild(bodyMap(selected, function (id) { selected = selected === id ? null : id; drawMapHead(); drawPanel(true); }));
  }
  // 只更新人體圖上的標示和「已填幾項」，不重畫。
  // （重畫會讓正在點的那一下落空：輸入框失去焦點時會觸發更新，剛好發生在點下去和放開之間。）
  function updateMap() {
    REGIONS.forEach(function (r) {
      var cnt = regionCount(p, r.id), z = mapHead.querySelector('[data-zone="' + r.id + '"]'), b = mapHead.querySelector('[data-region="' + r.id + '"] small');
      if (z) z.classList.toggle('has', cnt > 0);
      if (b) b.textContent = cnt ? '已填 ' + cnt + ' 項' : '還沒填';
    });
  }
  function drawPanel(scroll) {
    panel.textContent = '';
    if (!selected) { panel.appendChild(h('p', { class: 'mute', text: '點人體圖或右邊的部位名稱，就會展開那個部位可以填的資料。都可以不填。' })); return; }
    var r = REGIONS.filter(function (x) { return x.id === selected; })[0];
    var mine = FIELDS.filter(function (f) { return f.region === selected; });
    var basic = mine.filter(function (f) { return f.level === 'basic'; }), more = mine.filter(function (f) { return f.level === 'more'; });
    var obs = {};
    OBSERVATIONS.filter(function (x) { return x.region === selected; }).forEach(function (x) { obs[x.id] = x.label; });
    panel.appendChild(h('div', { class: 'regionpanel', 'data-panel': selected },
      h('h3', { text: r.name }),
      basic.map(field),
      more.length ? h('details', { class: 'more' }, h('summary', { text: '更多資料（' + more.length + ' 項，想看得更細再填）' }), more.map(field)) : null,
      h('div', { class: 'frow' }, h('span', { class: 'flabel', text: '我注意到的、想改善的（可以選多個）' }),
        pills('obs-' + selected, obs, p.observations, function (k, on) {
          p.observations = on ? p.observations.concat([k]) : p.observations.filter(function (x) { return x !== k; });
          touch(); refresh(); updateMap();
        }, true),
        h('p', { class: 'why', text: '這是你自己的觀察，不是診斷。它會用來決定排課表時要多排或避開什麼。' }))));
    if (scroll) panel.scrollIntoView({ block: 'nearest' });
  }
  function drawAsym() {
    asymMore.textContent = '';
    if (p.asym.has !== 'yes') return;
    asymMore.appendChild(choice('asym.where'));
    asymMore.appendChild(choice('asym.mode'));
    asymMore.appendChild(h('p', { class: 'banner', text: '這裡只提供調整的選項，不是診斷。左右差異以個人狀況為準，有疑慮請洽自己的物理治療師。' }));
  }
  function drawAnalysis() {
    out.textContent = '';
    var a = analyze(p);
    if (!a.items.length && !a.sides.length && !a.relative.length) return;
    out.appendChild(h('div', { class: 'card' },
      h('h2', { text: '從這些資料看得出來的' }),
      h('p', { class: 'mute', text: '都是粗估，只能看傾向，不是診斷。' + (a.summary.length ? '摘要：' + a.summary.join('；') + '。' : '') }),
      h('dl', { class: 'facts' }, a.items.map(function (i) {
        return [h('dt', {}, i.label + '：', h('b', { text: i.value })), h('dd', {}, i.note, h('details', { class: 'how' }, h('summary', { text: '怎麼算的' }), h('p', { text: i.how })))];
      })),
      a.sides.length || a.relative.length ? [h('h3', { text: '左右比較' }),
        h('ul', { class: 'sides' }, a.sides.map(function (s) {
          return h('li', { class: s.diff >= 5 ? 'big' : '', text: s.label + '：左 ' + s.l + '、右 ' + s.r + '，' + (s.bigger ? s.bigger + '邊多 ' + s.diff + '%' : '兩邊一樣') });
        }), a.relative.map(function (x) { return h('li', { class: 'big', text: x + '（你自己填的）' }); }))] : null,
      a.suggestAsym && p.asym.has !== 'yes' ? h('p', { class: 'banner', id: 'asym-suggest', text: '你填的資料顯示左右有差異。建議在「左右差異」選「有」，就可以設定兩邊要怎麼練。' }) : null));
  }

  wrap.appendChild(h('p', { class: 'mute', text: '只有四項必填。其他的都收在各個部位裡，點到才展開；填越多，能看出來的越多。填的時候就會記下來，不用另外按儲存。' }));
  wrap.appendChild(h('section', { class: 'card', id: 'basics-card' }, h('h2', { text: '基本資料' }), need,
    FIELDS.filter(isRequired).map(field),
    h('details', { class: 'more' }, h('summary', { text: '更多（慣用手、慣用腳）' }), FIELDS.filter(function (f) { return f.layer === 'basics' && !isRequired(f); }).map(field))));
  mapCard.appendChild(h('h2', { text: '身體各部位' }));
  mapCard.appendChild(mapHead); mapCard.appendChild(panel);
  wrap.appendChild(mapCard);
  wrap.appendChild(h('section', { class: 'card' }, h('h2', { text: '其他想改善的、長期目標' }),
    h('label', { class: 'field' }, h('span', { text: '上面沒有列到、但你在意的地方' }),
      h('textarea', { id: 'other-note', rows: 2, maxlength: 300, oninput: function (e) { p.otherNote = e.target.value; touch(); } }, p.otherNote || '')),
    h('p', { class: 'why', text: '目前只會記下來，還不會影響課表。' }),
    choice('prefs.longGoals')));
  wrap.appendChild(h('section', { class: 'card' }, h('h2', { text: '左右差異' }),
    h('p', { class: 'mute', text: '不管量出來差多少，你都可以自己決定要不要分開練。' }),
    choice('asym.has', function () { drawAsym(); drawAnalysis(); }), asymMore));
  wrap.appendChild(h('details', { class: 'card' }, h('summary', { text: '運動經驗、偏好、不想做的' }),
    choice('prefs.freq'), choice('prefs.style'), choice('prefs.strong'), choice('prefs.avoid')));
  wrap.appendChild(out);
  wrap.appendChild(h('div', { class: 'row', style: 'margin:16px 0' },
    h('button', { class: 'btn primary', id: 'btn-save-file2', text: '下載最新檔案', onclick: downloadLatest }),
    h('button', { class: 'btn', text: '做試做動作', onclick: startTrial }),
    h('button', { class: 'btn', text: '回首頁', onclick: ui.renderPlan })));
  wrap.appendChild(ui.footerNote());
  drawMapHead(); drawPanel(false); drawAsym(); refresh();
}

/* ========== 試做 ========== */
function startTrial() {
  var items = trialItems(db.ex, state.owned);
  if (!items.length) { toast('目前勾選的器材做不了試做動作'); return; }
  session.trial = { items: state.items, why: session.why, reasons: session.reasons, used: session.used };
  state.items = items;
  ui.startPlayer();
}
export function endTrial() {
  if (!session.trial) return;
  state.items = session.trial.items; session.why = session.trial.why; session.reasons = session.trial.reasons; session.used = session.trial.used;
  session.trial = null;
}

/* ========== 今天想怎麼練 ========== */
export function renderToday() {
  var t = session.today, p = session.profile;
  var wrap = page('今天想怎麼練');
  var focusBox = h('div', { id: 'focus-box' }), strictBox = h('div', { id: 'strict-box' }), customBox = h('span', {});
  var muscles = Object.keys(db.areas).filter(function (id) {
    return db.areas[id].kind === 'muscle' && db.list.some(function (ex) { return ex.primary.indexOf(id) >= 0; });
  });
  function drawFocus() {
    focusBox.textContent = '';
    if (t.where !== 'area') return;
    if (!t.focus || muscles.indexOf(t.focus) < 0) t.focus = 'glutes';
    var rel = relatedAreas(t.focus, db.list);
    focusBox.appendChild(h('label', { class: 'field' }, h('span', { text: '想練哪個部位' }),
      h('select', { id: 'focus-area', onchange: function (e) { t.focus = e.target.value; drawFocus(); } }, muscles.map(function (id) {
        return h('option', { value: id, selected: id === t.focus, text: REGION[db.areas[id].region] + '｜' + db.areas[id].name });
      }))));
    if (rel.length) focusBox.appendChild(h('p', { class: 'mute', id: 'focus-related', text: '練這裡的動作，通常也會用到：' + rel.map(areaName).join('、') + '。' }));
  }
  function drawStrict() {
    strictBox.textContent = '';
    strictBox.appendChild(pills('t-strict', { 1: '不能超過 ' + t.minutes + ' 分鐘', 0: t.minutes + ' 分鐘左右，可以多 ' + flexExtra(t.minutes) + ' 分鐘' }, t.strict ? '1' : '0', function (k) { t.strict = k === '1'; }));
  }
  var minuteOpts = {}, isCustom = MINUTES.indexOf(t.minutes) < 0;
  MINUTES.forEach(function (m) { minuteOpts[m] = m + ' 分鐘'; });
  minuteOpts.custom = '自己輸入';
  function drawCustom(show) {
    customBox.textContent = '';
    if (!show) return;
    customBox.appendChild(h('span', { class: 'numwrap', style: 'margin-top:8px' },
      h('input', { type: 'number', id: 't-custom', min: 3, max: 90, step: 1, inputmode: 'numeric', value: t.minutes, 'aria-label': '自己輸入幾分鐘',
        onchange: function (e) { var v = Math.round(Number(e.target.value)); if (!(v >= 3 && v <= 90)) { v = Math.min(90, Math.max(3, v || 15)); e.target.value = v; toast('時間要在 3 到 90 分鐘之間'); } t.minutes = v; drawStrict(); } }),
      h('span', { class: 'unit', text: '分鐘（3–90）' })));
  }
  var regionOpts = {}; REGIONS.forEach(function (r) { regionOpts[r.id] = r.name; });

  wrap.appendChild(h('section', { class: 'card' }, h('h2', { text: '今天的狀態' }),
    h('div', { class: 'frow' }, h('span', { class: 'flabel', text: '精神' }), pills('t-energy', ENERGY, t.energy, function (k) { t.energy = k; })),
    h('div', { class: 'frow' }, h('span', { class: 'flabel', text: '肌肉痠累' }), pills('t-fatigue', FATIGUE, t.fatigue, function (k) { t.fatigue = k; })),
    h('div', { class: 'frow' }, h('span', { class: 'flabel', text: '今天哪裡不舒服（沒有就不用選）' }),
      pills('t-sore', regionOpts, t.sore, function (k, on) { t.sore = on ? t.sore.concat([k]) : t.sore.filter(function (x) { return x !== k; }); }, true),
      h('p', { class: 'why', text: '選了的地方，今天不會排主要練那裡的動作。' }))));
  wrap.appendChild(h('section', { class: 'card' }, h('h2', { text: '想怎麼練' }),
    h('div', { class: 'frow' }, h('span', { class: 'flabel', text: '今天主要想要的效果' }), pills('t-effect', EFFECTS, t.effect, function (k) { t.effect = k; })),
    h('div', { class: 'frow' }, h('span', { class: 'flabel', text: '想練哪裡' }), pills('t-where', WHERE, t.where, function (k) { t.where = k; drawFocus(); }), focusBox),
    h('div', { class: 'frow' }, h('span', { class: 'flabel', text: '今天想做到什麼程度' }), pills('t-intensity', INTENSITY, t.intensity, function (k) { t.intensity = k; })),
    h('div', { class: 'frow' }, h('span', { class: 'flabel', text: '在哪裡做' }), pills('t-place', PLACE, t.place, function (k) { t.place = k; }))));
  wrap.appendChild(h('section', { class: 'card' }, h('h2', { text: '時間' }),
    h('div', { class: 'frow' }, h('span', { class: 'flabel', text: '今天有多少時間' }),
      pills('t-min', minuteOpts, isCustom ? 'custom' : String(t.minutes), function (k) {
        if (k === 'custom') drawCustom(true); else { t.minutes = Number(k); drawCustom(false); }
        drawStrict();
      }), customBox),
    h('div', { class: 'frow' }, h('span', { class: 'flabel', text: '時間要多嚴格' }), strictBox)));
  wrap.appendChild(h('section', { class: 'card' },
    h('fieldset', {}, h('legend', { text: '手邊有的東西（沒有的取消打勾）' }),
      h('div', { class: 'checks' }, db.equip.filter(function (e) { return e.id !== 'none'; }).map(function (e) {
        return h('label', {}, h('input', { type: 'checkbox', value: e.id, checked: state.owned.has(e.id),
          onchange: function (ev) { if (ev.target.checked) state.owned.add(e.id); else state.owned.delete(e.id); } }),
          e.name + (e.substitute ? '（或' + e.substitute + '）' : ''));
      }))),
    h('details', { class: 'more' }, h('summary', { text: '重量和阻力（可以不填）' }),
      GEAR.map(function (g) {
        var input = g.options ? pills('g-' + g.key, g.options, p.gear[g.key], function (k) { p.gear[g.key] = k; touch(); })
          : h('span', { class: 'numwrap' }, h('input', { type: 'number', id: 'g-' + g.key, min: g.min, max: g.max, step: 'any', inputmode: 'decimal', value: p.gear[g.key] == null ? '' : p.gear[g.key],
            onchange: function (e) { var v = Number(e.target.value); if (e.target.value === '') delete p.gear[g.key]; else if (v >= g.min && v <= g.max) p.gear[g.key] = v; else { e.target.value = ''; delete p.gear[g.key]; toast(g.label + '要在 ' + g.min + ' 到 ' + g.max + ' 之間'); } touch(); } }),
            h('span', { class: 'unit', text: g.unit }));
        return h('div', { class: 'frow' }, h('label', { class: 'flabel', for: g.options ? null : 'g-' + g.key, text: g.label }), input);
      }),
      h('p', { class: 'why', text: '目前只會顯示在動作旁邊提醒你用哪個，還不會自動換算難度。' }))));
  if (!hasData(p)) wrap.appendChild(h('p', { class: 'mute', text: '你還沒填資料或做試做動作，這次會先用一般的預設來排。' }));
  wrap.appendChild(h('div', { class: 'row', style: 'margin:14px 0' },
    h('button', { class: 'btn accent', id: 'btn-generate', text: '排出課表', onclick: function () {
      var r = generateWorkout({ exercises: db.list, exById: db.ex, areas: db.areas, facets: db.facets, owned: state.owned,
        minutes: t.minutes, strict: t.strict, effect: t.effect, where: t.where, focus: t.focus, intensity: t.intensity,
        energy: t.energy, fatigue: t.fatigue, sore: t.sore, place: t.place, profile: p });
      if (!r.items.length) { alert(r.reasons[r.reasons.length - 1]); return; }
      state.items = r.items; session.why = r.why; session.reasons = r.reasons; session.used = r.used;
      ui.syncHash(); ui.renderPlan();
    } })));
  wrap.appendChild(ui.footerNote());
  drawFocus(); drawStrict(); drawCustom(isCustom);
}

/* ========== 做完回報 ========== */
var HOW_ORDER = ['short', 'form', 'stable'];
export function renderFeedback(app, mins) {
  var trial = !!session.trial, p = session.profile, answers = {};
  var list = state.items.filter(function (it, i, a) { return db.ex[it.id].category === 'train' && a.findIndex(function (x) { return x.id === it.id; }) === i; });
  if (!list.length) { renderDone(mins, [], trial); return; }
  var wrap = page(trial ? '試做回報' : '做完了，回報一下', '先跳過', function () { renderDone(mins, [], trial); });
  wrap.appendChild(h('p', { class: 'mute', text: '每個動作兩題：做得怎麼樣、哪裡有感覺。有回答的動作，下次會依這個小幅調整；沒做或不想答的可以留空。' }));

  list.forEach(function (it) {
    var ex = db.ex[it.id], a = answers[ex.id] = { areas: [] }, unit = ex.mode === 'hold' ? '秒' : '下';
    var near = ex.primary.concat(ex.secondary, ex.watch.map(function (w) { return w.area; })).filter(function (x, i, arr) { return arr.indexOf(x) === i; });
    var rest = Object.keys(db.areas).filter(function (id) { return near.indexOf(id) < 0; });
    var actualBox = h('div', { class: 'actual', hidden: true },
      h('label', { class: 'mute', for: 'actual-' + ex.id, text: '實際大概做到多少？（可以不填）' }),
      h('span', { class: 'numwrap' }, h('input', { type: 'number', id: 'actual-' + ex.id, min: 1, max: it.dose, step: 1, inputmode: 'numeric',
        onchange: function (e) { var v = Number(e.target.value); a.actual = v > 0 && v < it.dose ? v : undefined; } }), h('span', { class: 'unit', text: unit + '（預定 ' + it.dose + '）' })));
    function showActual() { actualBox.hidden = !(a.how === 'short' || a.howL === 'short' || a.howR === 'short') || ex.sided; }
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
        : pills('how-' + ex.id, HOW, null, function (k) { a.how = k; showActual(); }),
      actualBox,
      trial ? h('label', { class: 'field' }, h('span', { text: '有多吃力？（1 很輕鬆，10 用盡全力；可以不填）' }),
        h('select', { 'data-rpe': ex.id, onchange: function (e) { a.rpe = Number(e.target.value) || undefined; } },
          [h('option', { value: '', text: '不填' })].concat([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(function (n) { return h('option', { value: n, text: String(n) }); })))) : null,
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
          // 試做保留原始結果：做了多少、多吃力、哪裡有感覺、左右各自怎麼樣
          var worst = [a.how, a.howL, a.howR].filter(Boolean).sort(function (x, y) { return HOW_ORDER.indexOf(x) - HOW_ORDER.indexOf(y); })[0];
          var cap = { how: a.pain ? 'short' : worst, areas: a.areas.slice(), sec: a.actual || it.dose };
          if (a.rpe) cap.rpe = a.rpe;
          if (a.howL && a.howR) { cap.howL = a.howL; cap.howR = a.howR; }
          p.capability[ex.id] = cap;
        }
        results.push({ ex: ex, messages: r.messages, adj: r.adj });
      });
      if (results.length) touch();
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
  var names = function (list) { return list.map(function (k) { return PATTERN_NAMES[k] || k; }).join('、'); };
  wrap.appendChild(h('div', { class: 'card', id: 'done' },
    h('p', { class: 'big', text: trial ? '試做完成' : '完成了' }),
    h('p', { class: 'mute', text: '這次花了大約 ' + mins + ' 分鐘，做了 ' + count + ' 個動作。' }),
    trial ? h('p', { id: 'trial-result', text: !results.length ? '這次沒有回報，所以還看不出傾向。'
      : t.weakPatterns.length ? '從試做看起來，比較吃力的是「' + names(t.weakPatterns) + '」這類動作。之後這類動作會排，但會選難度低一點的。這只是傾向，會隨著之後的回報調整。'
      : '從試做看起來，這幾類動作都還穩，沒有哪一類特別吃力。' })
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
