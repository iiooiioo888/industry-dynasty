import { describe, expect, it } from 'vitest';
import { computeProductionTiming } from '../production/logistics.js';
import { RECIPES } from '../production/recipes.js';
import { ITEMS } from '../production/items.js';
import { FACTORY_TYPES } from '../buildings/catalog.js';
import { BALANCE, dailyHoldingCostPerFactory } from '../balance/targets.js';
import { parcelIdFromCoords, type Parcel } from '../types/map.js';
import { generateParcelResource } from '../world/parcel-resources.js';
import { runFullLoop } from './full-loop.js';

function parcelAt(x: number, y: number, roadAccess = 0.5, cityProximity = 0.5): Parcel {
  return {
    id: parcelIdFromCoords(x, y),
    x,
    y,
    state: 'building-ready',
    ownerId: 'p',
    resource: generateParcelResource(x, y),
    role: 'land',
    populationDensity: 50,
    roadAccess,
    cityProximity,
    nearestCityName: null,
    nearestCityDistance: 3,
  };
}

/**
 * 空間效率的實際權重。
 *
 * 兩條槓桿會影響單座工廠的獲利：
 * 1. **位置**（距離供應樞紐的曼哈頓距離 → 產出係數）
 * 2. **數量**（多蓋一座工廠的邊際貢獻）
 *
 * 這個測試把兩者換算成同一單位（25 天的淨貢獻），才能回答
 * 「為了好位置多付購地溢價，值不值得」。
 */
describe('空間效率的實際權重', () => {
  const recipe = RECIPES['extract-iron'];
  const marginPerCycle =
    ITEMS[recipe.outputItemId].unitValue * recipe.outputQuantity * (recipe.outputMultiplier ?? 1);
  const holding = dailyHoldingCostPerFactory();
  const buildCost = FACTORY_TYPES.workshop.buildCost;

  /** 單座工廠在 25 天內的淨貢獻（扣建廠與持有成本，不含購地）。 */
  const netContribution = (x: number, y: number): number => {
    const t = computeProductionTiming(
      recipe.baseCycleTicks,
      recipe.travelTickPerDistance,
      parcelAt(x, y),
      1,
    );
    const gross = (marginPerCycle / t.cycleTicks) * t.throughputFactor * BALANCE.maxDays;
    return gross - holding * BALANCE.maxDays - buildCost;
  };

  it('產出係數隨距離遞減，且週期不再受距離影響', () => {
    console.log('\n=== 距離對單座開採工廠的影響（開採鐵礦）===');
    console.log(
      'd'.padStart(4) +
        'tpf'.padStart(8) +
        'cycle'.padStart(7) +
        'margin/day'.padStart(12) +
        'net25'.padStart(10),
    );
    const rows: { d: number; net: number; tpf: number }[] = [];
    for (const d of [0, 2, 4, 8, 12, 16, 20, 26]) {
      const t = computeProductionTiming(
        recipe.baseCycleTicks,
        recipe.travelTickPerDistance,
        parcelAt(d, 0),
        1,
      );
      const perDay = (marginPerCycle / t.cycleTicks) * t.throughputFactor;
      const net = netContribution(d, 0);
      rows.push({ d, net, tpf: t.throughputFactor });
      console.log(
        String(d).padStart(4) +
          t.throughputFactor.toFixed(4).padStart(8) +
          String(t.cycleTicks).padStart(7) +
          perDay.toFixed(0).padStart(12) +
          net.toFixed(0).padStart(10),
      );
    }

    // 護欄：產出係數嚴格遞減，週期固定
    for (let i = 1; i < rows.length; i += 1) {
      expect(rows[i]!.tpf).toBeLessThan(rows[i - 1]!.tpf);
    }
    const cycles = [0, 8, 26].map(
      (d) =>
        computeProductionTiming(
          recipe.baseCycleTicks,
          recipe.travelTickPerDistance,
          parcelAt(d, 0),
          1,
        ).cycleTicks,
    );
    expect(new Set(cycles).size, '距離不該改變週期').toBe(1);
  });

  it('位置槓桿 vs 數量槓桿的相對大小', () => {
    const near = netContribution(1, 0);
    const far = netContribution(25, 0);
    const positionSpread = near - far;
    const quantityGain = netContribution(1, 0); // 多蓋一座（放在最好的位置）

    console.log('\n=== 兩條槓桿換算成同一單位（25 天淨貢獻）===');
    console.log(`  最佳位置（d=1）  單座淨貢獻 ${near.toFixed(0)}`);
    console.log(`  最差位置（d=25） 單座淨貢獻 ${far.toFixed(0)}`);
    console.log(`  → 位置槓桿（最好 − 最差）= ${positionSpread.toFixed(0)}`);
    console.log(`  → 數量槓桿（多蓋一座、放最佳位置）= ${quantityGain.toFixed(0)}`);
    console.log(`  → 數量槓桿是位置槓桿的 ${(quantityGain / positionSpread).toFixed(2)} 倍`);

    // 護欄：位置必須有意義（不是 0），但也不該完全主導
    expect(positionSpread, '位置必須對獲利有實質影響').toBeGreaterThan(0);
    expect(near, '最佳位置必須獲利').toBeGreaterThan(0);
  });

  it('購地溢價是否值得：位置槓桿 vs 拍賣底價差', () => {
    // 拍賣底價的區位溢價公式（world/demand.ts）：
    //   locationPremium = 人口密度*24 + cityProximity*2000 + roadAccess*800
    const premiumFor = (density: number, city: number, road: number) =>
      Math.round(density * 24 + city * 2_000 + road * 800);

    const best = premiumFor(100, 1, 1);
    const worst = premiumFor(0, 0, 0);
    const premiumSpread = best - worst;

    // 位置帶來的 25 天額外淨貢獻
    const near = netContribution(1, 0);
    const far = netContribution(25, 0);
    const positionGain = near - far;

    console.log('\n=== 為好位置付溢價是否划算 ===');
    console.log(`  拍賣底價的區位溢價範圍：${worst} ～ ${best}（差 ${premiumSpread}）`);
    console.log(`  好位置多賺（25 天）：${positionGain.toFixed(0)}`);
    console.log(
      `  → 溢價 ${premiumSpread} 換 25 天多賺 ${positionGain.toFixed(0)}：` +
        `${positionGain > premiumSpread ? '划算' : '不划算'}`,
    );
    console.log(
      `  → 回本時間：約 ${(premiumSpread / Math.max(1, positionGain / BALANCE.maxDays)).toFixed(1)} 天`,
    );

    // 這條是量測而非護欄：記錄現況，不強制方向
    expect(premiumSpread).toBeGreaterThan(0);
    expect(positionGain).toBeGreaterThan(0);
  });

  it('完整迴圈下，起始位置是否影響通關', () => {
    // 用真實迴圈跑不同地圖尺寸，觀察距離分布改變時淨利的變化
    console.log('\n=== 完整迴圈：地圖尺寸 → 距離分布 → 淨利 ===');
    for (const [w, h] of [
      [8, 6],
      [12, 9],
      [16, 12],
      [20, 15],
    ] as const) {
      const r = runFullLoop({ mapWidth: w, mapHeight: h, maxParcels: 4, startingCash: 100_000 });
      const maxD = w - 1 + (h - 1);
      console.log(
        `  ${String(w).padStart(2)}×${String(h).padStart(2)}（最大距離 ${String(maxD).padStart(2)}）  ` +
          `淨利 ${String(r.netProfit).padStart(7)}  狀態 ${r.status}`,
      );
      expect(r.netProfit, `${w}×${h} 應該要能獲利`).toBeGreaterThan(0);
    }
  });
});
