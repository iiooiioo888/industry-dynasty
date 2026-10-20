import { describe, expect, it } from 'vitest';
import {
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
