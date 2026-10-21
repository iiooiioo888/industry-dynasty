import { describe, expect, it } from 'vitest';
import { applyWorldAction } from '../world/reducer.js';
import { createInitialWorld } from '../world/create-world.js';
import { findOpenLotForParcel, getPlayerHoldings, type WorldState } from '../world/state.js';
import { FACTORY_TYPES } from '../buildings/catalog.js';
import { extractionRecipeFor } from '../production/planning.js';
import { RECIPES } from '../production/recipes.js';
import { getItemQty, ITEMS } from '../production/items.js';
import { netProfit } from '../sales/pnl.js';
import { craftedValue } from '../production/chain.js';
import { stageWorldConfig } from '../world/config.js';
import { stageById } from '../balance/stages.js';
import { quoteSale } from '../sales/sell-logic.js';

/**
 * 端到端可玩性驗證。
 *
 * 先前的測試都是「測一個模組」或「用報表 harness 跑模擬」。
 * 這個測試不一樣：它**只用玩家真的能做的動作**（`applyWorldAction`），
 * 把一局從頭打到通關 —— 和 UI 走的是同一條路徑。
 *
 * 目的是抓「每個元件各自能動，但串起來玩不通」的問題。
 */
const STAGE_ID = 'stage-01';

/**
 * 賣掉多餘的貨，但**保留產線正在用的原料**。
 *
 * 這是玩家真正會做的事：加工廠吃鐵與樹脂，把原料全賣掉產線就停了。
 * 第一版腳本把原料也賣光，結果整局加工產值為 0 —— 那不是遊戲的問題，
 * 是「無腦全賣」本來就不該可行。
 */
function sellSurplus(state: WorldState): WorldState {
  let next = state;
  const playerId = next.localPlayerId;
  const holdings = getPlayerHoldings(next, playerId);
  const shipFrom = holdings[0];
  if (!shipFrom) {
    return next;
  }

  // 產線在用哪些原料、各要多少
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
    const keep = reserve[item.id] ?? 0;
    const quantity = Math.min(Math.max(0, held - keep), best.offer.maxQuantity);
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

describe('端到端可玩性', () => {
  it('只用玩家的動作就能從開局打到第一關通關', () => {
    const stage = stageById(STAGE_ID)!;
    const budget = 900_000;
    let state = createInitialWorld({ ...stageWorldConfig(STAGE_ID), startingCash: budget });

    // 這一段模擬「看懂了第一關該怎麼打」的玩家：
    // 一塊鐵脈、一塊樹脂沼、一塊拿來加工 —— 這是 `make-basic-part` 的最小組合。
    const wanted: Array<'iron-vein' | 'resin-bog' | 'any'> = ['iron-vein', 'resin-bog', 'any'];
    const bought: Array<{ key: string; kind: string }> = [];
    for (const want of wanted) {
      const parcel = state.map.parcels
        .filter((p) => p.role === 'land' && p.ownerId === null)
        .filter((p) => findOpenLotForParcel(state, p.id) !== undefined)
        .find((p) => (want === 'any' ? true : p.resource.kind === want));
      if (!parcel) {
        continue;
      }
      const lot = findOpenLotForParcel(state, parcel.id)!;
      state = applyWorldAction(state, { type: 'BID', parcelId: parcel.id, amount: lot.minPrice });
      state = applyWorldAction(state, { type: 'SETTLE_AUCTION', parcelId: parcel.id });
      if (state.map.parcels.find((p) => p.id.value === parcel.id.value)?.ownerId) {
        bought.push({ key: parcel.id.value, kind: parcel.resource.kind });
      }
    }
    expect(bought.length, '一塊地都標不到，遊戲無法開始').toBe(3);

    // 三塊地各蓋一座工坊（第一關不需要材料）
    for (const { key } of bought) {
      state = applyWorldAction(state, {
        type: 'START_BUILD',
        parcelId: { value: key } as never,
        factoryTypeId: 'workshop',
      });
    }
    // 建造需要時間 —— 用公開動作推進
    for (let i = 0; i < 60; i += 1) {
      state = applyWorldAction(state, { type: 'ADVANCE_BUILD_TICK' });
    }

    const completeSites = Object.entries(state.sites).filter(
      ([, site]) => site.phase === 'complete',
    );
    expect(completeSites.length, '工坊沒有完工').toBeGreaterThanOrEqual(3);

    // 分工：鐵脈開採、樹脂沼開採、第三塊專門壓製基礎零件。
    // 每塊地都有礦脈，所以不能「有礦脈就開採」——那樣永遠沒人加工。
    let assigned = 0;
    for (const [parcelKey, site] of completeSites) {
      if (site.phase !== 'complete') {
        continue;
      }
      const parcel = state.map.parcels.find((p) => p.id.value === parcelKey);
      if (!parcel) {
        continue;
      }
      const extraction = extractionRecipeFor(parcel.resource.kind);
      const recipeId = assigned < 2 && extraction ? extraction : 'make-basic-part';
      state = applyWorldAction(state, {
        type: 'START_PRODUCTION',
        parcelId: parcel.id,
        recipeId,
      });
      assigned += 1;
    }

    // 逐日經營：推進模擬時鐘（和 UI 一樣走 ADVANCE_SIM_TIME）→ 賣掉多餘的貨。
    // 一天 48 刻，每刻推進一次；日結會在跨日時自動發生。
    const TICKS_PER_DAY = 48;
    for (let day = 0; day < stage.maxDays; day += 1) {
      if (state.scenario.status !== 'playing') {
        break;
      }
      for (let tick = 0; tick < TICKS_PER_DAY; tick += 1) {
        state = applyWorldAction(state, { type: 'ADVANCE_SIM_TIME', deltaMs: 1000 });
      }
      state = sellSurplus(state);
    }

    const profit = netProfit(state.pnl[state.localPlayerId]);
    const crafted = craftedValue(state.craftedTotals[state.localPlayerId]);

    // 這局的目標是「至少玩得下去」：要有產出、有現金流、沒有卡死
    expect(crafted, '整局沒有任何加工產值 —— 生產鏈沒有跑起來').toBeGreaterThan(0);
    expect(state.gameDay).toBeGreaterThan(0);
    expect(Number.isFinite(profit)).toBe(true);
    // 正確打法（一鐵一樹脂一加工）應該真的通關，而不是只有「沒卡死」
    expect(
      state.scenario.status,
      `正確配置下應該通關，實際 profit=${Math.round(profit)} crafted=${crafted}`,
    ).toBe('won');

    // 第一關的完整通關需要更好的配置；這裡要求至少達到「有在賺錢」
    expect(
      profit,
      `打了 ${state.gameDay} 天卻沒有正報酬（${Math.round(profit)}）—— 遊戲不可玩`,
    ).toBeGreaterThan(0);
  }, 120_000);

  /**
   * 盲目擴張的陷阱（設計上的，不是 bug）。
   *
   * 「多買地、多挖礦」是新手最直覺的策略，但實測會虧錢：
   * 六塊地的土地稅與維護，加上只賣原料的薄利，撐不起固定成本。
   *
   * 這條測試把「虧錢」固定下來 —— 如果哪天它變成賺錢，
   * 就代表純開採路線被改強了，`docs/stage-curve.md` 的結論要重算。
   */
  it('盲目擴張（六塊地純開採）會虧錢 —— 這是設計上的陷阱', () => {
    const stage = stageById(STAGE_ID)!;
    let state = createInitialWorld({ ...stageWorldConfig(STAGE_ID), startingCash: 900_000 });
    const parcels = state.map.parcels
      .filter((p) => p.role === 'land' && p.ownerId === null)
      .filter((p) => findOpenLotForParcel(state, p.id) !== undefined)
      .slice(0, 6);
    for (const parcel of parcels) {
      const lot = findOpenLotForParcel(state, parcel.id)!;
      state = applyWorldAction(state, { type: 'BID', parcelId: parcel.id, amount: lot.minPrice });
      state = applyWorldAction(state, { type: 'SETTLE_AUCTION', parcelId: parcel.id });
      state = applyWorldAction(state, {
        type: 'START_BUILD',
        parcelId: parcel.id,
        factoryTypeId: 'workshop',
      });
    }
    for (let i = 0; i < 60; i += 1) {
      state = applyWorldAction(state, { type: 'ADVANCE_BUILD_TICK' });
    }
    for (const [parcelKey, site] of Object.entries(state.sites)) {
      if (site.phase !== 'complete') {
        continue;
      }
      const parcel = state.map.parcels.find((p) => p.id.value === parcelKey);
      if (!parcel) {
        continue;
      }
      const recipeId = extractionRecipeFor(parcel.resource.kind);
      if (!recipeId) {
        continue;
      }
      state = applyWorldAction(state, {
        type: 'START_PRODUCTION',
        parcelId: parcel.id,
        recipeId,
      });
    }
    // 雇技師（UI 也做得到）
    state = applyWorldAction(state, { type: 'HIRE_STAFF', role: 'operator', count: 3 });

    for (let day = 0; day < stage.maxDays; day += 1) {
      state = sellSurplus(state);
      state = applyWorldAction(state, { type: 'ADVANCE_DAY' });
    }

    const profit = netProfit(state.pnl[state.localPlayerId]);
    const crafted = craftedValue(state.craftedTotals[state.localPlayerId]);
    expect(state.scenario.status).toBe('lost');
    expect(crafted, '純開採不該有加工產值').toBe(0);
    expect(
      profit,
      `純開採竟然賺錢（${Math.round(profit)}）—— 純開採路線被改強了，需要重算平衡`,
    ).toBeLessThan(0);
    expect(FACTORY_TYPES.workshop.nameZh.length).toBeGreaterThan(0);
  }, 120_000);
});
