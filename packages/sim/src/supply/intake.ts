import { COMMODITIES } from '../bank/catalog.js';
import { getPlayerBank } from '../bank/logic.js';
import type { CommodityHolding, CommodityId } from '../bank/types.js';
import { addItem, type ItemId } from '../production/items.js';
import type { WorldState } from '../world/state.js';

/**
 * 一手大宗換成 1 單位產線原料。
 * 市價一手高於自己開採一單位的名目價值，礦脈沒了才值得買。
 */
export const COMMODITY_INTAKE: Partial<
  Record<CommodityId, { readonly itemId: ItemId; readonly unitsPerItem: number }>
> = {
  coal: { itemId: 'coal', unitsPerItem: 20 },
  copper: { itemId: 'copper-ore', unitsPerItem: 10 },
};

export function validateWithdrawCommodity(
  state: WorldState,
  commodityId: CommodityId,
  lots: number,
): { ok: boolean; reason?: string } {
  const intake = COMMODITY_INTAKE[commodityId];
  if (!intake) {
    return { ok: false, reason: '這個大宗不能提領成產線原料' };
  }
  if (!Number.isInteger(lots) || lots <= 0) {
    return { ok: false, reason: '手數須為正整數' };
  }
  const player = state.players[state.localPlayerId];
  if (!player) {
    return { ok: false, reason: '找不到玩家' };
  }
  const def = COMMODITIES[commodityId];
  const holding = getPlayerBank(state, player.id).commodities.find(
    (item) => item.commodityId === commodityId,
  );
  if (!holding || holding.units < def.lotSize * lots) {
    return { ok: false, reason: '大宗庫存不足' };
  }
  return { ok: true };
}

export function applyWithdrawCommodity(
  state: WorldState,
  commodityId: CommodityId,
  lots: number,
): WorldState {
  if (!validateWithdrawCommodity(state, commodityId, lots).ok) {
    return state;
  }
  const intake = COMMODITY_INTAKE[commodityId]!;
  const player = state.players[state.localPlayerId]!;
  const def = COMMODITIES[commodityId];
  const book = getPlayerBank(state, player.id);
  const current = book.commodities.find((item) => item.commodityId === commodityId)!;
  const units = def.lotSize * lots;
  const nextUnits = current.units - units;
  const holding: CommodityHolding | null =
    nextUnits > 0 ? { commodityId, units: nextUnits, avgCost: current.avgCost } : null;
  const commodities = book.commodities.filter((item) => item.commodityId !== commodityId);
  const items = Math.floor(units / intake.unitsPerItem);
  return {
    ...state,
    bank: {
      ...state.bank,
      [player.id]: {
        ...book,
        commodities: holding ? [...commodities, holding] : commodities,
      },
    },
    inventories: {
      ...state.inventories,
      [player.id]: addItem(state.inventories[player.id] ?? {}, intake.itemId, items),
    },
  };
}
