import { describe, it } from 'vitest';
import { RECIPES } from '../production/recipes.js';
import { ITEMS } from '../production/items.js';
import { computeProductionTiming } from '../production/logistics.js';
import { FACTORY_TYPES } from '../buildings/catalog.js';
import { BALANCE, dailyHoldingCostPerFactory } from '../balance/targets.js';
import { parcelIdFromCoords, type Parcel } from '../types/map.js';
import { generateParcelResource } from '../world/parcel-resources.js';
import { getSiteLogisticsView } from '../buildings/adjacency.js';
import { createInitialWorld } from '../world/create-world.js';

/** 用真實地塊建立假 parcel（含真實 roadAccess / cityProximity）。 */
function realParcel(x: number, y: number): Parcel {
  return {
    id: parcelIdFromCoords(x, y),
    x,
    y,
    state: 'building-ready',
    ownerId: 'p',
    resource: generateParcelResource(x, y),
    role: 'land',
    populationDensity: 50,
    roadAccess: 0.5,
    cityProximity: 0.5,
    nearestCityName: null,
    nearestCityDistance: 3,
  };
}

describe('策略軸量測：開採廣度 vs 加工深度', () => {
  it('每個配方的每工廠每日毛利（依距離）', () => {
    const holding = dailyHoldingCostPerFactory();
    console.log(
      `\n持有成本 ${holding}/日/座  建廠 ${FACTORY_TYPES.workshop.buildCost}(工坊) / ${FACTORY_TYPES['assembly-plant'].buildCost}(組裝廠)  通關 ${BALANCE.targetNetProfit} / ${BALANCE.maxDays} 天`,
    );
    console.log(
      '\nrecipe'.padEnd(20) +
        'mult'.padStart(5) +
        'cycle'.padStart(6) +
        'margin'.padStart(8) +
        '  d=0/day'.padStart(10) +
        'd=8/day'.padStart(9) +
        'd=16/day'.padStart(9) +
        'd=26/day'.padStart(9),
    );

    for (const r of Object.values(RECIPES)) {
      const outVal = ITEMS[r.outputItemId].unitValue * r.outputQuantity * (r.outputMultiplier ?? 1);
      const inVal = r.inputs.reduce((s, i) => s + ITEMS[i.itemId].unitValue * i.quantity, 0);
      const margin = outVal - inVal;
      const perDay = (d: number) => {
        const t = computeProductionTiming(r.baseCycleTicks, r.travelTickPerDistance, realParcel(d, 0), 1);
        return (margin / t.cycleTicks) * t.throughputFactor;
      };
      console.log(
        r.id.padEnd(20) +
          String(r.outputMultiplier ?? 1).padStart(5) +
          String(r.baseCycleTicks).padStart(6) +
          String(margin).padStart(8) +
          perDay(0).toFixed(0).padStart(10) +
          perDay(8).toFixed(0).padStart(9) +
          perDay(16).toFixed(0).padStart(9) +
          perDay(26).toFixed(0).padStart(9),
      );
    }
  });

  it('單座工廠的 25 天淨貢獻（扣建廠與持有成本）', () => {
    const holding = dailyHoldingCostPerFactory();
    console.log('\n=== 單座工坊 25 天淨貢獻（不含購地成本）===');
    console.log('recipe'.padEnd(20) + 'buildCost'.padStart(10) + 'holding25'.padStart(10) + 'd=0 net'.padStart(10) + 'd=8 net'.padStart(10) + 'd=16 net'.padStart(10));
    for (const r of Object.values(RECIPES)) {
      if (!(r.buildings as readonly string[]).includes('workshop')) continue;
      const outVal = ITEMS[r.outputItemId].unitValue * r.outputQuantity * (r.outputMultiplier ?? 1);
      const inVal = r.inputs.reduce((s, i) => s + ITEMS[i.itemId].unitValue * i.quantity, 0);
      const margin = outVal - inVal;
      const net25 = (d: number) => {
        const t = computeProductionTiming(r.baseCycleTicks, r.travelTickPerDistance, realParcel(d, 0), 1);
        const gross = (margin / t.cycleTicks) * t.throughputFactor * BALANCE.maxDays;
        return gross - holding * BALANCE.maxDays - FACTORY_TYPES.workshop.buildCost;
      };
      console.log(
        r.id.padEnd(20) +
          String(FACTORY_TYPES.workshop.buildCost).padStart(10) +
          String(holding * BALANCE.maxDays).padStart(10) +
          net25(0).toFixed(0).padStart(10) +
          net25(8).toFixed(0).padStart(10) +
          net25(16).toFixed(0).padStart(10),
      );
    }
  });

  it('空間效率現在的實際差距（真實地圖）', () => {
    const state = createInitialWorld({});
    const factors: number[] = [];
    for (const parcel of state.map.parcels) {
      if (parcel.role !== 'land') continue;
      const v = getSiteLogisticsView(
        state.map,
        parcel,
        { ownerId: 'p', factoryTypeId: 'workshop', phase: 'complete', startedTick: 0 } as never,
        {},
      );
      factors.push(v.factor);
    }
    factors.sort((a, b) => a - b);
    const lo = factors[0]!;
    const hi = factors[factors.length - 1]!;
    console.log(`\n=== 物流係數範圍（n=${factors.length}）===`);
    console.log(`  最低 ${lo.toFixed(4)}  最高 ${hi.toFixed(4)}  相對差距 ${(((hi - lo) / lo) * 100).toFixed(1)}%`);

    // 每日毛利差距（以最佳開採配方為例）
    const r = RECIPES['extract-iron'];
    const margin = ITEMS[r.outputItemId].unitValue * r.outputQuantity * (r.outputMultiplier ?? 1);
    const perDay = (d: number) => {
      const t = computeProductionTiming(r.baseCycleTicks, r.travelTickPerDistance, realParcel(d, 0), 1);
      return (margin / t.cycleTicks) * t.throughputFactor;
    };
    const near = perDay(1);
    const far = perDay(26);
    console.log(`\n  開採鐵礦 daily margin：d=1 → ${near.toFixed(0)}   d=26 → ${far.toFixed(0)}   （${(((near - far) / near) * 100).toFixed(1)}% 差距）`);
    console.log(`  建廠成本 ${FACTORY_TYPES.workshop.buildCost}；位置差距 25 天累積 ≈ ${((near - far) * BALANCE.maxDays).toFixed(0)}`);
    console.log(`  → 位置差距是否值得為它多付購地溢價，取決於這個數字對上底價差。`);
  });
});
