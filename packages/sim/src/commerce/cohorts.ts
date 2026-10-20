import type { ItemId } from '../production/items.js';

/**
 * 城市人口分級需求 · cohort demand
 *
 * 原型《創業王》的關卡用「人口結構」描述市場（`Stages.csv` 的
 * 「人口總數 6170（居住 1440、活動 2650、學生 2080）」），
 * 產品也各自有不同人口層的需求權重。
 *
 * 本專案原本的零售量只看**地塊本身的條件**（`quoteLocalDemand` 的週量、
 * 道路可及性、城市臨近度），**完全沒看商品種類** ——
 * 於是「在哪個城市賣什麼」沒有差別，貨架放什麼都一樣。
 *
 * 這裡補上這一層：
 * 1. 每座城市有一組人口結構（居住／活動／學生），由城市名**決定性**推導。
 * 2. 每個消費品對不同人口層有不同的吸引力。
 * 3. 某城某商品的需求係數 = Σ(人口佔比 × 該層對該商品的偏好)，
 *    並**正規化成消費品平均為 1**，所以整體市場規模不變，
 *    變的只是「賣對地方、賣對東西」的報酬。
 */
export type CohortId = 'resident' | 'activity' | 'student';

export const COHORT_IDS: readonly CohortId[] = ['resident', 'activity', 'student'];

export const COHORT_LABEL: Record<CohortId, string> = {
  resident: '居住人口',
  activity: '活動人口',
  student: '學生人口',
};

/** 各人口層的佔比，總和為 1。 */
export type CohortMix = Readonly<Record<CohortId, number>>;

/** 每個消費品對各人口層的偏好（1 = 中性）。 */
export const ITEM_COHORT_BIAS: Readonly<Record<string, Readonly<Record<CohortId, number>>>> = {
  // 手工具：居住與活動人口都在用，學生較少
  'hand-tool': { resident: 1.15, activity: 1.1, student: 0.6 },
  // 電線束：偏工地與活動人口
  'wire-bundle': { resident: 0.85, activity: 1.35, student: 0.7 },
  // 組合模組：偏學生與年輕居住人口
  'pack-module': { resident: 1.0, activity: 0.85, student: 1.45 },
};

/** 未列出的商品視為中性。 */
const NEUTRAL_BIAS: Readonly<Record<CohortId, number>> = {
  resident: 1,
  activity: 1,
  student: 1,
};

/**
 * 把每個商品的偏好向量正規化成「三層平均 = 1」。
 *
 * 目的：讓「加了人口分級」不會順手把整個市場放大或縮小，
 * 只留下**相對**差異（同城之內，賣對商品比賣錯商品好）。
 * 中性商品（三層都是 1）的係數恰為 1；消費品的平均係數
 * 實測落在 1 附近（誤差在數個百分比內，見 `cohorts.test.ts` 的容差斷言）。
 */
const NORMALIZED_BIAS: Readonly<Record<string, Readonly<Record<CohortId, number>>>> =
  Object.fromEntries(
    Object.entries(ITEM_COHORT_BIAS).map(([itemId, bias]) => {
      const mean = COHORT_IDS.reduce((sum, cohort) => sum + bias[cohort], 0) / COHORT_IDS.length;
      const normalized: Record<CohortId, number> = {
        resident: bias.resident / mean,
        activity: bias.activity / mean,
        student: bias.student / mean,
      };
      return [itemId, normalized];
    }),
  );

/** 字串 → 32 位元雜湊（FNV-1a）。決定性、無狀態。 */
function hashText(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * 由城市名推導人口結構。
 *
 * 三個佔比都落在 0.2～0.5 之間，避免某座城市完全沒有某種人口
 * （那會讓部分商品在該城永遠賣不動）。
 */
export function cityCohorts(cityName: string): CohortMix {
  const spread = (salt: number): number => {
    const value = hashText(`${cityName}#${salt}`) % 1000;
    return 0.2 + (value / 1000) * 0.3;
  };
  const raw: Record<CohortId, number> = {
    resident: spread(1),
    activity: spread(2),
    student: spread(3),
  };
  const total = raw.resident + raw.activity + raw.student;
  return {
    resident: raw.resident / total,
    activity: raw.activity / total,
    student: raw.student / total,
  };
}

/** 某城市對某商品的吸引力（偏好已正規化成三層平均 1）。 */
function rawAttraction(cityName: string, itemId: ItemId): number {
  const mix = cityCohorts(cityName);
  const bias = NORMALIZED_BIAS[itemId] ?? NEUTRAL_BIAS;
  return COHORT_IDS.reduce((sum, cohort) => sum + mix[cohort] * bias[cohort], 0);
}

/**
 * 需求係數：1 = 中性。
 *
 * 因為偏好向量已正規化成平均 1，這個值本身就是最終係數 ——
 * 中性商品恰為 1，而同一座城市裡「賣對商品」的係數會高於「賣錯商品」。
 */
export function itemCityDemandFactor(cityName: string, itemId: ItemId): number {
  return rawAttraction(cityName, itemId);
}

/** 這座城市最吃哪一種消費品（供 UI 提示佈局）。 */
export function bestItemForCity(cityName: string): ItemId | null {
  const items = Object.keys(ITEM_COHORT_BIAS) as ItemId[];
  let best: { itemId: ItemId; factor: number } | null = null;
  for (const itemId of items) {
    const factor = itemCityDemandFactor(cityName, itemId);
    if (!best || factor > best.factor) {
      best = { itemId, factor };
    }
  }
  return best?.itemId ?? null;
}

/** 人口結構的偏向描述，供 UI 用一句話說明。 */
export function dominantCohort(cityName: string): CohortId {
  const mix = cityCohorts(cityName);
  let best: CohortId = 'resident';
  for (const cohort of COHORT_IDS) {
    if (mix[cohort] > mix[best]) {
      best = cohort;
    }
  }
  return best;
}
