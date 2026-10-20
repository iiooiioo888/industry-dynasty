import type { WorldEvent, WorldEventKind } from './types.js';

/**
 * 新聞事件 · news events
 *
 * 原型《創業王》有 60 條新聞樣板（`news.csv`），用 `%s` 代換城市或商品名。
 * 本專案先前只有 3 條硬寫的事件，用 `day % 9` 的桶子決定，一天最多一個。
 *
 * 這裡改成**資料驅動**：一張樣板表 + 加權抽選，產生的事件仍然是
 * **完全決定性的**（只看日期），因為整個平衡量測都靠可重現的模擬 ——
 * 用亂數會讓 `reports/*.test.ts` 的數字每次跑都不一樣。
 *
 * 想加事件只要往 `NEWS_TEMPLATES` 加一筆，不必改邏輯。
 */
export interface NewsTemplate {
  readonly id: string;
  readonly kind: WorldEventKind;
  /** 標題樣板；`{city}` 會換成城市名 */
  readonly headline: string;
  readonly magnitude: number;
  readonly days: number;
  /** 加權抽選的權重，越大越常見 */
  readonly weight: number;
  /** 需要指定城市（事件只影響該城市） */
  readonly needsCity?: boolean;
}

/**
 * 事件樣板表。
 *
 * 三種效果對應三個乘數（見 `freightMultiplier` / `rawPortMultiplier` 與
 * 城市需求加成）：
 * - `freight-up`：運費上漲，壓縮外銷利潤
 * - `city-demand-up`：某城市需求上升，零售更好賺
 * - `port-raw-down`：港埠原料跌價，加工更划算
 */
export const NEWS_TEMPLATES: readonly NewsTemplate[] = [
  {
    id: 'typhoon-port',
    kind: 'freight-up',
    headline: '颱風逼近港口，船班延誤，運費應聲上漲。',
    magnitude: 1.25,
    days: 2,
    weight: 10,
  },
  {
    id: 'fuel-surge',
    kind: 'freight-up',
    headline: '燃油價格飆升，貨運業者全面調漲運費。',
    magnitude: 1.18,
    days: 3,
    weight: 8,
  },
  {
    id: 'driver-shortage',
    kind: 'freight-up',
    headline: '貨運司機嚴重短缺，各地出貨排隊等車。',
    magnitude: 1.32,
    days: 2,
    weight: 5,
  },
  {
    id: 'roadwork',
    kind: 'freight-up',
    headline: '主要幹道施工封閉，繞路讓運輸成本上升。',
    magnitude: 1.12,
    days: 3,
    weight: 7,
  },
  {
    id: 'city-festival',
    kind: 'city-demand-up',
    headline: '{city}舉辦大型節慶，民生消費明顯升溫。',
    magnitude: 0.35,
    days: 2,
    weight: 10,
    needsCity: true,
  },
  {
    id: 'city-payday',
    kind: 'city-demand-up',
    headline: '{city}發放年終獎金，零售買氣轉強。',
    magnitude: 0.28,
    days: 3,
    weight: 8,
    needsCity: true,
  },
  {
    id: 'city-new-district',
    kind: 'city-demand-up',
    headline: '{city}新社區落成，人口移入帶動消費。',
    magnitude: 0.42,
    days: 3,
    weight: 6,
    needsCity: true,
  },
  {
    id: 'city-sports',
    kind: 'city-demand-up',
    headline: '{city}主辦運動賽事，外地球迷湧入消費。',
    magnitude: 0.3,
    days: 2,
    weight: 6,
    needsCity: true,
  },
  {
    id: 'port-glut',
    kind: 'port-raw-down',
    headline: '港埠原料到貨充裕，現貨價格回落。',
    magnitude: 0.93,
    days: 2,
    weight: 10,
  },
  {
    id: 'ore-dumping',
    kind: 'port-raw-down',
    headline: '海外礦商低價倒貨，原料行情走弱。',
    magnitude: 0.88,
    days: 3,
    weight: 6,
  },
  {
    id: 'currency-strong',
    kind: 'port-raw-down',
    headline: '本地貨幣走強，進口原料變便宜了。',
    magnitude: 0.9,
    days: 3,
    weight: 5,
  },
  {
    id: 'scrap-glut',
    kind: 'port-raw-down',
    headline: '回收料大量釋出，原料買盤縮手。',
    magnitude: 0.95,
    days: 2,
    weight: 4,
  },
];

/** 同時最多幾個事件並存。太多會讓乘數疊加失控。 */
export const MAX_CONCURRENT_EVENTS = 2;

/**
 * 一天最多抽一個新事件；其餘日子沒有新聞。
 *
 * 用固定門檻而不是隨機：`rollNewsEvents` 必須對同一天永遠給出同樣結果。
 */
const ROLL_THRESHOLD = 42;

/** 由日期導出的整數雜湊（FNV-1a 變體）。決定性、無狀態。 */
function dayHash(day: number, salt: number): number {
  let hash = 0x811c9dc5 ^ (salt & 0xffffffff);
  let value = day + 1;
  for (let i = 0; i < 4; i += 1) {
    hash ^= value & 0xff;
    hash = Math.imul(hash, 0x01000193);
    value >>>= 8;
  }
  return hash >>> 0;
}

interface NewsContext {
  readonly cities: readonly { readonly id: string; readonly name: string }[];
}

/**
 * 抽當天的新聞事件。
 *
 * @param day 遊戲日（決定性來源）
 * @param context 城市列表；需要城市的樣板會從中挑一個
 * @param activeKinds 已經在生效的事件類型 —— 同類型不重複，避免乘數堆疊
 */
export function rollNewsEvents(
  day: number,
  context: NewsContext,
  activeKinds: readonly WorldEventKind[] = [],
): WorldEvent[] {
  if (dayHash(day, 0) % 100 >= ROLL_THRESHOLD) {
    return [];
  }
  const candidates = NEWS_TEMPLATES.filter(
    (template) => !activeKinds.includes(template.kind),
  ).filter((template) => !template.needsCity || context.cities.length > 0);
  if (candidates.length === 0) {
    return [];
  }

  const totalWeight = candidates.reduce((sum, template) => sum + template.weight, 0);
  let ticket = totalWeight === 0 ? 0 : dayHash(day, 7) % totalWeight;
  let picked = candidates[candidates.length - 1]!;
  for (const template of candidates) {
    if (ticket < template.weight) {
      picked = template;
      break;
    }
    ticket -= template.weight;
  }

  const city = picked.needsCity
    ? context.cities[dayHash(day, 13) % context.cities.length]
    : undefined;
  const headline = picked.headline.replace('{city}', city?.name ?? '本市');
  const event: WorldEvent = {
    id: `evt-${picked.id}-${day}`,
    kind: picked.kind,
    headline,
    remainingDays: picked.days,
    magnitude: picked.magnitude,
    ...(city ? { cityId: city.id, cityName: city.name } : {}),
  };
  return [event];
}

/** 同類型事件的效果乘積（多個事件疊加時不會只取第一個）。 */
export function combineMultiplier(
  events: readonly WorldEvent[],
  kind: WorldEventKind,
  fallback = 1,
): number {
  const matching = events.filter((event) => event.kind === kind);
  if (matching.length === 0) {
    return fallback;
  }
  return matching.reduce((product, event) => product * event.magnitude, 1);
}
