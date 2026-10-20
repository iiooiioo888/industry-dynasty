import { describe, expect, it } from 'vitest';
import {
  expireEvent,
  isAftermathEvent,
  MAX_CONCURRENT_EVENTS,
  NEWS_TEMPLATES,
  combineMultiplier,
  rollNewsEvents,
} from './news.js';
import type { WorldEvent } from './types.js';

const CITIES = [
  { id: 'c1', name: '海港市' },
  { id: 'c2', name: '山城' },
  { id: 'c3', name: '舊都' },
];

/**
 * 新聞事件系統。
 *
 * 原型《創業王》有 60 條新聞樣板（`news.csv`），用 `%s` 代換城市或商品名。
 * 本專案先前只有 3 條硬寫、用 `day % 9` 的桶子決定。
 *
 * **決定性是硬需求**：整個平衡量測（`reports/*.test.ts`）都靠可重現的模擬，
 * 事件若用 `Math.random()`，同一份程式每次跑出來的淨利都不一樣，
 * 那些護欄就失去意義。
 */
describe('新聞事件系統', () => {
  it('同一天永遠抽出同一個事件（決定性）', () => {
    for (const day of [0, 1, 2, 7, 30, 199]) {
      const a = rollNewsEvents(day, { cities: CITIES });
      const b = rollNewsEvents(day, { cities: CITIES });
      expect(a.map((e) => e.id)).toEqual(b.map((e) => e.id));
      expect(a.map((e) => e.magnitude)).toEqual(b.map((e) => e.magnitude));
    }
  });

  it('不同日期會抽到不同事件（不是每天一樣）', () => {
    const ids = new Set<string>();
    for (let day = 0; day < 60; day += 1) {
      for (const event of rollNewsEvents(day, { cities: CITIES })) {
        ids.add(event.kind);
      }
    }
    // 三種效果都應該出現過，否則樣板表等於沒用
    expect(ids.size).toBeGreaterThanOrEqual(3);
  });

  it('同類型不重複抽 —— 避免乘數疊加失控', () => {
    for (let day = 0; day < 40; day += 1) {
      const first = rollNewsEvents(day, { cities: CITIES });
      if (first.length === 0) {
        continue;
      }
      const kind = first[0]!.kind;
      const second = rollNewsEvents(day, { cities: CITIES }, [kind]);
      expect(second.every((event) => event.kind !== kind)).toBe(true);
    }
  });

  it('每次最多一個新事件', () => {
    for (let day = 0; day < 60; day += 1) {
      expect(rollNewsEvents(day, { cities: CITIES }).length).toBeLessThanOrEqual(1);
    }
  });

  it('需要城市的樣板會帶入城市名，且真的有代換', () => {
    let checked = 0;
    for (let day = 0; day < 200; day += 1) {
      for (const event of rollNewsEvents(day, { cities: CITIES })) {
        expect(event.headline).not.toContain('{city}');
        if (event.kind === 'city-demand-up') {
          expect(event.cityName).toBeTruthy();
          expect(CITIES.some((city) => event.headline.includes(city.name))).toBe(true);
          checked += 1;
        }
      }
    }
    expect(checked, '應該至少抽到一次城市需求事件').toBeGreaterThan(0);
  });

  it('沒有城市時不會抽到需要城市的事件', () => {
    for (let day = 0; day < 100; day += 1) {
      for (const event of rollNewsEvents(day, { cities: [] })) {
        expect(event.kind).not.toBe('city-demand-up');
      }
    }
  });

  it('同時最大數量有上限', () => {
    expect(MAX_CONCURRENT_EVENTS).toBeLessThanOrEqual(3);
    expect(MAX_CONCURRENT_EVENTS).toBeGreaterThanOrEqual(1);
  });

  it('多個同類事件取乘積，不是只認第一個', () => {
    const events: WorldEvent[] = [
      { id: 'a', kind: 'freight-up', headline: '', remainingDays: 2, magnitude: 1.25 },
      { id: 'b', kind: 'freight-up', headline: '', remainingDays: 1, magnitude: 1.2 },
      { id: 'c', kind: 'port-raw-down', headline: '', remainingDays: 2, magnitude: 0.9 },
    ];
    expect(combineMultiplier(events, 'freight-up')).toBeCloseTo(1.25 * 1.2, 10);
    expect(combineMultiplier(events, 'port-raw-down')).toBeCloseTo(0.9, 10);
    // 沒有對應事件時回傳 1（乘數中性）
    expect(combineMultiplier(events, 'city-demand-up')).toBe(1);
    expect(combineMultiplier([], 'freight-up')).toBe(1);
  });

  it('樣板表本身的資料健全', () => {
    expect(NEWS_TEMPLATES.length).toBeGreaterThanOrEqual(8);
    const ids = new Set(NEWS_TEMPLATES.map((t) => t.id));
    expect(ids.size, '樣板 id 不可重複').toBe(NEWS_TEMPLATES.length);
    for (const template of NEWS_TEMPLATES) {
      expect(template.days, `${template.id} 天數應為正`).toBeGreaterThan(0);
      expect(template.weight, `${template.id} 權重應為正`).toBeGreaterThan(0);
      expect(template.headline.length, `${template.id} 標題不可為空`).toBeGreaterThan(0);
      if (template.kind === 'freight-up') {
        expect(template.magnitude, `${template.id} 運費上漲應大於 1`).toBeGreaterThan(1);
      }
      if (template.kind === 'port-raw-down') {
        expect(template.magnitude, `${template.id} 原料跌價應小於 1`).toBeLessThan(1);
        expect(template.magnitude).toBeGreaterThan(0);
      }
      if (template.needsCity) {
        expect(template.headline, `${template.id} 需要城市就該有代換點`).toContain('{city}');
      }
    }
  });
});

describe('事件餘波', () => {
  const base = {
    id: 'evt-typhoon-port-5',
    kind: 'freight-up' as const,
    headline: '颱風逼近港口，船班延誤，運費應聲上漲。',
    remainingDays: 1,
    magnitude: 1.25,
  };

  it('有餘波的樣板到期會留下較弱的後續事件', () => {
    const next = expireEvent(base, []);
    expect(next).not.toBeNull();
    expect(next!.magnitude).toBeLessThan(base.magnitude);
    expect(next!.magnitude).toBeGreaterThan(1);
    expect(next!.remainingDays).toBeGreaterThan(0);
    expect(next!.kind).toBe(base.kind);
    expect(next!.headline).not.toBe(base.headline);
  });

  it('餘波事件 id 有前綴，且不會再產生餘波', () => {
    const first = expireEvent(base, [])!;
    expect(isAftermathEvent(first)).toBe(true);
    expect(expireEvent(first, [])).toBeNull();
  });

  it('沒有餘波的樣板到期就直接消失', () => {
    const plain = { ...base, id: 'evt-city-payday-3' };
    const template = NEWS_TEMPLATES.find((t) => t.id === 'city-payday');
    // 這個樣板如果日後加了餘波，這條測試就該改成跟著調整
    if (template && !template.aftermath) {
      expect(expireEvent(plain, [])).toBeNull();
    }
  });

  it('同類型事件已在跑時不再產生餘波（避免乘數堆疊）', () => {
    expect(expireEvent(base, ['freight-up'])).toBeNull();
  });

  it('城市事件的城市會被保留（不會變成全市場事件）', () => {
    const cityEvent = {
      ...base,
      id: 'evt-city-festival-7',
      kind: 'city-demand-up' as const,
      cityId: 'xiwan',
      cityName: '西灣市',
    };
    const next = expireEvent(cityEvent, []);
    expect(next?.cityId).toBe('xiwan');
    expect(next?.cityName).toBe('西灣市');
    // 標題裡的 {city} 會被換掉
    expect(next?.headline).not.toContain('{city}');
    expect(next?.headline).toContain('西灣市');
  });

  it('餘波仍然吃 combineMultiplier（疊加時取乘積）', () => {
    const aft = expireEvent(base, [])!;
    const product = combineMultiplier([aft], 'freight-up');
    expect(product).toBeCloseTo(aft.magnitude, 10);
  });

  it('餘波比原事件弱（往中性靠，不是往極端走）', () => {
    // magnitude 的語意隨類型不同：
    // - freight-up / port-raw-down 是**乘數**（中性 = 1）
    // - city-demand-up 是**加成**（中性 = 0）
    const neutral = (kind: string): number => (kind === 'city-demand-up' ? 0 : 1);
    const distance = (kind: string, value: number): number => Math.abs(value - neutral(kind));

    for (const template of NEWS_TEMPLATES) {
      if (!template.aftermath) {
        continue;
      }
      const before = distance(template.kind, template.magnitude);
      const after = distance(template.kind, template.aftermath.magnitude);
      expect(
        after,
        `${template.id} 的餘波應該比原事件弱（${template.magnitude} → ${template.aftermath.magnitude}）`,
      ).toBeLessThan(before);
      expect(template.aftermath.magnitude).toBeGreaterThan(0);
      expect(template.aftermath.days).toBeGreaterThan(0);
    }
  });

  it('至少有一半的運費事件有餘波（實質效果不是只有一條）', () => {
    const freight = NEWS_TEMPLATES.filter((t) => t.kind === 'freight-up');
    const withAftermath = freight.filter((t) => t.aftermath);
    expect(withAftermath.length).toBeGreaterThan(0);
    expect(withAftermath.length * 2).toBeGreaterThanOrEqual(freight.length);
  });
});
