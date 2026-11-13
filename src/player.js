// 播放器的時間邏輯：現在在第幾步、還剩幾秒、暫停、跳過、從背景回來補進度。
// 不碰畫面也不出聲，發生事情時呼叫 handlers 讓畫面和聲音去處理。
// 時間一律用「這一步應該在幾點結束」來算，不用每秒減一，所以手機切到背景也不會跑掉。
//
// handlers：
//   onEnter(step, pos, fresh)  進到新的一步。fresh=false 代表是從背景回來補的，不要唸。
//   onWorkEnd(step)            一個動作做完（計時的才有，補進度時不觸發）
//   onSecond(step, sec)        剩下的秒數變了（暫停時不觸發）
//   onFinish()                 全部做完
export function createPlayer(steps, handlers) {
  var h = handlers || {};
  var S = { steps: steps, pos: -1, endAt: 0, startAt: 0, paused: false, remain: 0, lastSec: null, done: false,
    total: steps.reduce(function (a, s) { return a + s.dur; }, 0) };

  function enter(pos, startTime, now) {
    if (pos >= steps.length) { S.done = true; if (h.onFinish) h.onFinish(); return; }
    var s = steps[pos];
    S.pos = pos; S.startAt = startTime; S.endAt = startTime + s.dur * 1000; S.lastSec = null;
    if (S.paused) S.remain = s.dur * 1000;
    if (h.onEnter) h.onEnter(s, pos, now - startTime < 1500);
  }
  function current() { return steps[S.pos]; }
  function countsDown(s) { return s.kind === 'ready' || s.timed; }

  var api = {
    state: S,
    current: current,
    start: function (now) { enter(0, now, now); api.tick(now); },
    tick: function (now) {
      if (S.done || S.paused || S.pos < 0) return;
      var s = current();
      while (!S.done && countsDown(s) && now >= S.endAt) {
        if (s.kind === 'work' && now - S.endAt < 1500 && h.onWorkEnd) h.onWorkEnd(s);
        enter(S.pos + 1, S.endAt, now);
        s = current();
      }
      if (S.done || !countsDown(s)) return;
      var sec = Math.ceil(Math.max(0, S.endAt - now) / 1000);
      if (sec !== S.lastSec) { S.lastSec = sec; if (h.onSecond) h.onSecond(s, sec); }
    },
    remainingMs: function (now) { return S.paused ? S.remain : Math.max(0, S.endAt - now); },
    // 已經過的比例（0–1），給進度條用
    progress: function (now) {
      if (S.done) return 1;
      var done = 0, i, s = current();
      for (i = 0; i < S.pos; i++) done += steps[i].dur;
      if (s && countsDown(s)) done += s.dur - api.remainingMs(now) / 1000;
      return Math.min(1, S.total ? done / S.total : 0);
    },
    togglePause: function (now) {
      if (S.done) return;
      if (S.paused) { S.paused = false; S.endAt = now + S.remain; }
      else { S.paused = true; S.remain = Math.max(0, S.endAt - now); }
    },
    next: function (now) { if (!S.done) enter(S.pos + 1, now, now); },
    prev: function (now) {
      if (S.done) return;
      var s = current();
      enter(Math.max(0, s.kind === 'work' ? S.pos - 1 : S.pos - 2), now, now);
    },
    // 接下來第一個不同的動作（畫面上「之後：…」用）
    nextExercise: function () {
      var s = current(), w = s.kind === 'ready' ? s.next : s, i;
      for (i = S.pos + 1; i < steps.length; i++) if (steps[i].kind === 'work' && steps[i].idx !== w.idx) return steps[i];
      return null;
    }
  };
  return api;
}
