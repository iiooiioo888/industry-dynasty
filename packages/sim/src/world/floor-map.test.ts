import { describe, expect, it } from 'vitest';
import { FACTORY_TYPES } from '../buildings/catalog.js';
import { parcelIdFromCoords } from '../types/map.js';
import { applyWorldAction } from './reducer.js';
import { createInitialWorld } from './create-world.js';
import { findOpenLotForParcel } from './state.js';
import { enterFloorBlock, floorPlanFor, stationAt } from './floor-map.js';

function ownAndComplete(
  x: number,
  y: number,
  factoryTypeId: 'workshop' | 'lab' | 'storefront',
) {
  let state = createInitialWorld({ startingCash: 400_000 });
  const parcelId = parcelIdFromCoords(x, y);
  const lot = findOpenLotForParcel(state, parcelId)!;
  state = applyWorldAction(state, { type: 'BID', parcelId, amount: lot.minPrice });
  state = applyWorldAction(state, { type: 'SETTLE_AUCTION', parcelId });
  state = applyWorldAction(state, { type: 'START_BUILD', parcelId, factoryTypeId });
  for (let i = 0; i < FACTORY_TYPES[factoryTypeId].buildTimeTicks; i += 1) {
    state = applyWorldAction(state, { type: 'ADVANCE_BUILD_TICK' });
  }
  return { state, parcelId };
}

describe('大世界與廠房', () => {
  it('空地、建造中進不了廠房，完工後可以', () => {
    let state = createInitialWorld({ startingCash: 400_000 });
    const parcel = state.map.parcels.find((entry) => entry.role === 'land')!;
    expect(enterFloorBlock(state, parcel.id)).toBe('只有自己的建物能進廠房');

    const lot = findOpenLotForParcel(state, parcel.id)!;
    state = applyWorldAction(state, { type: 'BID', parcelId: parcel.id, amount: lot.minPrice });
    state = applyWorldAction(state, { type: 'SETTLE_AUCTION', parcelId: parcel.id });
    expect(enterFloorBlock(state, parcel.id)).toBe('這塊地還沒有建物');

    state = applyWorldAction(state, {
      type: 'START_BUILD',
      parcelId: parcel.id,
      factoryTypeId: 'workshop',
    });
    expect(enterFloorBlock(state, parcel.id)).toBe('建造完成才能進入廠房');

    for (let i = 0; i < FACTORY_TYPES.workshop.buildTimeTicks; i += 1) {
      state = applyWorldAction(state, { type: 'ADVANCE_BUILD_TICK' });
    }
    expect(enterFloorBlock(state, parcel.id)).toBeNull();
  });

  it('工坊有作業區與加工機，門市改成貨架，研發室沒有出貨口', () => {
    const works = floorPlanFor('workshop');
    const assembly = floorPlanFor('assembly-plant');
    expect(works.kind).toBe('works');
    expect(assembly).toEqual(works);
    expect(stationAt(works, 2, 1)?.role).toBe('work');
    expect(stationAt(works, 3, 1)?.role).toBe('machine');
    expect(works.stations.some((station) => station.role === 'shelf')).toBe(false);

    const store = floorPlanFor('storefront');
    expect(store.kind).toBe('store');
    expect(store.stations.some((station) => station.role === 'shelf')).toBe(true);
    expect(store.stations.some((station) => station.role === 'machine')).toBe(false);

    const lab = floorPlanFor('lab');
    expect(lab.stations.some((station) => station.role === 'bench')).toBe(true);
    expect(lab.stations.some((station) => station.role === 'outbound')).toBe(false);
  });

  it('拆除或賣掉之後廠房就關了', () => {
    const land = createInitialWorld().map.parcels.find((parcel) => parcel.role === 'land')!;
    const built = ownAndComplete(land.x, land.y, 'workshop');
    expect(enterFloorBlock(built.state, built.parcelId)).toBeNull();
    const demolished = applyWorldAction(built.state, {
      type: 'DEMOLISH',
      parcelId: built.parcelId,
    });
    expect(enterFloorBlock(demolished, built.parcelId)).toBe('這塊地還沒有建物');
  });
});
