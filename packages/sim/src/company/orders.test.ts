import { describe, expect, it } from 'vitest';
import { ITEMS } from '../production/items.js';
import { generateNpcBuyOffers } from '../sales/market.js';
import { parcelIdFromCoords } from '../types/map.js';
import { applyWorldAction } from '../world/reducer.js';
import { createInitialWorld } from '../world/create-world.js';
import { findOpenLotForParcel } from '../world/state.js';
import { rawPortMultiplier, readCommerce } from '../commerce/logic.js';
import { CITY_ORDER_PAY_RATE, listCityOrders } from './orders.js';

function ownLand(x: number, y: number) {
  let state = createInitialWorld({ startingCash: 80_000 });
  const parcelId = parcelIdFromCoords(x, y);
  const lot = findOpenLotForParcel(state, parcelId)!;
  state = applyWorldAction(state, { type: 'BID', parcelId, amount: lot.minPrice });
  state = applyWorldAction(state, { type: 'SETTLE_AUCTION', parcelId });
  return { state, parcelId };
}

describe('城市供貨', () => {
  it('每座城市每天一張單，換日換品，不改港區牌價', () => {
    const state = createInitialWorld();
    const orders = listCityOrders(state);
    expect(orders).toHaveLength(state.map.cities.length);
    expect(new Set(orders.map((order) => order.cityId)).size).toBe(orders.length);
    expect(orders.every((order) => order.unitPay === Math.floor(ITEMS[order.itemId].unitValue * CITY_ORDER_PAY_RATE))).toBe(
      true,
    );
    const next = applyWorldAction(state, { type: 'ADVANCE_DAY' });
    expect(next.npcBuyOffers).toEqual(
      generateNpcBuyOffers(next.gameDay, {
        rawPriceMul: rawPortMultiplier(readCommerce(next).events),
      }),
    );
    expect(listCityOrders(next)[0]?.itemId).not.toBe(orders[0]?.itemId);
  });

  it('從自有地交貨入帳，超量、沒貨或別人的地都不動', () => {
    const land = createInitialWorld().map.parcels.find((parcel) => parcel.role === 'land')!;
    const owned = ownLand(land.x, land.y);
    const order = listCityOrders(owned.state).find((entry) => entry.itemId === 'raw-ore' || entry.itemId === 'resin');
    expect(order).toBeDefined();
    const beforeOffers = owned.state.npcBuyOffers;
    const filled = applyWorldAction(owned.state, {
      type: 'FILL_CITY_ORDER',
      orderId: order!.id,
      quantity: 1,
      shipFromParcelId: owned.parcelId,
    });
    expect(filled.players['player-1']!.cash - owned.state.players['player-1']!.cash).toBe(order!.unitPay);
    expect(filled.pnl['player-1']!.revenue).toBe(order!.unitPay);
    expect(listCityOrders(filled).find((entry) => entry.id === order!.id)?.filled).toBe(1);
    expect(filled.npcBuyOffers).toEqual(beforeOffers);

    const tooMuch = applyWorldAction(filled, {
      type: 'FILL_CITY_ORDER',
      orderId: order!.id,
      quantity: order!.quantity,
      shipFromParcelId: owned.parcelId,
    });
    expect(tooMuch).toBe(filled);

    const stranger = createInitialWorld();
    const blocked = applyWorldAction(stranger, {
      type: 'FILL_CITY_ORDER',
      orderId: listCityOrders(stranger)[0]!.id,
      quantity: 1,
      shipFromParcelId: land.id,
    });
    expect(blocked).toBe(stranger);
  });
});
