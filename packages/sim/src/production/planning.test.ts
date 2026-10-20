import { describe, expect, it } from 'vitest';
import {
  PLAN_INPUT_BUFFER,
  hasInputsForRecipe,
  isRecipeUnlocked,
  planProductionSlots,
  extractionRecipeFor,
  runProductionPlan,
} from './planning.js';
import { createInitialWorld } from '../world/create-world.js';
import { applyWorldAction } from '../world/reducer.js';
import { findOpenLotForParcel } from '../world/state.js';
import { FACTORY_TYPES } from '../buildings/catalog.js';
import { ITEMS } from './items.js';
import { RECIPES } from './recipes.js';
import type { WorldState } from '../world/state.js';

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

/**
 * 配方解鎖條件。
 *
 * 這是一個修掉的真 bug：`RecipeDef.researchId` 先前**完全沒被檢查**，
 * 所以「研發解鎖」在自動排程裡形同虛設 —— 只要原料夠、毛利高就會被排進去。
 */
describe('配方解鎖條件', () => {
  it('沒有 researchId 的配方永遠可排', () => {
    const recipe = RECIPES['make-alloy-plate'];
    expect(isRecipeUnlocked(recipe, [])).toBe(true);
    expect(isRecipeUnlocked(recipe, ['consumer-line'])).toBe(true);
  });

  it('有 researchId 的配方要解鎖後才能排', () => {
    const recipe = RECIPES['make-hand-tool'];
    expect(recipe.researchId).toBe('consumer-line');
    expect(isRecipeUnlocked(recipe, [])).toBe(false);
    expect(isRecipeUnlocked(recipe, ['其他研究'])).toBe(false);
    expect(isRecipeUnlocked(recipe, ['consumer-line'])).toBe(true);
  });

  it('解鎖清單裡的無關項目不影響判定', () => {
    const recipe = RECIPES['make-pack-module'];
    expect(isRecipeUnlocked(recipe, ['a', 'b', 'c'])).toBe(false);
  });

  it('自動排程不會排出未解鎖的配方', () => {
    // 這是回歸守門：先前 researchId 完全沒被檢查，排程可以排出任何配方。
    // 現在對每一種「排得出來」的情境檢查一遍 —— 排出來的配方必須全部符合解鎖條件。
    let state = createInitialWorld({ startingCash: 500_000 });
    const parcel = state.map.parcels
      .filter((p) => p.role === 'land' && p.ownerId === null)
      .find((p) => findOpenLotForParcel(state, p.id) !== undefined)!;
    const lot = findOpenLotForParcel(state, parcel.id)!;
    state = applyWorldAction(state, { type: 'BID', parcelId: parcel.id, amount: lot.minPrice });
    state = applyWorldAction(state, { type: 'SETTLE_AUCTION', parcelId: parcel.id });
    state = applyWorldAction(state, {
      type: 'START_BUILD',
      parcelId: parcel.id,
      factoryTypeId: 'workshop',
    });
    for (let i = 0; i < FACTORY_TYPES.workshop.buildTimeTicks; i += 1) {
      state = applyWorldAction(state, { type: 'ADVANCE_BUILD_TICK' });
    }
    // 給一大堆原料，讓排程「有本錢」排出任何毛利最高的配方
    state = {
      ...state,
      inventories: {
        ...state.inventories,
        [state.localPlayerId]: Object.fromEntries(Object.keys(ITEMS).map((itemId) => [itemId, 99])),
      },
    };
    const unlocked = state.commerce?.unlocked ?? [];
    for (const depth of [0, 1, 2] as const) {
      const plans = planProductionSlots(state, state.localPlayerId, [parcel.id.value], depth, 1);
      for (const plan of plans) {
        expect(
          isRecipeUnlocked(RECIPES[plan.recipeId], unlocked),
          `排程排出了未解鎖的配方：${plan.recipeId}`,
        ).toBe(true);
      }
    }
  });
});

/**
 * 排程搶料。
 *
 * 先前每座工廠都獨立看**全部庫存**，於是兩座同型工廠會同時判定「原料夠」
 * 而一起開工 —— 實際上只有一份，第二座隨後餓死，變成閒置（稅金與維護照付）。
 * 現在排程會把已規劃的原料「預訂」掉，後面的工廠只能看到剩下的。
 */
describe('排程搶料', () => {
  it('庫存不足時不會排入需要該原料的配方（緩衝）', () => {
    const recipe = RECIPES['make-basic-part'];
    // 這個配方有多個投入，先湊齊全部、再單獨少一個
    const full: Record<string, number> = {};
    for (const input of recipe.inputs) {
      full[input.itemId] = input.quantity;
    }
    expect(hasInputsForRecipe(full, recipe)).toBe(true);

    const shortage = { ...full };
    const first = recipe.inputs[0]!;
    shortage[first.itemId] = first.quantity - 1;
    expect(hasInputsForRecipe(shortage, recipe)).toBe(false);

    // 緩衝 2 週期時，剛好一份原料就不夠了
    expect(hasInputsForRecipe(full, recipe, 2)).toBe(false);
    const doubled = Object.fromEntries(
      recipe.inputs.map((input) => [input.itemId, input.quantity * 2]),
    );
    expect(hasInputsForRecipe(doubled, recipe, 2)).toBe(true);
  });

  it('同一份原料不會被兩座工廠重複規劃', () => {
    // 三座工坊、兩座要加工，但原料只夠跑一次 → 只有一座能排到加工。
    const recipe = RECIPES['make-basic-part'];
    const need = recipe.inputs[0]!;
    const keys = ['0:0', '1:0', '2:0'];
    const fake = {
      localPlayerId: 'p1',
      gameDay: 0,
      map: {
        parcels: keys.map((key, index) => ({
          id: { value: key },
          x: index,
          y: 0,
          resource: { kind: index === 0 ? 'iron' : 'resin' },
        })),
      },
      sites: Object.fromEntries(
        keys.map((key) => [key, { factoryTypeId: 'workshop', phase: 'complete', ownerId: 'p1' }]),
      ),
      productionLines: {},
      inventories: { p1: { [need.itemId]: need.quantity } },
      craftedTotals: { p1: { 'raw-ore': 10, 'basic-part': 10 } },
      commerce: { unlocked: [] },
    } as unknown as WorldState;

    const plans = planProductionSlots(fake, 'p1', keys, 1, 1);
    const processing = plans.filter((plan) => plan.recipeId === recipe.id);
    expect(processing.length, '同一份原料被重複規劃了').toBeLessThanOrEqual(1);
  });

  it('緩衝預設值是 1（等於「剛好一份」就能開跑）', () => {
    expect(PLAN_INPUT_BUFFER).toBe(1);
  });
});
