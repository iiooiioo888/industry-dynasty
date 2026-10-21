import { describe, expect, it } from 'vitest';
import {
  QUALITY_BAND_2_SUITABILITY,
  QUALITY_CYCLE_STRETCH_BY_BAND,
  QUALITY_PRICE_MUL_BY_BAND,
  advanceQualityBand,
  parcelSuitability,
  parcelSupportsTopQuality,
  qualityCycleStretch,
  qualityPriceMultiplier,
} from './quality.js';

/**
 * 產品品質分級。
 *
 * 原型《創業王》的產品有「品質／速度適合的土壤與水質」，也就是
 * **地點決定品質上限**。本專案原本只有 0/1 兩檔且是全球值 ——
 * 研發完成就升到 1，蓋在哪裡毫無影響。
 *
 * 這裡補上第 2 檔，並讓它受地塊條件限制。
 */
describe('產品品質分級', () => {
  it('土壤與水質由座標決定性推導', () => {
    for (const [x, y] of [
      [0, 0],
      [3, 7],
      [15, 11],
    ] as const) {
      const a = parcelSuitability({ x, y });
      const b = parcelSuitability({ x, y });
      expect(a).toEqual(b);
      expect(a.soil).toBeGreaterThanOrEqual(0);
      expect(a.soil).toBeLessThanOrEqual(1);
      expect(a.water).toBeGreaterThanOrEqual(0);
      expect(a.water).toBeLessThanOrEqual(1);
      expect(a.overall).toBeCloseTo((a.soil + a.water) / 2, 10);
    }
  });

  it('不同座標的適合度不同（地點有意義）', () => {
    const values = new Set<number>();
    for (let x = 0; x < 8; x += 1) {
      for (let y = 0; y < 8; y += 1) {
        values.add(Number(parcelSuitability({ x, y }).overall.toFixed(4)));
      }
    }
    expect(values.size).toBeGreaterThan(10);
  });

  it('售價倍率隨檔位遞增', () => {
    expect(qualityPriceMultiplier(0)).toBe(1);
    expect(qualityPriceMultiplier(1)).toBeGreaterThan(qualityPriceMultiplier(0));
    expect(qualityPriceMultiplier(2)).toBeGreaterThan(qualityPriceMultiplier(1));
  });

  it('週期拉伸隨檔位遞增（品質越高做得越慢）', () => {
    expect(qualityCycleStretch(0)).toBe(1);
    expect(qualityCycleStretch(1)).toBeGreaterThan(1);
    expect(qualityCycleStretch(2)).toBeGreaterThan(qualityCycleStretch(1));
    expect(QUALITY_CYCLE_STRETCH_BY_BAND[2]).toBeGreaterThan(QUALITY_CYCLE_STRETCH_BY_BAND[1]!);
  });

  it('未研發時停在 0，不論地點多好', () => {
    expect(advanceQualityBand({ current: 0, researched: false, bestSuitability: 1 })).toBe(0);
  });

  it('研發完成但地點不佳 → 只到第 1 檔', () => {
    expect(
      advanceQualityBand({
        current: 0,
        researched: true,
        bestSuitability: QUALITY_BAND_2_SUITABILITY - 0.01,
      }),
    ).toBe(1);
  });

  it('研發完成且地點夠好 → 到第 2 檔', () => {
    expect(
      advanceQualityBand({
        current: 0,
        researched: true,
        bestSuitability: QUALITY_BAND_2_SUITABILITY + 0.05,
      }),
    ).toBe(2);
  });

  it('品質只升不降（換地不會退步）', () => {
    expect(advanceQualityBand({ current: 2, researched: true, bestSuitability: 0 })).toBe(2);
    expect(advanceQualityBand({ current: 2, researched: false, bestSuitability: 0 })).toBe(2);
  });

  it('parcelSupportsTopQuality 與門檻一致', () => {
    let supported = 0;
    for (let x = 0; x < 10; x += 1) {
      for (let y = 0; y < 10; y += 1) {
        const parcel = { x, y };
        const expected = parcelSuitability(parcel).overall >= QUALITY_BAND_2_SUITABILITY;
        expect(parcelSupportsTopQuality(parcel)).toBe(expected);
        if (expected) {
          supported += 1;
        }
      }
    }
    // 門檻 0.7 應該只讓少數地塊達標，否則「挑地點」就沒有意義
    expect(supported).toBeGreaterThan(0);
    expect(supported).toBeLessThan(100);
  });

  it('倍率表涵蓋三個檔位', () => {
    for (const band of [0, 1, 2] as const) {
      expect(QUALITY_PRICE_MUL_BY_BAND[band]).toBeGreaterThanOrEqual(1);
      expect(QUALITY_CYCLE_STRETCH_BY_BAND[band]).toBeGreaterThanOrEqual(1);
    }
  });
});
