/**
 * 生產調度 · production planning
 *
 * 「這座工廠現在該跑什麼配方」的單一真相來源。
 *
 * `reports/full-loop.ts`（逐日可通關性量測）與 `reports/simulate.ts`
 * （機器人策略模擬）都需要這個判斷。先前只有 full-loop 有，機器人則一律
 * 挑「該礦脈的開採配方」—— 所以機器人**永遠不會加工**，
 * 策略排名只反映「誰挖得多」而不是「誰經營得好」。
 *
 * 這裡把規則集中起來，兩邊就不會各自漂移。
 */
import { applyWorldAction } from '../world/reducer.js';
import type { WorldState } from '../world/state.js';
import { ITEMS, getItemQty } from '../production/items.js';
import { RECIPES, type RecipeId } from '../production/recipes.js';
import { techStage } from '../production/chain.js';

/** 找出某礦脈對應、不需外部投入的配方（開採類）。 */
export function extractionRecipeFor(kind: string): RecipeId | null {
  for (const recipe of Object.values(RECIPES)) {
    if (recipe.sourceKind === kind && recipe.inputs.length === 0) {
      return recipe.id;
    }
  }
  return null;
}

export interface SlotPlan {
  /** 這一格（工廠）被指派的配方 */
  readonly recipeId: RecipeId;
  /** 是否為加工（相對於開採） */
  readonly processing: boolean;
}

/**
 * 為一組工廠決定各自該跑什麼。
 *
 * 規則刻意單純：**先顧原料，再談加工**。
 *
 * 先前版本把加工廠輪流指派到「所有符合條件的配方」上，會讓小規模工廠群
 * 出現「工廠數增加、產能上升，但淨利反而下降」的怪象 ——
 * 因為加工廠把週期花在做**不可販售的中間財**（鐵錠、矽片）上，
 * 產能帳面變高卻換不到現金（實測 cluster 營收 65,753 → 52,862、淨利 -84%）。
 *
 * 現在的規則：
 * 1. 前 `extractorCount` 格永遠開採，確保原料供應。
 * 2. 加工格只在**原料足以啟動**時才加工，而且只挑**產出可販售**的配方。
 * 3. 加工機會不足（原料被賣光或還沒進來）就退回開採 ——
 *    開採永遠是最安全的預設值。
 */
export function planProductionSlots(
  state: WorldState,
  playerId: string,
  factoryKeys: readonly string[],
  depth: 0 | 1 | 2,
  extractorCount: number,
): SlotPlan[] {
  const ordered = [...factoryKeys].sort();
  const extractorKeys = new Set(ordered.slice(0, Math.max(1, extractorCount)));
  const stock = state.inventories[playerId] ?? {};
  const crafted = state.craftedTotals[playerId];

  const plans: SlotPlan[] = [];
  for (const key of ordered) {
    const parcel = state.map.parcels.find((p) => p.id.value === key);
    const site = state.sites[key];
    if (!parcel || !site) {
      continue;
    }
    const extraction = extractionRecipeFor(parcel.resource.kind);

    if (depth > 0 && !extractorKeys.has(key)) {
      // 與引擎一致：以 craftedTotals 推導技術階段，尊重 minTechStage。
      // 只挑可販售的產出，否則做了中間財卻換不到現金。
      const candidates = Object.values(RECIPES)
        .filter((r) => r.inputs.length > 0)
        .filter((r) => (r.stage === 'process' ? depth >= 1 : depth >= 2))
        .filter((r) => ITEMS[r.outputItemId].sellable)
        .filter((r) => techStage(crafted) >= r.minTechStage)
        .filter((r) => (r.buildings as readonly string[]).includes(site.factoryTypeId))
        // 原料現在就夠，才能啟動；不夠就別佔著工廠
        .filter((r) => r.inputs.every((i) => getItemQty(stock, i.itemId) >= i.quantity))
        // 以「每週期毛利」排序：正毛利才做，最高的優先
        .map((r) => {
          const outValue = ITEMS[r.outputItemId].unitValue * r.outputQuantity * r.outputMultiplier;
          const inValue = r.inputs.reduce(
            (sum, i) => sum + ITEMS[i.itemId].unitValue * i.quantity,
            0,
          );
          return { recipe: r, marginPerCycle: outValue - inValue };
        })
        .filter((c) => c.marginPerCycle > 0)
        .sort((a, b) => b.marginPerCycle - a.marginPerCycle);

      const best = candidates[0];
      if (best) {
        plans.push({ recipeId: best.recipe.id, processing: true });
        continue;
      }
    }

    if (extraction) {
      plans.push({ recipeId: extraction, processing: false });
    }
  }
  return plans;
}

/** 套用計畫：只排「還沒在跑這個配方」的工廠，避免每 tick 重複下指令。 */
export function applyProductionPlans(
  state: WorldState,
  plans: ReadonlyMap<string, RecipeId>,
): WorldState {
  let next = state;
  for (const [key, recipeId] of plans) {
    const parcel = next.map.parcels.find((p) => p.id.value === key);
    const site = next.sites[key];
    if (!parcel || !site) {
      continue;
    }
    if (!(RECIPES[recipeId].buildings as readonly string[]).includes(site.factoryTypeId)) {
      continue;
    }
    const line = next.productionLines[key];
    if (line?.recipeId === recipeId) {
      continue;
    }
    // 缺料時切換沒有損失；正在跑則等這一輪做完再切，避免浪費已累積的進度。
    if (line && line.status !== 'waiting_inputs' && line.progressTicks > 0) {
      continue;
    }
    if (line) {
      next = applyWorldAction(next, { type: 'STOP_PRODUCTION', parcelId: parcel.id });
    }
    next = applyWorldAction(next, {
      type: 'START_PRODUCTION',
      parcelId: parcel.id,
      recipeId,
    });
  }
  return next;
}

/** 便利函式：算出計畫並套用。 */
export function runProductionPlan(
  state: WorldState,
  playerId: string,
  factoryKeys: readonly string[],
  depth: 0 | 1 | 2,
  extractorCount: number,
): WorldState {
  const plans = planProductionSlots(state, playerId, factoryKeys, depth, extractorCount);
  const map = new Map<string, RecipeId>();
  const ordered = [...factoryKeys].sort();
  for (const [index, key] of ordered.entries()) {
    const plan = plans[index];
    if (plan) {
      map.set(key, plan.recipeId);
    }
  }
  return applyProductionPlans({ ...state, localPlayerId: playerId }, map);
}
