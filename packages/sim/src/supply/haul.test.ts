import { describe, expect, it } from 'vitest';
import { FACTORY_TYPES } from '../buildings/catalog.js';
import { getItemQty } from '../production/items.js';
import { SIM_MS_PER_TICK } from '../world/clock.js';
import { createInitialWorld } from '../world/create-world.js';
import { applyWorldAction } from '../world/reducer.js';
import { findOpenLotForParcel, getPlayerInventory, getProductionLine } from '../world/state.js';
import { parcelIdFromCoords } from '../types/map.js';
import { downstreamOf, listSiteSupply, quoteRestock, siteBin, upstreamOf } from './haul.js';

function ownAndComplete(x: number, y: number) {
  let state = createInitialWorld({ startingCash: 400_000 });
  const parcelId = parcelIdFromCoords(x, y);
  const lot = findOpenLotForParcel(state, parcelId)!;
  state = applyWorldAction(state, { type: 'BID', parcelId, amount: lot.minPrice });
  state = applyWorldAction(state, { type: 'SETTLE_AUCTION', parcelId });
  state = applyWorldAction(state, { type: 'START_BUILD', parcelId, factoryTypeId: 'workshop' });
  for (let i = 0; i < FACTORY_TYPES.workshop.buildTimeTicks; i += 1) {
    state = applyWorldAction(state, { type: 'ADVANCE_BUILD_TICK' });
  }
  return { state, parcelId };
}

describe('廠間供應鏈', () => {
  it('公司庫送進料倉要付運費，到貨前產線吃不到，到貨後才入倉', () => {
    const land = createInitialWorld().map.parcels.find((parcel) => parcel.role === 'land' && parcel.x < 4)!;
    const built = ownAndComplete(land.x, land.y);
    const before = getItemQty(getPlayerInventory(built.state, 'player-1'), 'raw-ore');
    const offers = built.state.npcBuyOffers;
    const sent = applyWorldAction(built.state, {
      type: 'DISPATCH_SUPPLY',
      toParcelId: built.parcelId,
      itemId: 'raw-ore',
      quantity: 2,
    });
    expect(sent).not.toBe(built.state);
    expect(getItemQty(getPlayerInventory(sent, 'player-1'), 'raw-ore')).toBe(before - 2);
    expect(sent.supplyHauls).toHaveLength(1);
    expect(sent.players['player-1']!.cash).toBeLessThan(built.state.players['player-1']!.cash);
    expect(sent.pnl['player-1']!.transportCost).toBeGreaterThan(0);
    expect(sent.npcBuyOffers).toEqual(offers);
    expect(siteBin(sent, built.parcelId.value)['raw-ore'] ?? 0).toBe(0);

    const blocked = applyWorldAction(sent, {
      type: 'DISPATCH_SUPPLY',
      toParcelId: built.parcelId,
      itemId: 'coal',
      quantity: 1,
    });
    expect(blocked).toBe(sent);

    let walking = sent;
    const ticks = walking.supplyHauls![0]!.travelTicks;
    for (let i = 0; i < ticks; i += 1) {
      walking = applyWorldAction(walking, { type: 'ADVANCE_SIM_TIME', deltaMs: SIM_MS_PER_TICK });
    }
    expect(walking.supplyHauls ?? []).toHaveLength(0);
    expect(siteBin(walking, built.parcelId.value)['raw-ore']).toBe(2);
  });

  it('料倉夠用時不扣公司庫，拆除後料退回公司庫', () => {
    const land = createInitialWorld().map.parcels.find(
      (parcel) =>
        parcel.role === 'land' &&
        parcel.resource.linkedItemId !== 'raw-ore' &&
        parcel.resource.linkedItemId !== 'resin',
    )!;
    const built = ownAndComplete(land.x, land.y);
    let state = built.state;
    const parcelId = built.parcelId;
    state = applyWorldAction(state, {
      type: 'START_PRODUCTION',
      parcelId,
      recipeId: 'make-basic-part',
      machineGradeId: 'balance-press',
    });
    const line = getProductionLine(state, parcelId)!;
    state = {
      ...state,
      siteBins: { [parcelId.value]: { 'raw-ore': 2, resin: 1 } },
      productionLines: {
        ...state.productionLines,
        [parcelId.value]: {
          ...line,
          progressTicks: line.cycleTicks - 1,
          travelTicks: 0,
          throughputFactor: 1,
        },
      },
    };
    const ore = getItemQty(getPlayerInventory(state, 'player-1'), 'raw-ore');
    const resin = getItemQty(getPlayerInventory(state, 'player-1'), 'resin');
    const produced = applyWorldAction(state, { type: 'ADVANCE_PRODUCTION_TICK' });
    expect(getItemQty(getPlayerInventory(produced, 'player-1'), 'raw-ore')).toBe(ore);
    expect(getItemQty(getPlayerInventory(produced, 'player-1'), 'resin')).toBe(resin);
    expect(getItemQty(getPlayerInventory(produced, 'player-1'), 'basic-part')).toBeGreaterThan(0);
    expect(siteBin(produced, parcelId.value)['raw-ore'] ?? 0).toBe(0);

    const demolished = applyWorldAction(
      { ...produced, siteBins: { [parcelId.value]: { coal: 3 } } },
      { type: 'DEMOLISH', parcelId },
    );
    expect(getItemQty(getPlayerInventory(demolished, 'player-1'), 'coal')).toBe(3);
    expect(demolished.siteBins?.[parcelId.value]).toBeUndefined();
  });

  it('補一輪只送差額，在途已夠時不再出車', () => {
    const land = createInitialWorld().map.parcels.find(
      (parcel) =>
        parcel.role === 'land' &&
        parcel.resource.linkedItemId !== 'raw-ore' &&
        parcel.resource.linkedItemId !== 'resin',
    )!;
    const built = ownAndComplete(land.x, land.y);
    let state = built.state;
    const parcelId = built.parcelId;
    const idle = applyWorldAction(state, { type: 'RESTOCK_SITE', parcelId });
    expect(idle).toBe(state);
    expect(quoteRestock(state, parcelId).ok).toBe(false);

    state = applyWorldAction(state, {
      type: 'START_PRODUCTION',
      parcelId,
      recipeId: 'make-basic-part',
      machineGradeId: 'balance-press',
    });
    const offers = state.npcBuyOffers;
    const before = getItemQty(getPlayerInventory(state, 'player-1'), 'raw-ore');
    const quote = quoteRestock(state, parcelId);
    expect(quote.ok).toBe(true);
    if (!quote.ok) {
      return;
    }
    expect(quote.lines.map((line) => line.itemId)).toEqual(['raw-ore', 'resin']);
    const sent = applyWorldAction(state, { type: 'RESTOCK_SITE', parcelId });
    expect(sent.supplyHauls).toHaveLength(2);
    expect(getItemQty(getPlayerInventory(sent, 'player-1'), 'raw-ore')).toBe(before - 2);
    expect(sent.pnl['player-1']!.transportCost).toBe(quote.freight);
    expect(sent.npcBuyOffers).toEqual(offers);
    expect(listSiteSupply(sent)[0]?.inputs.find((input) => input.itemId === 'raw-ore')?.shortfall).toBe(0);
    expect(applyWorldAction(sent, { type: 'RESTOCK_SITE', parcelId })).toBe(sent);
  });

  it('配方能對上上游與下游', () => {
    expect(upstreamOf('smelt-iron').map((link) => link.recipeId)).toEqual(
      expect.arrayContaining(['extract-iron', 'extract-coal']),
    );
    expect(downstreamOf('extract-iron').map((link) => link.recipeId)).toEqual(
      expect.arrayContaining(['smelt-iron', 'make-basic-part']),
    );
  });
});
