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
import { ITEMS, getItemQty, type PlayerStock } from '../production/items.js';
import { RECIPES, type RecipeDef, type RecipeId, type RecipeStage } from '../production/recipes.js';
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
function marginPerCycle(recipe: RecipeDef): number {
  const outValue =
    ITEMS[recipe.outputItemId].unitValue * recipe.outputQuantity * recipe.outputMultiplier;
  const inValue = recipe.inputs.reduce(
    (sum, input) => sum + ITEMS[input.itemId].unitValue * input.quantity,
    0,
  );
  return outValue - inValue;
}

/**
 * 這個配方現在能不能排？需要研究的配方必須先解鎖。
 *
 * 這是修掉的一個真 bug：`RecipeDef.researchId` 先前**完全沒被檢查**，
 * 所以「研發解鎖」在自動排程裡形同虛設 —— 只要原料夠、毛利高就會被排進去。
 * 目前所有帶 researchId 的配方產出都不可販售，所以問題還沒顯現；
 * 一旦有「可用但要解鎖」的配方就會直接爆掉。
 */
export function isRecipeUnlocked(recipe: RecipeDef, unlocked: readonly string[]): boolean {
  const researchId = recipe.researchId;
  return !researchId || unlocked.includes(researchId);
}

/**
 * 排程要吃掉多少原料才能安心開跑。
 *
 * 這是「搶料」問題的核心修正。原本每個工廠都獨立看**全部庫存**，
 * 於是兩座組裝廠會同時判定「合金板夠」而一起開工 —— 實際上只有一份，
 * 第二座隨後就餓死，變成閒置（土地稅與維護照付）。
 *
 * 這裡要求每個配方至少能撐 `PLAN_INPUT_BUFFER` 個週期才排。
 */
export const PLAN_INPUT_BUFFER = 1;

/** 目前庫存夠不夠跑這個配方（含緩衝）。 */
export function hasInputsForRecipe(
  stock: PlayerStock | undefined,
  recipe: RecipeDef,
  buffer = PLAN_INPUT_BUFFER,
): boolean {
  const source: PlayerStock = stock ?? {};
  return recipe.inputs.every(
    (input) => getItemQty(source, input.itemId) >= input.quantity * buffer,
  );
}

function bestReadyRecipe(
  state: WorldState,
  playerId: string,
  siteFactoryTypeId: string,
  stage: RecipeStage,
  reserved: Readonly<Record<string, number>> = {},
): RecipeId | null {
  const stock = state.inventories[playerId] ?? {};
  const crafted = state.craftedTotals[playerId];
  const unlocked = state.commerce?.unlocked ?? [];
  // 扣掉前面幾座工廠已經預定走的原料 —— 否則同一個原料會被重複規劃
  const available: PlayerStock = Object.fromEntries(
    Object.entries(stock).map(([itemId, qty]) => [itemId, qty - (reserved[itemId] ?? 0)]),
  );
  const candidates = Object.values(RECIPES)
    .filter((recipe) => recipe.stage === stage && recipe.inputs.length > 0)
    .filter((recipe) => !('researchId' in recipe && recipe.researchId))
    .filter((recipe) => ITEMS[recipe.outputItemId].sellable)
    .filter((recipe) => techStage(crafted) >= recipe.minTechStage)
    .filter((recipe) => isRecipeUnlocked(recipe, unlocked))
    .filter((recipe) => (recipe.buildings as readonly string[]).includes(siteFactoryTypeId))
    .filter((recipe) => hasInputsForRecipe(available, recipe))
    .map((recipe) => ({ recipe, marginPerCycle: marginPerCycle(recipe) }))
    .filter((candidate) => candidate.marginPerCycle > 0)
    .sort((a, b) => b.marginPerCycle - a.marginPerCycle || a.recipe.id.localeCompare(b.recipe.id));
  return candidates[0]?.recipe.id ?? null;
}

export interface SlotPlan {
  /** 這座工廠的 parcel key */
  readonly parcelKey: string;
  /** 這一格（工廠）被指派的配方 */
  readonly recipeId: RecipeId;
  /** 是否為加工（相對於開採） */
  readonly processing: boolean;
}

/**
 * 目前深度下，可販售加工配方會吃到的原料品項。
 *
 * 用來決定「哪些工廠必須去開採」。先前是取前 N 座工廠當礦場，
 * **完全沒看礦脈** —— 於是兩座礦場可能都在鐵脈上，樹脂那塊地反而被派去加工，
 * 結果永遠缺料（實測 3 塊地跑 25 天只做出 2 個基礎零件）。
 */
function rawItemsNeededByProcessing(depth: 0 | 1 | 2): ReadonlySet<string> {
  const needed = new Set<string>();
  for (const recipe of Object.values(RECIPES)) {
    if (recipe.inputs.length === 0) {
      continue;
    }
    if (!ITEMS[recipe.outputItemId].sellable) {
      continue;
    }
    if (recipe.stage === 'process' ? depth < 1 : depth < 2) {
      continue;
    }
    for (const input of recipe.inputs) {
      if (ITEMS[input.itemId].tier === 'raw') {
        needed.add(input.itemId);
      }
    }
  }
  return needed;
}

export function planProductionSlots(
  state: WorldState,
  playerId: string,
  factoryKeys: readonly string[],
  depth: 0 | 1 | 2,
  extractorCount: number,
): SlotPlan[] {
  const ordered = [...factoryKeys].sort();
  const workshops = ordered.filter((key) => state.sites[key]?.factoryTypeId === 'workshop');
  const slots = Math.max(1, extractorCount);
  const needRaw = rawItemsNeededByProcessing(depth);

  // 礦場要「按礦脈」挑：每種加工需要的原料，先各指派一座，再用其餘工廠補滿。
  const extractorKeys = new Set<string>();
  const covered = new Set<string>();
  for (const key of workshops) {
    if (extractorKeys.size >= slots) {
      break;
    }
    const parcel = state.map.parcels.find((p) => p.id.value === key);
    if (!parcel) {
      continue;
    }
    const extractionId = extractionRecipeFor(parcel.resource.kind);
    if (!extractionId) {
      continue;
    }
    const outputItemId = RECIPES[extractionId].outputItemId;
    if (needRaw.has(outputItemId) && !covered.has(outputItemId)) {
      covered.add(outputItemId);
      extractorKeys.add(key);
    }
  }
  for (const key of workshops) {
    if (extractorKeys.size >= slots) {
      break;
    }
    extractorKeys.add(key);
  }

  const depthTwo =
    depth >= 2 && ordered.some((key) => state.sites[key]?.factoryTypeId === 'assembly-plant');

  const plans: SlotPlan[] = [];
  // 已經被前面工廠預定走的原料。沒有這個，兩座同型工廠會同時判定
  // 「原料夠」而一起開工，實際上只有一份 —— 第二座隨後餓死變閒置。
  const reserved: Record<string, number> = {};
  const reserveInputs = (recipeId: RecipeId): void => {
    for (const input of RECIPES[recipeId].inputs) {
      reserved[input.itemId] = (reserved[input.itemId] ?? 0) + input.quantity;
    }
  };
  for (const key of ordered) {
    const parcel = state.map.parcels.find((p) => p.id.value === key);
    const site = state.sites[key];
    if (!parcel || !site) {
      continue;
    }
    const extraction = extractionRecipeFor(parcel.resource.kind);
    const wanted: RecipeStage | null =
      depth <= 0
        ? null
        : site.factoryTypeId === 'assembly-plant' && depthTwo
          ? 'finish'
          : extractorKeys.has(key)
            ? null
            : 'process';

    if (wanted) {
      const picked = bestReadyRecipe(state, playerId, site.factoryTypeId, wanted, reserved);
      if (picked) {
        plans.push({ parcelKey: key, recipeId: picked, processing: true });
        reserveInputs(picked);
        continue;
      }
      if (wanted === 'finish') {
        const feeder = bestReadyRecipe(state, playerId, site.factoryTypeId, 'process', reserved);
        if (feeder) {
          plans.push({ parcelKey: key, recipeId: feeder, processing: true });
          reserveInputs(feeder);
          continue;
        }
      }
    }

    if (extraction) {
      plans.push({ parcelKey: key, recipeId: extraction, processing: false });
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
  // 以 parcelKey 對應，而不是陣列下標 —— 沒抽到計畫的工廠不會讓後面全部錯位。
  const map = new Map<string, RecipeId>();
  for (const plan of plans) {
    map.set(plan.parcelKey, plan.recipeId);
  }
  return applyProductionPlans({ ...state, localPlayerId: playerId }, map);
}
