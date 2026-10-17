import { describe, expect, it } from 'vitest';
import { parcelIdFromCoords } from '../types/map.js';
import { minNextBid, settleLot, validateBid } from './auction-logic.js';
import { createAuctionLot } from './auction-logic.js';
import { applyWorldAction } from './reducer.js';
import { createInitialWorld } from './create-world.js';
import { generateParcelResource } from './parcel-resources.js';
import { findOpenLotForParcel } from './state.js';

describe('土地拍賣', () => {
  it('出價後結算會扣款並寫入持有人', () => {
    const parcelId = parcelIdFromCoords(4, 1);
    let state = createInitialWorld({ startingCash: 50_000 });
    const lot = findOpenLotForParcel(state, parcelId)!;
    const bid = minNextBid(lot);

    state = applyWorldAction(state, { type: 'BID', parcelId, amount: bid });
    state = applyWorldAction(state, { type: 'SETTLE_AUCTION', parcelId });

    const parcel = state.map.parcels.find((p) => p.id.value === parcelId.value)!;
    expect(parcel.ownerId).toBe('player-1');
    expect(parcel.state).toBe('owned');
    expect(state.players['player-1'].cash).toBe(50_000 - bid);
    expect(findOpenLotForParcel(state, parcelId)).toBeUndefined();
  });

  it('沒有有效出價或現金不足時，結算不會關掉礦點', () => {
    const state = createInitialWorld();
    const coal = state.map.parcels.find((parcel) => parcel.x === 5 && parcel.y === 4);
    expect(coal?.role).toBe('land');
    expect(coal?.resource.kind).toBe('coal-seam');

    const untouched = applyWorldAction(state, { type: 'SETTLE_AUCTION', parcelId: coal!.id });
    expect(untouched).toBe(state);
    expect(findOpenLotForParcel(untouched, coal!.id)?.status).toBe('open');
    expect(
      untouched.map.parcels.find((parcel) => parcel.id.value === coal!.id.value)?.resource.kind,
    ).toBe('coal-seam');

    const lot = findOpenLotForParcel(state, coal!.id)!;
    let short = applyWorldAction(state, {
      type: 'BID',
      parcelId: coal!.id,
      amount: lot.minPrice,
    });
    short = {
      ...short,
      players: {
        ...short.players,
        'player-1': { ...short.players['player-1'], cash: 0 },
      },
    };
    const kept = applyWorldAction(short, { type: 'SETTLE_AUCTION', parcelId: coal!.id });
    expect(kept).toBe(short);
    expect(findOpenLotForParcel(kept, coal!.id)?.status).toBe('open');
    expect(kept.map.parcels.find((parcel) => parcel.id.value === coal!.id.value)?.state).not.toBe(
      'owned',
    );
  });

  it('出價低於底價不會送出', () => {
    const parcelId = parcelIdFromCoords(5, 4);
    const state = createInitialWorld();
    const lot = findOpenLotForParcel(state, parcelId)!;
    const result = validateBid(lot, state.players['player-1'], lot.minPrice - 1);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('低於底價');
    expect(result.reason).toContain('沒有送出');
    expect(applyWorldAction(state, { type: 'BID', parcelId, amount: lot.minPrice - 1 })).toBe(
      state,
    );
  });

  it('現金不足時無法出價', () => {
    const parcelId = parcelIdFromCoords(0, 0);
    const state = createInitialWorld({ startingCash: 100 });
    const lot = findOpenLotForParcel(state, parcelId)!;
    const result = validateBid(lot, state.players['player-1'], lot.minPrice);
    expect(result.ok).toBe(false);
  });

  it('settleLot 在得標者現金足夠時轉移所有權', () => {
    const parcelId = parcelIdFromCoords(1, 1);
    const lot = createAuctionLot(parcelId, 1000, 'lot-test');
    const parcel = {
      id: parcelId,
      x: 1,
      y: 1,
      state: 'empty' as const,
      ownerId: null,
      resource: generateParcelResource(1, 1),
      role: 'land' as const,
      populationDensity: 20,
      roadAccess: 0.4,
      cityProximity: 0.2,
      nearestCityName: null,
      nearestCityDistance: 4,
    };
    const player = { id: 'player-1', name: '測試', cash: 5000 };
    const withBid = { ...lot, highBid: 1200, highBidderId: 'player-1' };
    const result = settleLot(withBid, parcel, player);
    expect(result.sold).toBe(true);
    expect(result.parcel.ownerId).toBe('player-1');
    expect(result.player?.cash).toBe(3800);
  });
});
