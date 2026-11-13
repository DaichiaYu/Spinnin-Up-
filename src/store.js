// 這次打開頁面期間的狀態。都只在記憶體裡，關掉頁面就沒了（身體資料要靠下載檔案保存）。
import { emptyProfile } from './profile.js';

export const db = { ex: {}, list: [], areas: {}, equip: [] };
export const state = {
  items: [],                 // [{id, dose, sets, rest, sideDose?}]
  freq: { every: 2, count: 10 },
  owned: new Set()           // 手邊有的器材 id
};
export const session = {
  profile: emptyProfile(),
  dirty: false,              // 有還沒下載的變更
  why: {},                   // 自動排的課表：每個動作為什麼排進來
  reasons: [],               // 自動排的課表：整體的理由
  trial: null,               // 正在試做時，暫存原本的課表
  today: { minutes: 15, strict: false, goal: 'strength', focus: '' }
};
