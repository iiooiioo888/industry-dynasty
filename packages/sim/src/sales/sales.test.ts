import { describe, expect, it } from 'vitest';
import { parcelIdFromCoords } from '../types/map.js';
import { SIM_MS_PER_TICK } from '../world/clock.js';
import { generateParcelResource } from '../world/parcel-resources.js';
import { applyWorldAction } from '../world/reducer.js';
import { createInitialWorld } from '../world/create-world.js';
import { listShipments } from '../world/shipments.js';
import { emptyPnL, netProfit } from './pnl.js';
import { quoteSale, TRANSPORT_RATE_PER_TILE } from './sell-logic.js';
import { generateNpcBuyOffers, manhattanToMarket } from './market.js';
import { getItemQty } from '../production/items.js';

function parcelAt(x: number, y: number) {
  return {
    id: parcelIdFromCoords(x, y),
    x,
    y,
    state: 'owned' as const,
    ownerId: 'player-1',
    resource: generateParcelResource(x, y),
    role: 'land' as const,
    populationDensity: 20,
    roadAccess: 0.4,
    cityProximity: 0.2,
    nearestCityName: null,
    nearestCityDistance: 4,
  };
}

describe('銷售與運輸', () => {
  it('距離市場越遠運輸成本越高、淨單價越低', () => {
    const offer = generateNpcBuyOffers(1)[2];
    const near = quoteSale(offer, parcelAt(14, 10));
    const far = quoteSale(offer, parcelAt(0, 0));
    expect(manhattanToMarket(parcelAt(0, 0))).toBeGreaterThan(manhattanToMarket(parcelAt(14, 10)));
    expect(far.transportPerUnit).toBeGreaterThan(near.transportPerUnit);
    expect(far.netPerUnit).toBeLessThan(near.netPerUnit);
  });

  it('最遠角土地仍可售出樹脂（港價 + 貨值加權運輸）', () => {
    const offer = generateNpcBuyOffers(0).find((o) => o.itemId === 'resin')!;
    const far = quoteSale(offer, parcelAt(0, 0));
    expect(far.netPerUnit).toBeGreaterThan(0);
  });

  it('遠距土地可透過 reducer 完成 NPC 銷售', () => {
    let state = createInitialWorld();
    const parcelId = parcelIdFromCoords(0, 0);
    const lot = state.auctionLots.find((l) => l.parcelId.value === parcelId.value)!;
    state = applyWorldAction(state, { type: 'BID', parcelId, amount: lot.minPrice });
    state = applyWorldAction(state, { type: 'SETTLE_AUCTION', parcelId });

    const offer = state.npcBuyOffers.find((o) => o.itemId === 'raw-ore')!;
    const parcel = state.map.parcels.find((item) => item.id.value === parcelId.value)!;
    const quote = quoteSale(offer, parcel);
    const cashBefore = state.players['player-1'].cash;

    const departed = applyWorldAction(state, {
      type: 'SELL_TO_NPC',
      offerId: offer.id,
      quantity: 2,
      shipFromParcelId: parcelId,
    });

    expect(getItemQty(departed.inventories['player-1'], 'raw-ore')).toBe(22);
    expect(departed.players['player-1'].cash).toBe(cashBefore);
    expect(departed.pnl['player-1'].revenue).toBe(0);
    expect(listShipments(departed)).toHaveLength(1);

    const notOwned = applyWorldAction(departed, {
      type: 'SELL_TO_NPC',
      offerId: offer.id,
      quantity: 1,
      shipFromParcelId: parcelIdFromCoords(3, 3),
    });
    expect(notOwned).toBe(departed);

    state = departed;
    for (let step = 0; step < 80 && listShipments(state).length > 0; step += 1) {
      state = applyWorldAction(state, { type: 'ADVANCE_SIM_TIME', deltaMs: SIM_MS_PER_TICK });
    }
    expect(listShipments(state)).toHaveLength(0);
    expect(state.pnl['player-1'].revenue).toBe(quote.hubUnitPrice * 2);
    expect(state.pnl['player-1'].transportCost).toBe(quote.transportPerUnit * 2);
  });

  it('賣給 NPC 會扣庫存並記帳收入與運輸', () => {
    let state = createInitialWorld();
    const offer = state.npcBuyOffers.find((o) => o.itemId === 'basic-part')!;
    const parcelId = parcelIdFromCoords(15, 11);
    const lot = state.auctionLots.find((l) => l.parcelId.value === parcelId.value)!;
    state = applyWorldAction(state, { type: 'BID', parcelId, amount: lot.minPrice });
    state = applyWorldAction(state, { type: 'SETTLE_AUCTION', parcelId });

    const stock = { ...state.inventories['player-1'], 'basic-part': 5 };
    state = { ...state, inventories: { 'player-1': stock } };

    const parcel = state.map.parcels.find((item) => item.id.value === parcelId.value)!;
    const quote = quoteSale(offer, parcel);
    const cashAtDepart = state.players['player-1'].cash;
    state = applyWorldAction(state, {
      type: 'SELL_TO_NPC',
      offerId: offer.id,
      quantity: 2,
      shipFromParcelId: parcelId,
    });

    expect(getItemQty(state.inventories['player-1'], 'basic-part')).toBe(3);
    expect(state.players['player-1'].cash).toBe(cashAtDepart);
    expect(listShipments(state)[0]?.travelTicks).toBeGreaterThan(0);

    for (let step = 0; step < 8 && listShipments(state).length > 0; step += 1) {
      state = applyWorldAction(state, { type: 'ADVANCE_SIM_TIME', deltaMs: SIM_MS_PER_TICK });
    }

    expect(listShipments(state)).toHaveLength(0);
    expect(state.pnl['player-1'].revenue).toBe(quote.hubUnitPrice * 2);
    expect(state.pnl['player-1'].transportCost).toBe(quote.transportPerUnit * 2);
    expect(state.players['player-1'].cash).toBe(cashAtDepart + quote.netPerUnit * 2);
  });
});

describe('損益與通關', () => {
  it('淨利計算包含稅收與運輸', () => {
    const pnl = {
      revenue: 10_000,
      landSaleProceeds: 0,
      taxPaid: 1_500,
      maintenance: 400,
      transportCost: 800,
      auctionSpend: 2_000,
      buildSpend: 5_000,
      productionIdleLoss: 200,
    };
    expect(netProfit(pnl)).toBe(100);
  });

  it('土地轉手收入計入淨利', () => {
    const pnl = { ...emptyPnL(), landSaleProceeds: 2_500 };
    expect(netProfit(pnl)).toBe(2_500);
  });

  it('推進日數會刷新 NPC 收購價', () => {
    let state = createInitialWorld();
    const day1 = state.npcBuyOffers[0].unitPrice;
    state = applyWorldAction(state, { type: 'ADVANCE_DAY' });
    expect(state.gameDay).toBe(1);
    const day2 = state.npcBuyOffers[0].unitPrice;
    expect(day2).toBeDefined();
    expect(day1).toBeDefined();
  });
});

describe('運輸常數', () => {
  it('TRANSPORT_RATE_PER_TILE 已自 8 調降', () => {
    expect(TRANSPORT_RATE_PER_TILE).toBe(3);
  });
});
