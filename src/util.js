// 共用的小工具，不碰畫面。
export function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
export function pad(n) { return (n < 10 ? '0' : '') + n; }
