import { applyWorldAction } from '../world/reducer.js';
import { createInitialWorld } from '../world/create-world.js';
import { findOpenLotForParcel, getPlayerHoldings, type WorldState } from '../world/state.js';
import { getItemQty, ITEMS } from '../production/items.js';
import { RECIPES } from '../production/recipes.js';
import { extractionRecipeFor } from '../production/planning.js';
import { quoteSale } from '../sales/sell-logic.js';
import { netProfit } from '../sales/pnl.js';
import { craftedValue } from '../production/chain.js';
import { stageWorldConfig } from '../world/config.js';
import { BUILD_MATERIALS } from '../buildings/materials.js';
import type { StageDef } from '../balance/stages.js';

/**
 * 用**玩家真的能做的動作**跑完一關。
 *
 * 這是端到端驗證的核心：不碰 `reports/full-loop.ts`（那是有特權的量測 harness），
 * 只用 `applyWorldAction` —— 和 UI 呼叫的是同一個 reducer。
 *
 * 策略刻意做得「像懂遊戲的人」而不是「像最優解」：
 * - 買到建議規模的地塊
 * - 依建議深度決定要不要蓋組裝廠
 * - 每天推進 48 刻（和 UI 時鐘一致）、賣掉多餘的貨、留下產線要用的原料
 */
export interface PlayResult {
  readonly stageId: string;
  readonly status: WorldState['scenario']['status'];
  readonly gameDay: number;
  readonly profit: number;
  readonly crafted: number;
  readonly parcels: number;
  readonly factories: number;
}

const TICKS_PER_DAY = 48;

/** 賣掉多餘的貨，保留產線與建廠要用的原料。 */
function sellSurplus(state: WorldState): WorldState {
  let next = state;
  const playerId = next.localPlayerId;
  const shipFrom = getPlayerHoldings(next, playerId)[0];
  if (!shipFrom) {
    return next;
  }

  const reserve: Record<string, number> = {};
  for (const line of Object.values(next.productionLines)) {
    const recipe = RECIPES[line.recipeId];
    if (!recipe) {
      continue;
    }
    for (const input of recipe.inputs) {
      reserve[input.itemId] = (reserve[input.itemId] ?? 0) + input.quantity * 4;
    }
  }
  // 還沒蓋滿的建築材料也先留著
  for (const materials of Object.values(BUILD_MATERIALS)) {
    for (const material of materials) {
      reserve[material.itemId] = Math.max(reserve[material.itemId] ?? 0, material.quantity * 2);
    }
  }

  for (const item of Object.values(ITEMS)) {
    if (!item.sellable) {
      continue;
    }
    const offers = next.npcBuyOffers.filter((offer) => offer.itemId === item.id);
    if (offers.length === 0) {
      continue;
    }
    const best = offers
      .map((offer) => ({ offer, quote: quoteSale(offer, shipFrom) }))
      .sort((a, b) => b.quote.netPerUnit - a.quote.netPerUnit)[0];
    if (!best || best.quote.netPerUnit <= 0) {
      continue;
    }
    const held = getItemQty(next.inventories[playerId] ?? {}, item.id);
    const quantity = Math.min(Math.max(0, held - (reserve[item.id] ?? 0)), best.offer.maxQuantity);
    if (quantity <= 0) {
      continue;
    }
    next = applyWorldAction(next, {
      type: 'SELL_TO_NPC',
      offerId: best.offer.id,
      quantity,
      shipFromParcelId: shipFrom.id,
    });
  }
  return next;
}

/** 標地 + 蓋廠；回傳新狀態。 */
function acquireAndBuild(state: WorldState, stage: StageDef): WorldState {
  let next = state;
  // 先挑礦脈種類齊全的地，再補齊規模
  const wantedKinds = ['iron-vein', 'resin-bog', 'quartz-sand', 'coal-seam', 'copper-shale'];
  const picked: string[] = [];
  const candidates = () =>
    next.map.parcels.filter(
      (p) =>
        p.role === 'land' && p.ownerId === null && findOpenLotForParcel(next, p.id) !== undefined,
    );

  for (const kind of wantedKinds) {
    if (picked.length >= stage.recommendedParcels) {
      break;
    }
    const parcel = candidates().find((p) => p.resource.kind === kind);
    if (!parcel) {
      continue;
    }
    const lot = findOpenLotForParcel(next, parcel.id)!;
    next = applyWorldAction(next, { type: 'BID', parcelId: parcel.id, amount: lot.minPrice });
    next = applyWorldAction(next, { type: 'SETTLE_AUCTION', parcelId: parcel.id });
    if (next.map.parcels.find((p) => p.id.value === parcel.id.value)?.ownerId) {
      picked.push(parcel.id.value);
    }
  }
  while (picked.length < stage.recommendedParcels) {
    const parcel = candidates()[0];
    if (!parcel) {
      break;
    }
    const lot = findOpenLotForParcel(next, parcel.id)!;
    next = applyWorldAction(next, { type: 'BID', parcelId: parcel.id, amount: lot.minPrice });
    next = applyWorldAction(next, { type: 'SETTLE_AUCTION', parcelId: parcel.id });
    if (!next.map.parcels.find((p) => p.id.value === parcel.id.value)?.ownerId) {
      break;
    }
    picked.push(parcel.id.value);
  }

  // 全部先蓋工坊（工坊不需要材料）
  for (const key of picked) {
    next = applyWorldAction(next, {
      type: 'START_BUILD',
      parcelId: { value: key } as never,
      factoryTypeId: 'workshop',
    });
  }
  for (let i = 0; i < 80; i += 1) {
    next = applyWorldAction(next, { type: 'ADVANCE_BUILD_TICK' });
  }
  return next;
}

/** 開產線：開採 + 加工（＋深加工時組裝廠）。 */
function startLines(state: WorldState, stage: StageDef): WorldState {
  let next = state;
  const keys = Object.entries(next.sites)
    .filter(([, site]) => site.phase === 'complete')
    .map(([key]) => key);

  let extractors = 0;
  for (const key of keys) {
    const parcel = next.map.parcels.find((p) => p.id.value === key);
    if (!parcel) {
      continue;
    }
    if (extractors < stage.recommendedExtractors) {
      const extraction = extractionRecipeFor(parcel.resource.kind);
      if (extraction) {
        next = applyWorldAction(next, {
          type: 'START_PRODUCTION',
          parcelId: parcel.id,
          recipeId: extraction,
        });
        extractors += 1;
        continue;
      }
    }
    next = applyWorldAction(next, {
      type: 'START_PRODUCTION',
      parcelId: parcel.id,
      recipeId: 'make-basic-part',
    });
  }
  return next;
}

export interface PlayOptions {
  /**
   * 打滿整個天數上限，即使中途通關也不停。
   *
   * 校準用：要知道「這一關的天數預算內，玩家最多能做到多少」，
   * 就不能讓它在通關那一刻停下來。
   */
  readonly playFullHorizon?: boolean;
}

export function playStage(stage: StageDef, options: PlayOptions = {}): PlayResult {
  // 用關卡**原始**起始資金 —— 加錢會讓每關都變成兩天速通，那就不是驗證了。
  let state = createInitialWorld(stageWorldConfig(stage.id));

  // 有些關卡需要先做出零件才能蓋組裝廠，所以先跑幾天然後再補建
  state = acquireAndBuild(state, stage);
  state = startLines(state, stage);

  for (let day = 0; day < stage.maxDays; day += 1) {
    if (!options.playFullHorizon && state.scenario.status !== 'playing') {
      break;
    }
    for (let tick = 0; tick < TICKS_PER_DAY; tick += 1) {
      state = applyWorldAction(state, { type: 'ADVANCE_SIM_TIME', deltaMs: 1000 });
    }
    state = sellSurplus(state);
  }

  const playerId = state.localPlayerId;
  return {
    stageId: stage.id,
    status: state.scenario.status,
    gameDay: state.gameDay,
    profit: Math.round(netProfit(state.pnl[playerId])),
    crafted: Math.round(craftedValue(state.craftedTotals[playerId])),
    parcels: getPlayerHoldings(state, playerId).length,
    factories: Object.entries(state.sites).filter(
      ([, site]) => site.phase === 'complete' && site.ownerId === playerId,
    ).length,
  };
}
