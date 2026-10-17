import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DISTANCE_COST,
  LEGACY_DISTANCE_COST,
  idleSaturationDistance,
  saturationDistance,
  shareOfMapBeyond,
  throughputCurve,
} from './distance-cost.js';
import { computeProductionTiming } from './logistics.js';
import { DEFAULT_WORLD_CONFIG } from '../world/config.js';
import type { Parcel } from '../types/map.js';

/** 只帶座標的假地塊；這條曲線只依賴 x+y。 */
const at = (x: number, y: number) => ({ x, y }) as Parcel;

const MAP_W = DEFAULT_WORLD_CONFIG.mapWidth;
const MAP_H = DEFAULT_WORLD_CONFIG.mapHeight;
const MAX_D = MAP_W - 1 + (MAP_H - 1);

describe('距離成本曲線 · 不得出現死區', () => {
  it('legacy clamped-linear 在出貨地圖上會飽和（記錄被修掉的行為）', () => {
    const satThroughput = saturationDistance(LEGACY_DISTANCE_COST.throughput);
    const satIdle = idleSaturationDistance(LEGACY_DISTANCE_COST.idle);

    expect(satThroughput).toBe(15);
    expect(satIdle).toBe(9);

    // 飽和之後完全同價 —— 這正是必須修掉的性質
    expect(throughputCurve(satThroughput!, LEGACY_DISTANCE_COST.throughput)).toBe(
      throughputCurve(MAX_D, LEGACY_DISTANCE_COST.throughput),
    );

    const beyond = shareOfMapBeyond(MAP_W, MAP_H, satThroughput!);
    expect(beyond.share).toBeGreaterThan(0.4);
    console.log(
      `legacy: 產出係數飽和於 d=${satThroughput}，` +
        `該區含 ${beyond.count}/${beyond.total} = ${(beyond.share * 100).toFixed(1)}% 地塊`,
    );
  });

  it('預設 soft-exponential 曲線在整張地圖上都嚴格遞減', () => {
    expect(saturationDistance(DEFAULT_DISTANCE_COST.throughput)).toBeNull();
    expect(idleSaturationDistance(DEFAULT_DISTANCE_COST.idle)).toBeNull();

    for (let d = 0; d < MAX_D; d += 1) {
      const here = computeProductionTiming(4, 1, at(d, 0), 1);
      const next = computeProductionTiming(4, 1, at(d + 1, 0), 1);
      expect(next.throughputFactor).toBeLessThan(here.throughputFactor);
      expect(next.idleLossPerTick).toBeGreaterThanOrEqual(here.idleLossPerTick);
      expect(next.cycleTicks).toBeGreaterThanOrEqual(here.cycleTicks);
    }
  });

  it('最遠角落不再與中距離同價', () => {
    const mid = computeProductionTiming(4, 1, at(7, 0), 1); // d = 7
    const far = computeProductionTiming(4, 1, at(13, 13), 1); // d = 26
    const near = computeProductionTiming(4, 1, at(0, 1), 1); // d = 1

    expect(far.throughputFactor).toBeLessThan(mid.throughputFactor);
    expect(mid.throughputFactor).toBeLessThan(near.throughputFactor);
    expect(far.throughputAtFloor).toBe(false);
    expect(near.throughputAtFloor).toBe(false);
    console.log(
      `預設曲線 tpf: d=1 ${near.throughputFactor.toFixed(4)} > ` +
        `d=7 ${mid.throughputFactor.toFixed(4)} > ` +
        `d=26 ${far.throughputFactor.toFixed(4)}`,
    );
  });

  it('兩端邊界仍然合理：d=0 無懲罰且不超過 1.0', () => {
    const zero = computeProductionTiming(4, 1, at(0, 0), 1);
    expect(zero.throughputFactor).toBe(1);
    expect(zero.idleLossPerTick).toBe(0);
    expect(zero.workerTravelTicks).toBe(0);

    for (let d = 0; d <= MAX_D; d += 1) {
      const v = throughputCurve(d, DEFAULT_DISTANCE_COST.throughput);
      expect(v).toBeGreaterThan(DEFAULT_DISTANCE_COST.throughput.floor);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('shareOfMapBeyond 與地圖尺寸一致', () => {
    const all = shareOfMapBeyond(MAP_W, MAP_H, 0);
    expect(all.count).toBe(MAP_W * MAP_H);
    expect(all.share).toBe(1);
    const none = shareOfMapBeyond(MAP_W, MAP_H, MAX_D + 1);
    expect(none.count).toBe(0);
  });
});
