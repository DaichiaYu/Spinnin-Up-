// 每次訓練完成後的唯讀歷史模型。純函式，不操作畫面或儲存空間。
// 沒有後端：只能保證 App 不提供修改既有紀錄，無法防止使用者在外部編輯 CSV。
import { REGION_INTENTS } from './recovery.js';

export const POST_FEELINGS = {
  none: '目前沒有不舒服',
  eased: '感覺比較舒緩',
  lingering: '仍有緊繃或不舒服',
  worse: '比預期更不舒服',
  pain: '出現或持續疼痛'
};
export const POST_DIFFICULTY = {
  easy: '很容易',
  fine: '可以完成',
  hard: '有點困難',
  unable: '很難完成'
};
const own = (o,k) => Object.prototype.hasOwnProperty.call(o,k);
const jsonClone = value => JSON.parse(JSON.stringify(value));
export function validHistoryEntry(entry) {
  if (!entry || typeof entry !== 'object' || !/^w-[0-9]{6,}$/.test(entry.id || '')) return false;
  if (Number.isNaN(Date.parse(entry.at)) || !Number.isFinite(entry.minutes) || entry.minutes < 0 || entry.minutes > 1440) return false;
  if (!Array.isArray(entry.exercises) || !entry.plan || !entry.report) return false;
  if (!entry.intentions || typeof entry.intentions !== 'object' || Array.isArray(entry.intentions)) return false;
  for (const k of Object.keys(entry.intentions)) if (!own(REGION_INTENTS, entry.intentions[k])) return false;
  if (entry.report.overall) {
    const v=entry.report.overall;
    if ((v.feeling && !own(POST_FEELINGS,v.feeling)) || (v.difficulty && !own(POST_DIFFICULTY,v.difficulty))) return false;
  }
  const rf = entry.report.regions;
  if (!rf || typeof rf !== 'object' || Array.isArray(rf)) return false;
  for (const v of Object.values(rf)) {
    if (!v || (v.feeling && !own(POST_FEELINGS,v.feeling)) || (v.difficulty && !own(POST_DIFFICULTY,v.difficulty))) return false;
  }
  return typeof entry.report.skipped === 'boolean';
}
// 所有資料只從完成當下的快照建立，避免後來編輯課表篡改先前記錄。
export function createWorkoutEntry(profile, options) {
  const history = profile.history || [];
  const id = 'w-' + String(history.reduce((m,r) => {
    const n = Number((r.id || '').slice(2));
    return Number.isSafeInteger(n) ? Math.max(m,n) : m;
  },0) + 1).padStart(6,'0');
  const intentions = {};
  for (const [region,value] of Object.entries(options.intentions || {})) {
    if (own(REGION_INTENTS,value)) intentions[region]=value;
  }
  const regions={};
  for (const [region,answer] of Object.entries(options.regionAnswers || {})) {
    if (!answer) continue;
    const row={};
    if (own(POST_FEELINGS,answer.feeling)) row.feeling=answer.feeling;
    if (own(POST_DIFFICULTY,answer.difficulty)) row.difficulty=answer.difficulty;
    if (Object.keys(row).length) regions[region]=row;
  }
  const exerciseAnswers={};
  for (const [exId,answer] of Object.entries(options.exerciseAnswers || {})) {
    const a={};
    for (const key of ['how','howL','howR','actual','rpe','pain','areas'])
      if (answer && answer[key] !== undefined) a[key]=jsonClone(answer[key]);
    if (Object.keys(a).length) exerciseAnswers[exId]=a;
  }
  const overall = {};
  if (options.overall && own(POST_FEELINGS,options.overall.feeling)) overall.feeling=options.overall.feeling;
  if (options.overall && own(POST_DIFFICULTY,options.overall.difficulty)) overall.difficulty=options.overall.difficulty;
  const entry={
    id, at: options.at || new Date().toISOString(), minutes: Math.max(0,Number(options.minutes)||0),
    trial: !!options.trial,
    plan: jsonClone(options.plan || {}),
    intentions,
    exercises: jsonClone(options.exercises || []),
    report: { skipped: !!options.skipped, overall, regions, exercises: exerciseAnswers }
  };
  if (!validHistoryEntry(entry)) throw new Error('invalid workout history entry');
  return entry;
}
export function appendWorkoutEntry(profile, entry) {
  if (!validHistoryEntry(entry)) throw new Error('invalid workout entry');
  if (!Array.isArray(profile.history)) profile.history=[];
  if (profile.history.some(x=>x.id===entry.id)) throw new Error('duplicate workout record');
  profile.history=profile.history.concat([jsonClone(entry)]);
  return profile.history.length;
}
