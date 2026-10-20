import { describe, expect, it } from 'vitest';
import { getItemQty } from '../production/items.js';
import { applyWorldAction } from '../world/reducer.js';
import { createInitialWorld } from '../world/create-world.js';
import { buildNpcDeals } from './deals.js';
import { NPC_BLOCK_CAP, npcBlockCount } from './expand.js';

describe('NPC', () => {
  it('開局有原料商、港區收購和在城裡的掌櫃', () => {
    const state = createInitialWorld();
    const deals = state.npcDeals ?? [];
    expect(deals.some((deal) => deal.npcId === 'zhou-liao' && deal.side === 'npc-sells')).toBe(true);
    expect(deals.some((deal) => deal.npcId === 'shen-bu' && deal.side === 'npc-buys')).toBe(true);
    expect(deals.filter((deal) => deal.npcId === 'jiang-bei')).toHaveLength(1);
  });

  it('向周料買原料會扣現金並入庫，現金不夠則不動', () => {
    const state = createInitialWorld({ startingCash: 100_000 });
    const deal = (state.npcDeals ?? []).find((item) => item.npcId === 'zhou-liao')!;
    const next = applyWorldAction(state, { type: 'ACCEPT_NPC_DEAL', dealId: deal.id });
    expect(next.players[state.localPlayerId]!.cash).toBe(100_000 - deal.unitPrice * deal.quantity);
    expect(getItemQty(next.inventories[state.localPlayerId] ?? {}, deal.itemId)).toBeGreaterThan(
      getItemQty(state.inventories[state.localPlayerId] ?? {}, deal.itemId),
    );
    expect(next.npcDeals?.some((item) => item.id === deal.id)).toBe(false);

    const broke = { ...state, players: { ...state.players, [state.localPlayerId]: { ...state.players[state.localPlayerId]!, cash: 1 } } };
    expect(applyWorldAction(broke, { type: 'ACCEPT_NPC_DEAL', dealId: deal.id })).toBe(broke);
  });

  it('賣給掌櫃會入帳，庫存不足則不成交', () => {
    let state = createInitialWorld({ startingCash: 10_000 });
    const deal = (state.npcDeals ?? []).find((item) => item.side === 'npc-buys' && item.npcId !== 'shen-bu')!;
    expect(applyWorldAction(state, { type: 'ACCEPT_NPC_DEAL', dealId: deal.id })).toBe(state);
    state = {
      ...state,
      inventories: {
        ...state.inventories,
        [state.localPlayerId]: { [deal.itemId]: deal.quantity },
      },
    };
    const next = applyWorldAction(state, { type: 'ACCEPT_NPC_DEAL', dealId: deal.id });
    expect(next.players[state.localPlayerId]!.cash).toBe(10_000 + deal.unitPrice * deal.quantity);
    expect(next.pnl[state.localPlayerId]!.revenue).toBe(deal.unitPrice * deal.quantity);
  });

  it('掌櫃每天在自己城邊占一塊商業地，不動玩家現金，也不搶已出價的地', () => {
    const state = createInitialWorld({ startingCash: 100_000 });
    const cash = state.players[state.localPlayerId]!.cash;
    const city = state.map.cities.find((item) => item.id === 'xiwan')!;
    const nearest = state.map.parcels
      .filter((parcel) => parcel.role === 'land' && parcel.ownerId === null)
      .sort(
        (a, b) =>
          Math.abs(a.x - city.x) + Math.abs(a.y - city.y) - (Math.abs(b.x - city.x) + Math.abs(b.y - city.y)) ||
          a.y - b.y ||
          a.x - b.x,
      )[0]!;
    const lot = state.auctionLots.find((item) => item.parcelId.value === nearest.id.value)!;
    const bid = applyWorldAction(state, { type: 'BID', parcelId: nearest.id, amount: lot.minPrice });
    const expanded = applyWorldAction(state, { type: 'ADVANCE_DAY' });
    expect(npcBlockCount(expanded, 'jiang-bei')).toBe(1);
    expect(npcBlockCount(expanded, 'lin-kou')).toBe(1);
    expect(npcBlockCount(expanded, 'he-zhan')).toBe(1);
    expect(expanded.players[state.localPlayerId]!.cash - cash).toBe(500);
    const guarded = applyWorldAction(bid, { type: 'ADVANCE_DAY' });
    expect(guarded.map.parcels.find((parcel) => parcel.id.value === nearest.id.value)?.ownerId).toBeNull();
    expect(npcBlockCount(guarded, 'jiang-bei')).toBe(1);
  });

  it('商業版圖有上限', () => {
    let state = createInitialWorld();
    for (let day = 0; day < NPC_BLOCK_CAP + 2; day += 1) {
      state = applyWorldAction(state, { type: 'ADVANCE_DAY' });
    }
    expect(npcBlockCount(state, 'jiang-bei')).toBe(NPC_BLOCK_CAP);
  });

  it('換日會換成另一筆貨', () => {
    const cities = createInitialWorld().map.cities;
    const today = buildNpcDeals(cities, 0)[0]!;
    const tomorrow = buildNpcDeals(cities, 1)[0]!;
    expect(tomorrow.itemId).not.toBe(today.itemId);
  });
});
