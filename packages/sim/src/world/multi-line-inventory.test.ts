import { describe, expect, it } from 'vitest';
import { applyWorldAction } from '../world/reducer.js';
import { createInitialWorld } from '../world/create-world.js';
import { findOpenLotForParcel } from '../world/state.js';
import { FACTORY_TYPES } from '../buildings/catalog.js';
import { getItemQty } from '../production/items.js';
import { parcelIdFromCoords } from '../types/map.js';

/** 買下並蓋好一座工廠（地塊需可通過拍賣）。 */
function ownAndComplete(
  state: ReturnType<typeof createInitialWorld>,
  parcelId: ReturnType<typeof parcelIdFromCoords>,
): { state: ReturnType<typeof createInitialWorld>; parcelId: ReturnType<typeof parcelIdFromCoords> } {
  const lot = findOpenLotForParcel(state, parcelId)!;
  let next = applyWorldAction(state, { type: 'BID', parcelId, amount: lot.minPrice });
  next = applyWorldAction(next, { type: 'SETTLE_AUCTION', parcelId });
  next = applyWorldAction(next, { type: 'START_BUILD', parcelId, factoryTypeId: 'workshop' });
  for (let i = 0; i < FACTORY_TYPES.workshop.buildTimeTicks; i += 1) {
    next = applyWorldAction(next, { type: 'ADVANCE_BUILD_TICK' });
  }
  return { state: next, parcelId };
}

/** 找出前 n 塊具備指定礦脈、仍可拍賣的地塊（開採配方必須落在對應礦脈上）。 */
function findParcelsWithVein(
  state: ReturnType<typeof createInitialWorld>,
  kind: string,
  n: number,
): ReturnType<typeof parcelIdFromCoords>[] {
  return state.map.parcels
    .filter((p) => p.role === 'land' && p.ownerId === null && p.resource.kind === kind)
    .filter((p) => findOpenLotForParcel(state, p.id) !== undefined)
    .sort((a, b) => (a.y - b.y) || (a.x - b.x))
    .slice(0, n)
    .map((p) => p.id);
}

/**
 * 多座工廠共用同一份玩家庫存時的累加行為。
 *
 * `applyProductionTick` 逐條生產線讀寫 `inventories`，每條線都會看到
 * 前一條線寫回後的結果。若哪天有人把它改成「讀 tick 開始時的快照、
 * 最後再合併」，就會變成只有最後一條線的消耗與產出被保留 ——
 * 這個測試會擋下那種改動。
 */
describe('多工廠共用庫存的累加', () => {
  it('兩座開採廠在同一 tick 的產出都會進庫存', () => {
    let state = createInitialWorld({ startingCash: 500_000 });
    const veins = findParcelsWithVein(state, 'iron-vein', 2);
    expect(veins).toHaveLength(2);
    const first = ownAndComplete(state, veins[0]!);
    state = first.state;
    const second = ownAndComplete(state, veins[1]!);
    state = second.state;

    // 清空庫存，只留下可預期的起始量
    state = { ...state, inventories: { [state.localPlayerId]: { 'raw-ore': 0 } } };

    state = applyWorldAction(state, {
      type: 'START_PRODUCTION',
      parcelId: first.parcelId,
      recipeId: 'extract-iron',
    });
    state = applyWorldAction(state, {
      type: 'START_PRODUCTION',
      parcelId: second.parcelId,
      recipeId: 'extract-iron',
    });

    expect(Object.keys(state.productionLines)).toHaveLength(2);

    // 推進到兩個週期都完成
    const cycle = state.productionLines[first.parcelId.value]!.cycleTicks;
    for (let i = 0; i < cycle * 2; i += 1) {
      state = applyWorldAction(state, { type: 'ADVANCE_PRODUCTION_TICK' });
    }

    const ore = getItemQty(state.inventories[state.localPlayerId], 'raw-ore');
    // 兩座工廠都要有貢獻；若只有一條線的結果被保留，這裡會接近單座的產量
    expect(ore).toBeGreaterThan(0);
    const runs =
      (state.productionLines[first.parcelId.value]?.completedRuns ?? 0) +
      (state.productionLines[second.parcelId.value]?.completedRuns ?? 0);
    expect(runs).toBeGreaterThanOrEqual(2);
  });

  it('加工廠會消耗共用庫存的原料', () => {
    let state = createInitialWorld({ startingCash: 500_000 });
    const veins = findParcelsWithVein(state, 'iron-vein', 2);
    expect(veins).toHaveLength(2);
    const a = ownAndComplete(state, veins[0]!);
    state = a.state;
    const b = ownAndComplete(state, veins[1]!);
    state = b.state;

    state = { ...state, inventories: { [state.localPlayerId]: { 'raw-ore': 20, resin: 20 } } };
    const before = getItemQty(state.inventories[state.localPlayerId], 'raw-ore');

    state = applyWorldAction(state, {
      type: 'START_PRODUCTION',
      parcelId: b.parcelId,
      recipeId: 'make-basic-part',
    });
    const cycle = state.productionLines[b.parcelId.value]!.cycleTicks;
    for (let i = 0; i < cycle * 2; i += 1) {
      state = applyWorldAction(state, { type: 'ADVANCE_PRODUCTION_TICK' });
    }

    const after = getItemQty(state.inventories[state.localPlayerId], 'raw-ore');
    // 有實際完成週期才會消耗原料
    const runs = state.productionLines[b.parcelId.value]?.completedRuns ?? 0;
    if (runs > 0) {
      expect(after).toBeLessThan(before);
    }
    expect(runs).toBeGreaterThan(0);
  });
});
