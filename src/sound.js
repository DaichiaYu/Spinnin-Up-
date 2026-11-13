// 聲音：播報模式、音量、提示音、語音。設定記在這台裝置的瀏覽器裡（不是身體資料）。
export const SOUND_KEY = 'spinnin-up.sound';
export const SOUND_MODES = {
  voice: { name: '語音＋提示音', short: '語音', desc: '唸出動作名稱和提示。說話時，影片的聲音會暫時變小。' },
  beep: { name: '只有提示音', short: '只有提示音', desc: '不說話，只有嗶聲。適合邊看影片邊做，提示文字會在畫面上變色。' },
  off: { name: '全部靜音', short: '靜音', desc: '沒有任何聲音，只看畫面。' }
};

export const settings = load();
var audio = null;

function load() {
  var d = { mode: 'voice', voiceVol: 0.8, beepVol: 0.6 };
  try {
    var v = JSON.parse(localStorage.getItem(SOUND_KEY) || 'null');
    if (v && SOUND_MODES[v.mode]) d.mode = v.mode;
    if (v && v.voiceVol >= 0 && v.voiceVol <= 1) d.voiceVol = v.voiceVol;
    if (v && v.beepVol >= 0 && v.beepVol <= 1) d.beepVol = v.beepVol;
  } catch (e) { /* 存不了就用預設 */ }
  return d;
}
export function save() {
  try { localStorage.setItem(SOUND_KEY, JSON.stringify(settings)); } catch (e) { /* 存不了也能用 */ }
}

// 要在使用者按下按鈕時呼叫（手機規定要使用者先操作，才能出聲）。
export function ensureAudio() {
  try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); audio.resume(); } catch (e) { audio = null; }
  applyAudioSession();
}
// 支援的瀏覽器（較新的 iPhone Safari）上，「只有提示音」時讓嗶聲和影片混在一起播，不壓低影片。
export function applyAudioSession() {
  try {
    if (navigator.audioSession) navigator.audioSession.type = settings.mode === 'beep' ? 'ambient' : 'auto';
  } catch (e) { /* 不支援就算了 */ }
}

export function beep(freq, ms, delay, force) {
  if (!audio || (!force && settings.mode === 'off') || settings.beepVol <= 0) return;
  try {
    var t = audio.currentTime + (delay || 0) / 1000;
    var o = audio.createOscillator(), g = audio.createGain();
    o.frequency.value = freq; o.connect(g); g.connect(audio.destination);
    g.gain.setValueAtTime(0.0001, audio.currentTime);
    g.gain.setValueAtTime(0.5 * settings.beepVol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
    o.start(t); o.stop(t + ms / 1000 + 0.02);
  } catch (e) { /* 沒有聲音也能繼續 */ }
}

// 提示音的意思：倒數＝短嗶、開始＝高長音、這組結束＝低長音、換邊＝兩聲、全部完成＝上升兩聲
export const SFX = {
  count: function (work) { beep(work ? 660 : 440, 120); },
  start: function () { beep(880, 380); },
  end: function () { beep(520, 520); },
  side: function () { beep(740, 140); beep(740, 140, 220); },
  finish: function () { beep(880, 200); beep(1100, 420, 230); }
};

// 說話。只有語音模式（或 force）才會出聲。onEnd 在唸完時呼叫。
export function speak(text, onEnd, force) {
  if ((!force && settings.mode !== 'voice') || settings.voiceVol <= 0 || !('speechSynthesis' in window)) return false;
  try {
    speechSynthesis.cancel();
    var u = new SpeechSynthesisUtterance(text);
    u.lang = 'zh-TW'; u.rate = 1; u.volume = settings.voiceVol;
    if (onEnd) u.onend = onEnd;
    speechSynthesis.speak(u);
    return true;
  } catch (e) { return false; }
}
export function hush() { if ('speechSynthesis' in window) speechSynthesis.cancel(); }
