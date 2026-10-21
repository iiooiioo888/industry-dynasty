import { describe, expect, it } from 'vitest';
import {
  COHORT_IDS,
  ITEM_COHORT_BIAS,
  bestItemForCity,
  cityCohorts,
  dominantCohort,
  itemCityDemandFactor,
} from './cohorts.js';
import type { ItemId } from '../production/items.js';

const CONSUMER_ITEMS = Object.keys(ITEM_COHORT_BIAS) as ItemId[];

/**
 * 城市人口分級需求。
 *
 * 原型《創業王》用「人口結構」描述市場（`Stages.csv`：
 * 「居住 1440、活動 2650、學生 2080」），產品也各有不同人口層的需求權重。
 *
 * 這裡要守住兩個性質：
 * 1. **決定性** —— 同一個城市名永遠得到同一組人口結構（模擬必須可重現）。
 * 2. **正規化** —— 消費品的需求係數平均為 1，所以加了這個系統不會
 *    順手把整個市場放大或縮小，只是讓「賣對地方、賣對東西」有回報。
 */
describe('城市人口分級需求', () => {
  it('同一座城市永遠得到同一組人口結構', () => {
    for (const name of ['西灣市', '臨港市', '南站市']) {
      const a = cityCohorts(name);
      const b = cityCohorts(name);
      expect(a).toEqual(b);
    }
  });

  it('人口佔比總和為 1，且沒有哪一層消失', () => {
    for (const name of ['西灣市', '臨港市', '南站市', '測試城', 'A', 'B', 'C']) {
      const mix = cityCohorts(name);
      const total = COHORT_IDS.reduce((sum, cohort) => sum + mix[cohort], 0);
      expect(total).toBeCloseTo(1, 10);
      for (const cohort of COHORT_IDS) {
        expect(mix[cohort], `${name} 的 ${cohort} 佔比過低`).toBeGreaterThan(0.1);
      }
    }
  });

  it('不同城市的人口結構不同（不是每座城都一樣）', () => {
    const signatures = new Set(
      ['西灣市', '臨港市', '南站市'].map((name) => {
        const mix = cityCohorts(name);
        return COHORT_IDS.map((cohort) => mix[cohort].toFixed(3)).join('|');
      }),
    );
    expect(signatures.size).toBeGreaterThan(1);
  });

  it('需求係數為正，且消費品平均接近 1（市場規模大致不變）', () => {
    for (const name of ['西灣市', '臨港市', '南站市', '測試城']) {
      const factors = CONSUMER_ITEMS.map((itemId) => itemCityDemandFactor(name, itemId));
      for (const factor of factors) {
        expect(factor).toBeGreaterThan(0);
        expect(Number.isFinite(factor)).toBe(true);
      }
      const mean = factors.reduce((sum, value) => sum + value, 0) / factors.length;
      // 加入這套系統不該把整個市場明顯放大或縮小；
      // 這裡允許 5% 的容差 —— 重點是**相對**差異，不是整體規模。
      expect(Math.abs(mean - 1), `${name} 的平均係數偏離 1 太多`).toBeLessThan(0.05);
    }
  });

  it('同一座城市裡，賣對商品比賣錯商品好', () => {
    let compared = 0;
    for (const name of ['西灣市', '臨港市', '南站市', '測試城']) {
      const factors = CONSUMER_ITEMS.map((itemId) => ({
        itemId,
        factor: itemCityDemandFactor(name, itemId),
      })).sort((a, b) => b.factor - a.factor);
      const best = factors[0]!;
      const worst = factors[factors.length - 1]!;
      expect(best.factor, `${name} 最佳商品應高於最差商品`).toBeGreaterThan(worst.factor);
      compared += 1;
    }
    expect(compared).toBeGreaterThan(0);
  });

  it('未列在偏好表裡的商品視為中性', () => {
    const factor = itemCityDemandFactor('西灣市', 'raw-ore' as ItemId);
    expect(factor).toBeCloseTo(1, 6);
  });

  it('bestItemForCity 與 dominantCohort 都给得出結果', () => {
    for (const name of ['西灣市', '臨港市', '南站市']) {
      expect(CONSUMER_ITEMS).toContain(bestItemForCity(name));
      expect(COHORT_IDS).toContain(dominantCohort(name));
    }
  });

  it('偏好表本身健全：每個消費品對三層都有權重', () => {
    expect(CONSUMER_ITEMS.length).toBeGreaterThanOrEqual(3);
    for (const itemId of CONSUMER_ITEMS) {
      const bias = ITEM_COHORT_BIAS[itemId]!;
      for (const cohort of COHORT_IDS) {
        expect(bias[cohort], `${itemId} 缺少 ${cohort}`).toBeGreaterThan(0);
      }
    }
  });
});
