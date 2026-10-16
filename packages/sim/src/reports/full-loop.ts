/**
 * 完整遊戲迴圈模擬器 · full-loop simulator
 *
 * 與 `reports/simulate.ts` 的差別：那個檔案用的是**簡化的營運收入模型**
 * （`FACTORY_BASE_YIELD × 物流係數 × 時間規劃`），不經過配方、庫存、
 * NPC 收購與運費。本檔案走的是**真實 action 序列**：
 *
 *   BID → SETTLE_AUCTION → START_BUILD → ADVANCE_BUILD_TICK
 *   → START_PRODUCTION → ADVANCE_PRODUCTION_TICK → SELL_TO_NPC → ADVANCE_DAY
 *
 * 因此這裡量到的淨利與 `evaluateScenario` 的通關判定，就是玩家實際會經歷的數字。
 */
import { FACTORY_TYPES, type FactoryTypeId } from '../buildings/catalog.js';
import { RECIPES, type RecipeId } from '../production/recipes.js';
import { getItemQty, ITEMS } from '../production/items.js';
import { netProfit } from '../sales/pnl.js';
import { addPnL, emptyPnL } from '../sales/pnl.js';
import { quoteSale } from '../sales/sell-logic.js';
import { resolveShipParcel } from '../sales/ship-route.js';
import type { ParcelId } from '../types/map.js';
import { applyWorldAction } from '../world/reducer.js';
import { createInitialWorld } from '../world/create-world.js';
import { DEFAULT_WORLD_CONFIG, type WorldConfig } from '../world/config.js';
import { getPlayerHoldings, type WorldState } from '../world/state.js';
import { DEFAULT_SCENARIO } from '../sales/scenario.js';

export interface FullLoopOptions {
  readonly mapWidth?: number;
  readonly mapHeight?: number;
  readonly startingCash?: number;
  readonly maxDays?: number;
  /** 每座工廠要跑哪個配方；預設用礦脈對應的開採配方。 */
  readonly recipeId?: RecipeId;
  readonly factoryTypeId?: FactoryTypeId;
  /** 最多持有幾塊地（含建廠用地）。 */
  readonly maxParcels?: number;
  readonly config?: Partial<WorldConfig>;
  /**
   * 加工深度：要往下游走幾階，用來比較「廣度（多蓋礦場）」與「深度（加工）」。
   *
   * - `0`（預設）：全部工廠只開採，賣原料。
   * - `1`：保留一座開採廠供應原料，其餘工廠跑一階加工。
   * - `2`：一階加工廠的產物再交給二階加工廠（軋製合金板）。
   *
   * 加工廠直接自共用庫存取用原料，因此這條路徑會真正檢驗
   * 「加工能不能把價值加上去」，而不是只看配方表。
   */
  readonly depth?: 0 | 1 | 2;
}

export interface FullLoopDay {
  readonly day: number;
  readonly cash: number;
  readonly revenue: number;
  readonly netProfit: number;
  readonly factories: number;
  readonly status: WorldState['scenario']['status'];
}

export interface FullLoopResult {
  readonly days: readonly FullLoopDay[];
  readonly finalCash: number;
  readonly pnl: ReturnType<typeof emptyPnL>;
  readonly netProfit: number;
  readonly status: WorldState['scenario']['status'];
  readonly ownedParcels: number;
  readonly completeFactories: number;
  readonly scenarioTarget: number;
  readonly maxDays: number;
  /** 是否達成通關門檻（不論天數是否用完）。 */
  readonly reachedTarget: boolean;
}

/** 找出產出可販售品項、且不需外部投入的配方（開採類）。 */
function extractionRecipeFor(kind: string): RecipeId | null {
  for (const recipe of Object.values(RECIPES)) {
    if (recipe.sourceKind === kind && recipe.inputs.length === 0) {
      return recipe.id;
    }
  }
  return null;
}

/**
 * 選定要經營的礦脈種類。
 * `extract-iron` 需要 `iron-vein` 地塊，配錯礦脈會被 `recipeBlockReason` 擋下，
 * 所以先決定礦脈、再找地 —— 這也是玩家在 UI 上必須做的選擇。
 */
const PREFERRED_RESOURCE_ORDER = [
  'iron-vein',
  'copper-shale',
  'quartz-sand',
  'resin-bog',
  'coal-seam',
] as const;

function pickResourceKind(state: WorldState, recipeId: RecipeId | undefined): string | null {
  if (recipeId) {
    const kind = RECIPES[recipeId]?.sourceKind;
    if (kind) {
      return kind;
    }
  }
  for (const kind of PREFERRED_RESOURCE_ORDER) {
    const available = state.map.parcels.some(
      (p) => p.role === 'land' && p.ownerId === null && p.resource.kind === kind,
    );
    if (available) {
      return kind;
    }
  }
  return null;
}

function countCompleteFactories(state: WorldState, playerId: string): number {
  return Object.values(state.sites).filter((s) => s.phase === 'complete' && s.ownerId === playerId)
    .length;
}

/** 選一塊可買、且有指定礦脈的地。 */
function chooseParcelToBuy(state: WorldState, resourceKind: string | null): ParcelId | null {
  const candidates = state.map.parcels
    .filter((p) => p.role === 'land' && p.ownerId === null)
    .filter((p) =>
      resourceKind
        ? p.resource.kind === resourceKind
        : extractionRecipeFor(p.resource.kind) !== null,
    )
    .map((p) => {
      const lot = state.auctionLots.find(
        (l) => l.parcelId.value === p.id.value && l.status === 'open',
      );
      return { parcel: p, lot };
    })
    .filter((c) => c.lot !== undefined)
    // 便宜優先，其次座標順序（決定性）
    .sort(
      (a, b) =>
        a.lot!.minPrice - b.lot!.minPrice || a.parcel.y - b.parcel.y || a.parcel.x - b.parcel.x,
    );
  return candidates[0]?.parcel.id ?? null;
}

/** 把庫存裡所有可販售品項賣給當日報價最佳的 NPC，回傳新狀態。 */
function sellInventory(state: WorldState): WorldState {
  let next = state;
  const playerId = next.localPlayerId;
  const holdings = getPlayerHoldings(next, playerId);
  const shipFrom = holdings[0];
  if (!shipFrom) {
    return next;
  }

  // 可販售品項，逐一處理
  const sellable = Object.values(ITEMS).filter((i) => i.sellable);
  for (const item of sellable) {
    // 同品項可能有多筆報價，挑淨單價最高的
    const offers = next.npcBuyOffers.filter((o) => o.itemId === item.id);
    if (offers.length === 0) {
      continue;
    }
    const best = offers
      .map((o) => ({ offer: o, quote: quoteSale(o, shipFrom) }))
      .sort((a, b) => b.quote.netPerUnit - a.quote.netPerUnit)[0];
    if (!best || best.quote.netPerUnit <= 0) {
      continue;
    }

    const qty = Math.min(
      getItemQty(next.inventories[playerId] ?? {}, item.id),
      best.offer.maxQuantity,
    );
    if (qty <= 0) {
      continue;
    }

    const shipped = resolveShipParcel(holdings, shipFrom) ?? shipFrom;
    next = applyWorldAction(next, {
      type: 'SELL_TO_NPC',
      offerId: best.offer.id,
      quantity: qty,
      shipFromParcelId: shipped.id,
    });
  }
  return next;
}

/** 目前每座完工工廠排定的配方，供測試與除錯檢視。 */
export function productionAssignments(state: WorldState): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, line] of Object.entries(state.productionLines)) {
    out[key] = line.recipeId;
  }
  return out;
}

/**
 * 為每座已完工但尚未排生產的工廠排入配方。
 *
 * `depth` 決定「除了第一座開採廠之外，其餘工廠要跑什麼」：
 * 依深度在可用的加工配方中，挑選**庫存原料足以支撐**且每週期毛利最高者。
 * 選不出來就退回開採，確保工廠不會閒置。
 */
export function startProductionEverywhere(
  state: WorldState,
  fallbackRecipe: RecipeId | null,
  depth: 0 | 1 | 2,
): WorldState {
  let next = state;
  const playerId = next.localPlayerId;
  const sites = Object.entries(next.sites).filter(
    ([, site]) => site.phase === 'complete' && site.ownerId === playerId,
  );

  // 第一座（依 key 排序，決定性）固定當開採廠，供應原料
  const producerKey = sites.map(([k]) => k).sort()[0];

  for (const [key, site] of sites) {
    if (next.productionLines[key]) {
      continue;
    }
    const parcel = next.map.parcels.find((p) => p.id.value === key);
    if (!parcel) {
      continue;
    }

    let recipeId: RecipeId | null = null;

    if (depth > 0 && key !== producerKey) {
      const stock = next.inventories[playerId] ?? {};
      const candidates = Object.values(RECIPES)
        .filter((r) => r.inputs.length > 0)
        .filter((r) => (r.stage === 'process' ? depth >= 1 : depth >= 2))
        .filter((r) => (r.buildings as readonly string[]).includes(site.factoryTypeId))
        .filter((r) => r.inputs.every((i) => getItemQty(stock, i.itemId) >= i.quantity))
        .map((r) => {
          const outVal = ITEMS[r.outputItemId].unitValue * r.outputQuantity * (r.outputMultiplier ?? 1);
          const inVal = r.inputs.reduce((s, i) => s + ITEMS[i.itemId].unitValue * i.quantity, 0);
          return { r, margin: outVal - inVal };
        })
        .sort((a, b) => b.margin - a.margin);
      recipeId = candidates[0]?.r.id ?? null;
    }

    recipeId ??= extractionRecipeFor(parcel.resource.kind) ?? fallbackRecipe;
    if (!recipeId) {
      continue;
    }
    const recipe = RECIPES[recipeId];
    if (!(recipe.buildings as readonly string[]).includes(site.factoryTypeId)) {
      // 開採配方在組裝廠也能跑；加工配方若廠型不符則退回開採
      const fallback = extractionRecipeFor(parcel.resource.kind) ?? fallbackRecipe;
      if (!fallback || !(RECIPES[fallback].buildings as readonly string[]).includes(site.factoryTypeId)) {
        continue;
      }
      recipeId = fallback;
    }
    next = applyWorldAction(next, { type: 'START_PRODUCTION', parcelId: parcel.id, recipeId });
  }
  return next;
}

export function runFullLoop(options: FullLoopOptions = {}): FullLoopResult {
  const config: WorldConfig = {
    ...DEFAULT_WORLD_CONFIG,
    mapWidth: options.mapWidth ?? DEFAULT_WORLD_CONFIG.mapWidth,
    mapHeight: options.mapHeight ?? DEFAULT_WORLD_CONFIG.mapHeight,
    startingCash: options.startingCash ?? DEFAULT_WORLD_CONFIG.startingCash,
    ...options.config,
  };
  const maxDays = options.maxDays ?? DEFAULT_SCENARIO.maxDays;
  const maxParcels = options.maxParcels ?? 1;
  const factoryTypeId = options.factoryTypeId ?? 'workshop';
  const buildCost = FACTORY_TYPES[factoryTypeId].buildCost;
  const buildTicks = FACTORY_TYPES[factoryTypeId].buildTimeTicks;

  let state = createInitialWorld(config);
  const days: FullLoopDay[] = [];
  const resourceKind = pickResourceKind(state, options.recipeId);

  const record = (): void => {
    const playerId = state.localPlayerId;
    const pnl = state.pnl[playerId] ?? emptyPnL();
    days.push({
      day: state.gameDay,
      cash: state.players[playerId]?.cash ?? 0,
      revenue: pnl.revenue,
      netProfit: netProfit(pnl),
      factories: countCompleteFactories(state, playerId),
      status: state.scenario.status,
    });
  };

  record();

  for (let day = 0; day < maxDays; day += 1) {
    // 1) 買地（現金要夠付底價 + 建廠成本）
    const owned = getPlayerHoldings(state, state.localPlayerId).length;
    if (owned < maxParcels) {
      const target = chooseParcelToBuy(state, resourceKind);
      if (target) {
        const lot = state.auctionLots.find(
          (l) => l.parcelId.value === target.value && l.status === 'open',
        );
        const cash = state.players[state.localPlayerId]?.cash ?? 0;
        if (lot && cash >= lot.minPrice + buildCost) {
          state = applyWorldAction(state, { type: 'BID', parcelId: target, amount: lot.minPrice });
          state = applyWorldAction(state, { type: 'SETTLE_AUCTION', parcelId: target });
        }
      }
    }

    // 2) 建廠（尚未有 site 的自有地塊）
    for (const parcel of getPlayerHoldings(state, state.localPlayerId)) {
      if (state.sites[parcel.id.value]) {
        continue;
      }
      if (parcel.state !== 'owned') {
        continue;
      }
      const cash = state.players[state.localPlayerId]?.cash ?? 0;
      if (cash < buildCost) {
        continue;
      }
      state = applyWorldAction(state, {
        type: 'START_BUILD',
        parcelId: parcel.id,
        factoryTypeId,
      });
    }

    // 3) 推進建造
    for (let i = 0; i < buildTicks; i += 1) {
      state = applyWorldAction(state, { type: 'ADVANCE_BUILD_TICK' });
    }

    // 4) 排生產
    state = startProductionEverywhere(state, options.recipeId ?? null, options.depth ?? 0);

    // 5) 推進生產
    state = applyWorldAction(state, { type: 'ADVANCE_PRODUCTION_TICK' });

    // 6) 賣出
    state = sellInventory(state);

    // 7) 結束本日（稅、維護、刷新 NPC 報價、通關判定）
    state = applyWorldAction(state, { type: 'ADVANCE_DAY' });

    record();

    if (state.scenario.status !== 'playing') {
      break;
    }
  }

  const playerId = state.localPlayerId;
  const pnl = state.pnl[playerId] ?? emptyPnL();
  const profit = netProfit(pnl);

  return {
    days,
    finalCash: state.players[playerId]?.cash ?? 0,
    pnl,
    netProfit: profit,
    status: state.scenario.status,
    ownedParcels: getPlayerHoldings(state, playerId).length,
    completeFactories: countCompleteFactories(state, playerId),
    scenarioTarget: DEFAULT_SCENARIO.targetNetProfit,
    maxDays,
    reachedTarget: profit >= DEFAULT_SCENARIO.targetNetProfit,
  };
}

/** 對照組：什麼都不做（不買地、不建廠、不生產、不銷售）。 */
export function runDoNothing(options: FullLoopOptions = {}): FullLoopResult {
  return runFullLoop({ ...options, maxParcels: 0 });
}

export { addPnL };
