import { describe, expect, it } from 'vitest';
import { FACTORY_TYPES } from '../buildings/catalog.js';
import { generateNpcBuyOffers } from '../sales/market.js';
import { parcelIdFromCoords } from '../types/map.js';
import { applyWorldAction } from '../world/reducer.js';
import { createInitialWorld } from '../world/create-world.js';
import { findOpenLotForParcel, getProductionLine, type WorldState } from '../world/state.js';
import { PARCEL_RESOURCE_DEFS, type ParcelResourceKind } from '../world/parcel-resources.js';
import { computeProductionTiming } from './logistics.js';
import { getItemQty, ITEMS } from './items.js';
import { RECIPES } from './recipes.js';
import { planProfitPerTick, techStage } from './chain.js';
import { generateParcelResource } from '../world/parcel-resources.js';

function ownAndComplete(
  state: WorldState,
  x: number,
  y: number,
  factoryTypeId: keyof typeof FACTORY_TYPES,
) {
  const parcelId = parcelIdFromCoords(x, y);
  const lot = findOpenLotForParcel(state, parcelId)!;
  let next = applyWorldAction(state, { type: 'BID', parcelId, amount: lot.minPrice });
  next = applyWorldAction(next, { type: 'SETTLE_AUCTION', parcelId });
  next = applyWorldAction(next, { type: 'START_BUILD', parcelId, factoryTypeId });
  for (let i = 0; i < FACTORY_TYPES[factoryTypeId].buildTimeTicks; i++) {
    next = applyWorldAction(next, { type: 'ADVANCE_BUILD_TICK' });
  }
  return { state: next, parcelId };
}

describe('礦脈對應', () => {
  it('五種地皮各自連到開採產物，而不是跳級成品', () => {
    expect(PARCEL_RESOURCE_DEFS['iron-vein'].linkedItemId).toBe('raw-ore');
    expect(PARCEL_RESOURCE_DEFS['resin-bog'].linkedItemId).toBe('resin');
    expect(PARCEL_RESOURCE_DEFS['quartz-sand'].linkedItemId).toBe('quartz-grit');
    expect(PARCEL_RESOURCE_DEFS['coal-seam'].linkedItemId).toBe('coal');
    expect(PARCEL_RESOURCE_DEFS['copper-shale'].linkedItemId).toBe('copper-ore');
    const offered = new Set(generateNpcBuyOffers(0).map((offer) => offer.itemId));
    for (const item of Object.values(ITEMS)) {
      expect(offered.has(item.id)).toBe(item.sellable);
    }
  });
});

describe('開採與技術', () => {
  it('只能在對應礦脈開採，入庫原料後才解鎖冶煉', () => {
    let state = createInitialWorld({ startingCash: 400_000 });
    const iron = state.map.parcels.find((parcel) => parcel.resource.kind === 'iron-vein')!;
    const other = state.map.parcels.find((parcel) => parcel.resource.kind !== 'iron-vein')!;
    const coal = state.map.parcels.find((parcel) => parcel.resource.kind === 'coal-seam')!;

    const wrong = ownAndComplete(state, other.x, other.y, 'workshop');
    const blocked = wrong.state;
    state = applyWorldAction(blocked, {
      type: 'START_PRODUCTION',
      parcelId: wrong.parcelId,
      recipeId: 'extract-iron',
    });
    expect(state).toBe(blocked);

    const mine = ownAndComplete(state, iron.x, iron.y, 'workshop');
    state = mine.state;
    const reservesBefore = state.map.parcels.find(
      (parcel) => parcel.id.value === mine.parcelId.value,
    )!.resource.reserves;
    state = applyWorldAction(state, {
      type: 'START_PRODUCTION',
      parcelId: mine.parcelId,
      recipeId: 'extract-iron',
    });
    expect(techStage(state.craftedTotals['player-1'])).toBe(0);
    const smeltBlocked = state;
    state = applyWorldAction(state, {
      type: 'START_PRODUCTION',
      parcelId: mine.parcelId,
      recipeId: 'smelt-iron',
    });
    expect(state).toBe(smeltBlocked);

    for (let i = 0; i < 160 && techStage(state.craftedTotals['player-1']) < 1; i++) {
      state = applyWorldAction(state, { type: 'ADVANCE_PRODUCTION_TICK' });
    }
    expect(getItemQty(state.inventories['player-1'], 'raw-ore')).toBeGreaterThan(24);
    expect(
      state.map.parcels.find((parcel) => parcel.id.value === mine.parcelId.value)!.resource
        .reserves,
    ).toBeLessThan(reservesBefore);
    expect(techStage(state.craftedTotals['player-1'])).toBe(1);

    state = applyWorldAction(state, { type: 'STOP_PRODUCTION', parcelId: mine.parcelId });
    const coalMine = ownAndComplete(state, coal.x, coal.y, 'workshop');
    state = coalMine.state;
    state = applyWorldAction(state, {
      type: 'START_PRODUCTION',
      parcelId: coalMine.parcelId,
      recipeId: 'extract-coal',
    });
    for (let i = 0; i < 80 && getItemQty(state.inventories['player-1'], 'coal') < 1; i++) {
      state = applyWorldAction(state, { type: 'ADVANCE_PRODUCTION_TICK' });
    }
    expect(getItemQty(state.inventories['player-1'], 'coal')).toBeGreaterThan(0);

    state = applyWorldAction(state, { type: 'STOP_PRODUCTION', parcelId: coalMine.parcelId });
    state = applyWorldAction(state, {
      type: 'START_PRODUCTION',
      parcelId: mine.parcelId,
      recipeId: 'smelt-iron',
    });
    const oreBefore = getItemQty(state.inventories['player-1'], 'raw-ore');
    const coalBefore = getItemQty(state.inventories['player-1'], 'coal');
    const line = getProductionLine(state, mine.parcelId)!;
    for (let i = 0; i < line.cycleTicks; i++) {
      state = applyWorldAction(state, { type: 'ADVANCE_PRODUCTION_TICK' });
    }
    expect(getItemQty(state.inventories['player-1'], 'iron-ingot')).toBeGreaterThanOrEqual(1);
    expect(getItemQty(state.inventories['player-1'], 'raw-ore')).toBeLessThan(oreBefore);
    expect(getItemQty(state.inventories['player-1'], 'coal')).toBeLessThan(coalBefore);
  });

  it('兩件中間件入庫後，組裝廠可以把三種礦物軋成合金板', () => {
    let state = createInitialWorld({ startingCash: 400_000 });
    const parcel = state.map.parcels.find((entry) => entry.resource.kind === 'copper-shale')!;
    const built = ownAndComplete(state, parcel.x, parcel.y, 'assembly-plant');
    state = built.state;
    const locked = state;
    state = applyWorldAction(locked, {
      type: 'START_PRODUCTION',
      parcelId: built.parcelId,
      recipeId: 'roll-alloy',
    });
    expect(state).toBe(locked);

    state = {
      ...locked,
      craftedTotals: { 'player-1': { 'basic-part': 2 } },
      inventories: {
        'player-1': {
          'iron-ingot': 4,
          'copper-ingot': 4,
          silica: 4,
        },
      },
    };
    expect(techStage(state.craftedTotals['player-1'])).toBe(2);
    state = applyWorldAction(state, {
      type: 'START_PRODUCTION',
      parcelId: built.parcelId,
      recipeId: 'roll-alloy',
    });
    expect(getProductionLine(state, built.parcelId)?.recipeId).toBe('roll-alloy');
    for (let i = 0; i < 40; i++) {
      state = applyWorldAction(state, { type: 'ADVANCE_PRODUCTION_TICK' });
    }
    expect(getItemQty(state.inventories['player-1'], 'alloy-plate')).toBeGreaterThanOrEqual(1);
  });
});

describe('規劃利潤', () => {
  it('離供應樞紐越遠，同一開採配方的每週期利潤越低', () => {
    const recipe = RECIPES['extract-iron'];
    const nearParcel = {
      id: parcelIdFromCoords(0, 1),
      x: 0,
      y: 1,
      state: 'building-ready' as const,
      ownerId: 'p',
      resource: generateParcelResource(0, 1),
      role: 'land' as const,
      populationDensity: 20,
      roadAccess: 0.4,
      cityProximity: 0.2,
      nearestCityName: null,
      nearestCityDistance: 4,
    };
    const farParcel = {
      id: parcelIdFromCoords(12, 10),
      x: 12,
      y: 10,
      state: 'building-ready' as const,
      ownerId: 'p',
      resource: generateParcelResource(12, 10),
      role: 'land' as const,
      populationDensity: 12,
      roadAccess: 0.12,
      cityProximity: 0,
      nearestCityName: null,
      nearestCityDistance: 8,
    };
    const near = computeProductionTiming(
      recipe.baseCycleTicks,
      recipe.travelTickPerDistance,
      nearParcel,
      1,
    );
    const far = computeProductionTiming(
      recipe.baseCycleTicks,
      recipe.travelTickPerDistance,
      farParcel,
      1,
    );
    expect(planProfitPerTick(recipe, near.cycleTicks, near.throughputFactor)).toBeGreaterThan(
      planProfitPerTick(recipe, far.cycleTicks, far.throughputFactor),
    );
  });
});

describe('鏈條覆蓋', () => {
  it('每種礦脈都有開採配方', () => {
    const kinds = new Set(
      Object.values(RECIPES)
        .map((recipe) => recipe.sourceKind)
        .filter(Boolean),
    );
    const expected: ParcelResourceKind[] = [
      'iron-vein',
      'resin-bog',
      'quartz-sand',
      'coal-seam',
      'copper-shale',
    ];
    for (const kind of expected) {
      expect(kinds.has(kind)).toBe(true);
    }
  });
});
