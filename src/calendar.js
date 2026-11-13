// 行事曆檔（.ics）。不碰畫面。
import { pad } from './util.js';

function icsEscape(s) { return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n'); }

// 檢查使用者填的值。回傳 { ok, errors: {欄位: 訊息}, value }
export function validateCalendarInput(input) {
  var errors = {}, start = new Date(input.start), every = Number(input.every), count = Number(input.count);
  if (!input.start || isNaN(start)) errors.start = '請選第一次的日期和時間。';
  if (!Number.isInteger(every) || every < 1 || every > 14) errors.every = '請選多久做一次。';
  if (String(input.count).trim() === '' || !Number.isInteger(count)) errors.count = '請填 1 到 60 之間的整數。';
  else if (count < 1 || count > 60) errors.count = '次數要在 1 到 60 之間。';
  var ok = !Object.keys(errors).length;
  return { ok: ok, errors: errors, value: ok ? { start: start, every: every, count: count } : null };
}

// opts：{ start: Date, every, count, minutes, url, names: [動作名稱], now: Date, uid }
export function buildICS(opts) {
  var start = opts.start, now = opts.now || new Date();
  var local = start.getFullYear() + pad(start.getMonth() + 1) + pad(start.getDate()) + 'T' + pad(start.getHours()) + pad(start.getMinutes()) + '00';
  var stamp = now.getUTCFullYear() + pad(now.getUTCMonth() + 1) + pad(now.getUTCDate()) + 'T' + pad(now.getUTCHours()) + pad(now.getUTCMinutes()) + pad(now.getUTCSeconds()) + 'Z';
  var mins = Math.max(5, opts.minutes);
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Spinnin-Up//ZH', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
    'UID:' + (opts.uid || (now.getTime() + '-' + Math.random().toString(36).slice(2))) + '@spinnin-up',
    'DTSTAMP:' + stamp, 'DTSTART:' + local, 'DURATION:PT' + mins + 'M',
    'RRULE:FREQ=DAILY;INTERVAL=' + opts.every + ';COUNT=' + opts.count,
    'SUMMARY:' + icsEscape('Spinnin-Up 訓練（約 ' + mins + ' 分鐘）'),
    'DESCRIPTION:' + icsEscape('點連結開始這組訓練：\n' + opts.url + '\n\n動作：' + opts.names.join('、')),
    'URL:' + opts.url, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n') + '\r\n';
}
