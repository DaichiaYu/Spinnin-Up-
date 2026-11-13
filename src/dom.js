// 畫面用的小工具。
export function h(tag, attrs) {
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
var toastTimer;
export function toast(msg) {
  var old = document.querySelector('.toast');
  if (old) old.remove();
  var t = h('div', { class: 'toast', role: 'status', text: msg });
  document.body.appendChild(t);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { t.remove(); }, 3200);
}
export function downloadText(name, text, type) {
  var blob = new Blob([text], { type: type });
  var a = h('a', { href: URL.createObjectURL(blob), download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
}
// 讀使用者選的檔案。Excel 在台灣存 CSV 常用 Big5，不是 UTF-8，所以兩種都試。
export function readTextFile(file) {
  return file.arrayBuffer().then(function (buf) {
    try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); }
    catch (e) { try { return new TextDecoder('big5').decode(buf); } catch (e2) { return new TextDecoder('utf-8').decode(buf); } }
  });
}
// 一排可以點選的選項（單選或多選）
export function pills(name, options, current, onChange, multi) {
  return h('div', { class: 'pills', role: multi ? 'group' : 'radiogroup' }, Object.keys(options).map(function (k) {
    var checked = multi ? (current || []).indexOf(k) >= 0 : current === k;
    return h('label', { class: 'pill' },
      h('input', { type: multi ? 'checkbox' : 'radio', name: name, value: k, checked: checked, onchange: function (e) { onChange(k, e.target.checked); } }),
      h('span', { text: options[k] }));
  }));
}
