// 區域狀態 × 今天意圖的純函式；沒有 DOM、沒有帳號或儲存。
// 「緊／疲勞」可做溫和活動；「疼痛／明確不要碰」不可被「想放鬆」覆蓋。
import { canDo, totalSec } from './workout-engine.js';

export const CONDITIONS = {
  tight: '緊繃／僵硬',
  tired: '疲勞',
  sore: '運動後肌肉痠',
  stiff: '活動起來卡卡',
  pain: '明確疼痛',
  unsure: '說不上來'
};
export const REGION_INTENTS = {
  avoid: '今天完全不要碰',
  gentle: '可以輕輕活動',
  relax: '想放鬆這裡',
  mobility: '想增加活動度',
  normal: '可以練，但輕一點'
};

export function normalizeNeeds(needs = {}, legacySore = []) {
  const clean = {};
  for (const [region, raw] of Object.entries(needs || {})) {
    if (!raw || !CONDITIONS[raw.condition] || !REGION_INTENTS[raw.intent]) continue;
    clean[region] = { condition: raw.condition, intent: raw.intent };
  }
  for (const region of legacySore || []) {
    if (!clean[region]) clean[region] = { condition: 'unsure', intent: 'avoid' };
  }
  return clean;
}

export function regionPolicy(need) {
  if (!need) return 'normal';
  if (need.intent === 'avoid' || need.condition === 'pain' || need.condition === 'unsure') return 'avoid';
  if (['relax','mobility','gentle'].includes(need.intent)) return 'target_gentle';
  return 'deload';
}

// 直接訓練 / 溫和活動都共用這個判斷；已有單一動作疼痛停止回報仍由 P.adj 處理。
export function blockedRegions(needs) {
  return Object.entries(needs).filter(([,v]) => regionPolicy(v) === 'avoid').map(([k]) => k);
}

export function gentleTargetRegions(needs) {
  return Object.entries(needs).filter(([,v]) => regionPolicy(v) === 'target_gentle').map(([k]) => k);
}

export function planRecovery(o, needs, regionAreas, allRegionLabels) {
  const areas = Object.fromEntries(Object.entries(regionAreas).map(([region, ids]) => [region, new Set(ids)]));
  const blocked = new Set(blockedRegions(needs));
  const target = gentleTargetRegions(needs);
  const pool = o.exercises.filter(ex => {
    if (ex.category !== 'mobility') return false;
    if (!canDo(ex, o.owned)) return false;
    if (o.profile.adj?.[ex.id]?.stopped) return false;
    const tags = ex.recovery_regions || [];
    if (['upper','lower','core'].includes(o.where) && ex.region !== o.where) return false;
    if (o.where === 'area' && o.focus && !ex.primary.includes(o.focus) && !ex.secondary.includes(o.focus)) return false;
    if (target.length && !tags.some(r => target.includes(r))) return false;
    if (tags.some(r => blocked.has(r))) return false;
    if (Object.entries(areas).some(([r, ids]) => blocked.has(r) && ex.primary.some(a => ids.has(a)))) return false;
    if (o.place === 'bed' && !(o.facets?.[ex.id]?.special || []).includes('bed_ok')) return false;
    return true;
  });

  const ordered = pool.map(ex => {
    const tags = ex.recovery_regions || [];
    let priority = target.some(r => tags.includes(r)) ? 10 : 0;
    if (o.effect === 'mobility' && ex.pattern === 'mobility') priority += 2;
    if (o.where === 'upper' && ex.region === 'upper') priority += 2;
    if (o.where === 'lower' && ex.region === 'lower') priority += 2;
    if (o.where === 'core' && ex.region === 'core') priority += 2;
    return { ex, priority };
  }).sort((a,b) => b.priority - a.priority || a.ex.id.localeCompare(b.ex.id));
  const extra = o.strict ? 0 : Math.max(1,Math.round(o.minutes*.15));
  const budget = (o.minutes + extra)*60;
  const items=[], why={}, reasons=[], used=[];
  for (const {ex} of ordered) {
    const candidate = { id:ex.id, dose:ex.dose.default, sets:1, rest:0 };
    if (totalSec([...items,candidate],o.exById) > budget) continue;
    items.push(candidate);
    const targetTags = (ex.recovery_regions||[]).filter(r => target.includes(r));
    why[ex.id] = targetTags.length
      ? '你提到「' + targetTags.map(r => allRegionLabels[r] || r).join('、') + '」想溫和活動，這個動作以低強度活動為主；如果會痛就停止。'
      : '溫和活動，依自己的舒服範圍緩慢進行；如果會痛就停止。';
  }
  for(const [region,need] of Object.entries(needs)) {
    const title=allRegionLabels[region]||region;
    const policy=regionPolicy(need);
    if(policy==='avoid') {
      reasons.push('「'+title+'」已避開直接活動'+(need.condition==='pain'?'（因為你選了明確疼痛）':'')+'。');
    } else if(policy==='target_gentle') {
      const matched=items.some(it => (o.exById[it.id].recovery_regions||[]).includes(region));
      reasons.push('「'+title+'」想溫和活動：'+(matched?'這次有對應動作。':'目前沒有符合條件的正式動作，沒有用肌力訓練硬湊。'));
    } else reasons.push('「'+title+'」選擇輕量活動：這次先以低負荷安排。');
  }
  if (Object.keys(needs).length) used.push('今天各部位的狀態與意圖');
  reasons.push('這次是溫和活動模式，不把一般肌力訓練降級冒充放鬆。所有動作在舒服範圍內完成；出現疼痛就停止。');
  if (!items.length) reasons.push('目前沒有符合這些條件的正式溫和動作；不會自動改排肌力訓練。');
  return {items,why,reasons,used};
}
