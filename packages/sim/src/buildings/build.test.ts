import { describe, expect, it } from 'vitest';
import { parcelIdFromCoords } from '../types/map.js';
import { applyWorldAction } from '../world/reducer.js';
import { createInitialWorld } from '../world/create-world.js';
import { findOpenLotForParcel, getSite } from '../world/state.js';
import { getSiteLogisticsView } from './adjacency.js';
import { FACTORY_TYPES } from './catalog.js';

function ownParcel(state: ReturnType<typeof createInitialWorld>, x: number, y: number) {
  const parcelId = parcelIdFromCoords(x, y);
  const lot = findOpenLotForParcel(state, parcelId)!;
  let next = applyWorldAction(state, { type: 'BID', parcelId, amount: lot.minPrice });
  next = applyWorldAction(next, { type: 'SETTLE_AUCTION', parcelId });
  return { state: next, parcelId };
}

describe('建造流程', () => {
  it('在已持有土地上開工並於 tick 後完工', () => {
    let state = createInitialWorld({ startingCash: 200_000 });
    const { state: withLand, parcelId } = ownParcel(state, 1, 1);
    state = withLand;
    const cashBefore = state.players['player-1'].cash;

    state = applyWorldAction(state, {
      type: 'START_BUILD',
      parcelId,
      factoryTypeId: 'workshop',
    });

    const site = getSite(state, parcelId)!;
    expect(site.phase).toBe('constructing');
    expect(state.map.parcels.find((p) => p.id.value === parcelId.value)!.state).toBe('building');
    expect(state.players['player-1'].cash).toBe(cashBefore - FACTORY_TYPES.workshop.buildCost);

    const ticks = FACTORY_TYPES.workshop.buildTimeTicks;
    for (let i = 0; i < ticks; i++) {
      state = applyWorldAction(state, { type: 'ADVANCE_BUILD_TICK' });
    }

    const done = getSite(state, parcelId)!;
    expect(done.phase).toBe('complete');
    expect(state.map.parcels.find((p) => p.id.value === parcelId.value)!.state).toBe(
      'building-ready',
    );
  });

  it('取消建造可部分退款', () => {
    let state = createInitialWorld({ startingCash: 200_000 });
    const { state: withLand, parcelId } = ownParcel(state, 2, 2);
    state = withLand;
    const cashBefore = state.players['player-1'].cash;

    state = applyWorldAction(state, {
      type: 'START_BUILD',
      parcelId,
      factoryTypeId: 'workshop',
    });
    state = applyWorldAction(state, { type: 'CANCEL_BUILD', parcelId });

    expect(getSite(state, parcelId)).toBeUndefined();
    expect(state.players['player-1'].cash).toBe(
      cashBefore - FACTORY_TYPES.workshop.buildCost + Math.floor(FACTORY_TYPES.workshop.buildCost * 0.5),
    );
  });
});

describe('相鄰效率', () => {
  it('相鄰完工工廠提高物流效率係數', () => {
    let state = createInitialWorld({ startingCash: 500_000 });
    const a = ownParcel(state, 5, 5);
    state = a.state;
    const b = ownParcel(state, 6, 5);
    state = b.state;

    for (const parcelId of [a.parcelId, b.parcelId]) {
      state = applyWorldAction(state, {
        type: 'START_BUILD',
        parcelId,
        factoryTypeId: 'workshop',
      });
      for (let i = 0; i < FACTORY_TYPES.workshop.buildTimeTicks; i++) {
        state = applyWorldAction(state, { type: 'ADVANCE_BUILD_TICK' });
      }
    }

    const parcelA = state.map.parcels.find((p) => p.id.value === a.parcelId.value)!;
    const siteA = getSite(state, a.parcelId)!;
    expect(siteA.phase).toBe('complete');
    if (siteA.phase !== 'complete') {
      throw new Error('expected complete site');
    }

    const view = getSiteLogisticsView(state.map, parcelA, siteA, state.sites);
    expect(view.adjacentFactoryCount).toBe(1);
    expect(view.factor).toBeGreaterThan(view.base);
    expect(view.adjacencyBonus).toBe(FACTORY_TYPES.workshop.adjacencyEfficiencyBonus);
  });
});
