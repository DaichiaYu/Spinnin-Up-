import test from 'node:test';
import assert from 'node:assert/strict';
import { buildICS, validateCalendarInput } from '../../src/calendar.js';

test('行事曆檔有重複規則、時間、連結', () => {
  const ics = buildICS({ start: new Date(2026, 10, 14, 8, 30), every: 2, count: 10, minutes: 11,
    url: 'https://x/#r=1;a.1.1.1;2.10', names: ['靠牆蹲', '臀橋'], now: new Date(Date.UTC(2026, 10, 13, 0, 0, 0)), uid: 'u1' });
  assert.match(ics, /DTSTART:20261114T083000\r\n/);
  assert.match(ics, /RRULE:FREQ=DAILY;INTERVAL=2;COUNT=10\r\n/);
  assert.match(ics, /DURATION:PT11M/);
  assert.match(ics, /UID:u1@spinnin-up/);
  assert.ok(ics.includes('DESCRIPTION:點連結開始這組訓練：\\nhttps://x/#r=1\\;a.1.1.1\\;2.10'), '分號要跳脫');
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
});

test('次數不合法時回報錯誤，不默默改成預設值（#1）', () => {
  for (const bad of ['0', '-1', '61', '', '2.5', 'abc']) {
    const r = validateCalendarInput({ start: '2026-11-14T08:00', every: '2', count: bad });
    assert.equal(r.ok, false, `count=${bad}`);
    assert.ok(r.errors.count);
  }
  const ok = validateCalendarInput({ start: '2026-11-14T08:00', every: '2', count: '10' });
  assert.equal(ok.ok, true);
  assert.equal(ok.value.count, 10);
  assert.equal(validateCalendarInput({ start: '', every: '2', count: '10' }).errors.start !== undefined, true);
});
