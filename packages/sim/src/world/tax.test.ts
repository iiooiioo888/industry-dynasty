import { describe, expect, it } from 'vitest';
import { parcelIdFromCoords } from '../types/map.js';
import { applyWorldAction } from './reducer.js';
import { createInitialWorld } from './create-world.js';
import { findOpenLotForParcel, getPlayerHoldings } from './state.js';
import { DEFAULT_WORLD_CONFIG } from './config.js';
import { processParcelTax } from './tax-logic.js';

describe('土地稅與收回拍賣', () => {
  it('稅務週期扣款並在累計欠稅達門檻時重新上架', () => {
    const parcelId = parcelIdFromCoords(0, 0);
    let state = createInitialWorld({
      startingCash: 10_000,
      landTaxPerTick: 500,
      landTaxReauctionThreshold: 1_500,
    });

    const lot = findOpenLotForParcel(state, parcelId)!;
    const bid = lot.minPrice;
    state = applyWorldAction(state, { type: 'BID', parcelId, amount: bid });
    state = applyWorldAction(state, { type: 'SETTLE_AUCTION', parcelId });
    const cashAfterPurchase = state.players['player-1'].cash;

    // 現金只留 0，連續三個週期各欠 500 → 達 1500 門檻
    state = {
      ...state,
      players: {
        ...state.players,
        'player-1': { ...state.players['player-1'], cash: 0 },
      },
    };

    state = applyWorldAction(state, { type: 'ADVANCE_TAX_TICK' });
    state = applyWorldAction(state, { type: 'ADVANCE_TAX_TICK' });
    state = applyWorldAction(state, { type: 'ADVANCE_TAX_TICK' });

    const parcel = state.map.parcels.find((p) => p.id.value === parcelId.value)!;
    expect(parcel.ownerId).toBeNull();
    expect(parcel.state).toBe('empty');
    expect(getPlayerHoldings(state, 'player-1')).toHaveLength(0);
    expect(findOpenLotForParcel(state, parcelId)).toBeDefined();
    expect(state.players['player-1'].cash).toBe(0);

    // 確保先前購地扣款仍成立
    expect(cashAfterPurchase).toBe(10_000 - bid);
  });

  it('processParcelTax 在門檻前只累積欠稅', () => {
    const parcelId = parcelIdFromCoords(3, 3);
    const parcel = {
      id: parcelId,
      x: 3,
      y: 3,
      state: 'owned' as const,
      ownerId: 'player-1',
    };
    const player = { id: 'player-1', name: '測試', cash: 200 };
    const outcome = processParcelTax(parcel, player, 0, DEFAULT_WORLD_CONFIG, 'lot-x');
    expect(outcome.reauctioned).toBe(false);
    expect(outcome.unpaidLandTax).toBe(300);
    expect(outcome.player?.cash).toBe(0);
  });
});
