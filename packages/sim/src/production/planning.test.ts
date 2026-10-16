import { describe, expect, it } from 'vitest';
import { planProductionSlots, extractionRecipeFor, runProductionPlan } from './planning.js';
import { createInitialWorld } from '../world/create-world.js';
import { applyWorldAction } from '../world/reducer.js';
import { findOpenLotForParcel } from '../world/state.js';
import { FACTORY_TYPES } from '../buildings/catalog.js';
import { ITEMS } from './items.js';
import { RECIPES } from './recipes.js';

/**
 * 生產調度的共用規則。
 *
 * `reports/full-loop.ts`（可通關性量測）與 `reports/simulate.ts`（機器人策略模擬）
 * 都走這裡，兩邊不會各自漂移。先前規則只存在 full-loop，機器人一律挑開採配方，
 * 因此策略排名只反映「誰挖得多」。
 */
describe('生產調度規則', () => {
  /** 蓋好 N 座工坊並回傳狀態，依 `veinOrder` 輪流挑不同礦脈的地塊。 */
  function worldWithFactories(count: number, veinOrder: readonly string[]) {
    let state = createInitialWorld({ startingCash: 500_000 });
    const pid = state.localPlayerId;
    const owned: string[] = [];
    let cursor = 0;
    while (owned.length < count && cursor < count * veinOrder.length + veinOrder.length) {
      const vein = veinOrder[cursor % veinOrder.length]!;
      cursor += 1;
      const cand = state.map.parcels
        .filter(
          (p) =>
            p.role === 'land' &&
            p.ownerId === null &&
            p.resource.kind === vein &&
            findOpenLotForParcel(state, p.id) !== undefined,
        )
        .sort((a, b) => a.y - b.y || a.x - b.x)[0];
      if (!cand) continue;
      const lot = findOpenLotForParcel(state, cand.id)!;
      state = applyWorldAction(state, { type: 'BID', parcelId: cand.id, amount: lot.minPrice });
      state = applyWorldAction(state, { type: 'SETTLE_AUCTION', parcelId: cand.id });
      state = applyWorldAction(state, {
        type: 'START_BUILD',
        parcelId: cand.id,
        factoryTypeId: 'workshop',
      });
      owned.push(cand.id.value);
    }
    for (let i = 0; i < FACTORY_TYPES.workshop.buildTimeTicks; i += 1) {
      state = applyWorldAction(state, { type: 'ADVANCE_BUILD_TICK' });
    }
    return { state, pid, keys: owned };
  }

  it('depth 0 全部開採', () => {
    const { state, pid, keys } = worldWithFactories(4, ['iron-vein']);
    const plans = planProductionSlots(state, pid, keys, 0, 1);
    expect(plans).toHaveLength(4);
    expect(plans.every((p) => !p.processing)).toBe(true);
  });

  it('原料不足時不會佔著工廠做加工，會退回開採', () => {
    // 全新開局庫存只有起始原料，且這些工廠都在鐵脈上；
    // 加工配方要 2 原礦 + 1 樹脂，沒有樹脂就不該硬做。
    const { state, pid, keys } = worldWithFactories(4, ['iron-vein']);
    const plans = planProductionSlots(state, pid, keys, 1, 1);
    // 至少礦場必須在開採
    expect(plans[0]!.processing).toBe(false);
    // 全部計畫都必須是可販售產出（不能是中間財）
    for (const plan of plans) {
      const recipe = RECIPES[plan.recipeId];
      expect(ITEMS[recipe.outputItemId].sellable, `${plan.recipeId} 產出不可販售`).toBe(true);
    }
  });

  it('每條計畫的配方都必須能在該廠型執行', () => {
    const { state, pid, keys } = worldWithFactories(4, ['iron-vein', 'resin-bog']);
    const plans = planProductionSlots(state, pid, keys, 1, 2);
    for (const [index, plan] of plans.entries()) {
      const key = [...keys].sort()[index]!;
      const factoryTypeId = state.sites[key]!.factoryTypeId;
      expect(
        (RECIPES[plan.recipeId].buildings as readonly string[]).includes(factoryTypeId),
        `${plan.recipeId} 不能在 ${factoryTypeId} 執行`,
      ).toBe(true);
    }
  });

  it('開採配方對應正確的礦脈', () => {
    expect(extractionRecipeFor('iron-vein')).toBe('extract-iron');
    expect(extractionRecipeFor('resin-bog')).toBe('extract-resin');
    expect(extractionRecipeFor('no-such-vein')).toBeNull();
  });

  it('runProductionPlan 會真的建立生產線', () => {
    const { state, pid, keys } = worldWithFactories(2, ['iron-vein']);
    const after = runProductionPlan(state, pid, keys, 0, 1);
    for (const key of keys) {
      expect(after.productionLines[key], `${key} 應該有生產線`).toBeDefined();
      expect(after.productionLines[key]!.recipeId).toBe('extract-iron');
    }
  });

  it('不會對已在正確配方上的生產線重複下指令', () => {
    const { state, pid, keys } = worldWithFactories(2, ['iron-vein']);
    const once = runProductionPlan(state, pid, keys, 0, 1);
    const twice = runProductionPlan(once, pid, keys, 0, 1);
    // 第二次不該改變任何生產線（不重置進度）
    for (const key of keys) {
      expect(twice.productionLines[key]!.progressTicks).toBe(
        once.productionLines[key]!.progressTicks,
      );
    }
  });
});
