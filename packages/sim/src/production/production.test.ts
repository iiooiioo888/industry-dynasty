import { describe, expect, it } from 'vitest';
import { FACTORY_TYPES } from '../buildings/catalog.js';
import { parcelIdFromCoords } from '../types/map.js';
import { applyWorldAction } from '../world/reducer.js';
import { createInitialWorld } from '../world/create-world.js';
import { findOpenLotForParcel, getProductionLine } from '../world/state.js';
import { computeProductionTiming } from './logistics.js';
import { RECIPES } from './recipes.js';
import { getItemQty } from './items.js';
import { generateParcelResource } from '../world/parcel-resources.js';

function ownAndCompleteFactory(state: ReturnType<typeof createInitialWorld>, x: number, y: number) {
  const parcelId = parcelIdFromCoords(x, y);
  const lot = findOpenLotForParcel(state, parcelId)!;
  let next = applyWorldAction(state, { type: 'BID', parcelId, amount: lot.minPrice });
  next = applyWorldAction(next, { type: 'SETTLE_AUCTION', parcelId });
  next = applyWorldAction(next, {
    type: 'START_BUILD',
    parcelId,
    factoryTypeId: 'workshop',
  });
  for (let i = 0; i < FACTORY_TYPES.workshop.buildTimeTicks; i++) {
    next = applyWorldAction(next, { type: 'ADVANCE_BUILD_TICK' });
  }
  return { state: next, parcelId };
}

describe('生產配方', () => {
  it('固定配方在週期推進後產出並更新庫存', () => {
    let state = createInitialWorld({ startingCash: 200_000 });
    const { state: ready, parcelId } = ownAndCompleteFactory(state, 1, 0);
    state = ready;

    state = applyWorldAction(state, {
      type: 'START_PRODUCTION',
      parcelId,
      recipeId: 'make-basic-part',
    });

    const line = getProductionLine(state, parcelId)!;
    const cycles = line.cycleTicks * 2 + 2;
    for (let i = 0; i < cycles; i++) {
      state = applyWorldAction(state, { type: 'ADVANCE_PRODUCTION_TICK' });
    }

    const stock = state.inventories[state.localPlayerId];
    expect(getItemQty(stock, 'basic-part')).toBeGreaterThanOrEqual(1);
    expect(getProductionLine(state, parcelId)!.totalOutputValue).toBeGreaterThan(0);
  });

  it('缺料時累積閒置損失', () => {
    let state = createInitialWorld({ startingCash: 200_000 });
    const { state: ready, parcelId } = ownAndCompleteFactory(state, 4, 4);
    state = ready;
    state = {
      ...state,
      inventories: { [state.localPlayerId]: {} },
    };

    state = applyWorldAction(state, {
      type: 'START_PRODUCTION',
      parcelId,
      recipeId: 'make-basic-part',
    });
    state = applyWorldAction(state, { type: 'ADVANCE_PRODUCTION_TICK' });
    state = applyWorldAction(state, { type: 'ADVANCE_PRODUCTION_TICK' });

    const line = getProductionLine(state, parcelId)!;
    expect(line.status).toBe('waiting_inputs');
    expect(line.totalIdleLossValue).toBeGreaterThan(0);
    expect(line.idleTicksAccumulated).toBeGreaterThanOrEqual(2);
  });
});

describe('距離懲罰', () => {
  it('遠離供應樞紐週期更長、產出係數更低', () => {
    const near = computeProductionTiming(
      RECIPES['make-basic-part'].baseCycleTicks,
      RECIPES['make-basic-part'].travelTickPerDistance,
      {
        id: parcelIdFromCoords(0, 1),
        x: 0,
        y: 1,
        state: 'building-ready',
        ownerId: 'p',
        resource: generateParcelResource(0, 1),
        role: 'land',
        populationDensity: 20,
        roadAccess: 0.4,
        cityProximity: 0.2,
        nearestCityName: null,
        nearestCityDistance: 4,
      },
      1,
    );
    const far = computeProductionTiming(
      RECIPES['make-basic-part'].baseCycleTicks,
      RECIPES['make-basic-part'].travelTickPerDistance,
      {
        id: parcelIdFromCoords(10, 10),
        x: 10,
        y: 10,
        state: 'building-ready',
        ownerId: 'p',
        resource: generateParcelResource(10, 10),
        role: 'land',
        populationDensity: 12,
        roadAccess: 0.12,
        cityProximity: 0,
        nearestCityName: null,
        nearestCityDistance: 8,
      },
      1,
    );
    expect(far.cycleTicks).toBeGreaterThan(near.cycleTicks);
    expect(far.throughputFactor).toBeLessThan(near.throughputFactor);
  });

  it('近址工廠在相同 tick 內產出價值不低於遠址', () => {
    let nearState = createInitialWorld({ startingCash: 500_000 });
    let farState = createInitialWorld({ startingCash: 500_000 });
    const near = ownAndCompleteFactory(nearState, 0, 1);
    const far = ownAndCompleteFactory(farState, 12, 10);
    nearState = near.state;
    farState = far.state;

    nearState = applyWorldAction(nearState, {
      type: 'START_PRODUCTION',
      parcelId: near.parcelId,
      recipeId: 'make-basic-part',
    });
    farState = applyWorldAction(farState, {
      type: 'START_PRODUCTION',
      parcelId: far.parcelId,
      recipeId: 'make-basic-part',
    });

    for (let i = 0; i < 40; i++) {
      nearState = applyWorldAction(nearState, { type: 'ADVANCE_PRODUCTION_TICK' });
      farState = applyWorldAction(farState, { type: 'ADVANCE_PRODUCTION_TICK' });
    }

    const nearLine = getProductionLine(nearState, near.parcelId)!;
    const farLine = getProductionLine(farState, far.parcelId)!;
    expect(nearLine.totalOutputValue).toBeGreaterThanOrEqual(farLine.totalOutputValue);
    expect(farLine.totalDistanceLossValue).toBeGreaterThanOrEqual(nearLine.totalDistanceLossValue);
  });
});
