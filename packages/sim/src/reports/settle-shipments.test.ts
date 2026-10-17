import { describe, expect, it } from 'vitest';
import { parcelIdFromCoords } from '../types/map.js';
import { applyWorldAction } from '../world/reducer.js';
import { createInitialWorld } from '../world/create-world.js';
import { listShipments } from '../world/shipments.js';
import { recognizeDispatchedShipments } from './settle-shipments.js';

describe('量測迴圈的出貨入帳', () => {
  it('入帳後現金增加，但模擬時鐘與已結日界保持不動', () => {
    let state = createInitialWorld({ startingCash: 100_000 });
    const parcelId = parcelIdFromCoords(4, 4);
    const lot = state.auctionLots.find((item) => item.parcelId.value === parcelId.value)!;
    state = applyWorldAction(state, { type: 'BID', parcelId, amount: lot.minPrice });
    state = applyWorldAction(state, { type: 'SETTLE_AUCTION', parcelId });
    const offer = state.npcBuyOffers.find((item) => item.itemId === 'raw-ore')!;
    const cashAtDepart = state.players['player-1']!.cash;
    const clock = state.clock;
    const scenario = state.scenario;

    state = applyWorldAction(state, {
      type: 'SELL_TO_NPC',
      offerId: offer.id,
      quantity: 2,
      shipFromParcelId: parcelId,
    });
    expect(listShipments(state)).toHaveLength(1);
    expect(state.players['player-1']!.cash).toBe(cashAtDepart);
    expect(state.pnl['player-1']?.revenue ?? 0).toBe(0);

    const recognized = recognizeDispatchedShipments(state);
    expect(listShipments(recognized)).toHaveLength(0);
    expect(recognized.players['player-1']!.cash).toBeGreaterThan(cashAtDepart);
    expect(recognized.pnl['player-1']!.revenue).toBeGreaterThan(0);
    expect(recognized.clock).toEqual(clock);
    expect(recognized.scenario).toEqual(scenario);
  });
});
