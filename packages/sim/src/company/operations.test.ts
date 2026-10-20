import { describe, expect, it } from 'vitest';
import { FACTORY_TYPES } from '../buildings/catalog.js';
import { ITEMS } from '../production/items.js';
import { generateNpcBuyOffers } from '../sales/market.js';
import { parcelIdFromCoords } from '../types/map.js';
import { applyWorldAction } from '../world/reducer.js';
import { createInitialWorld } from '../world/create-world.js';
import { findOpenLotForParcel, getProductionLine, type WorldState } from '../world/state.js';
import { quoteCommodityAsk } from '../bank/quotes.js';
import { eventForDay } from './events.js';
import { extraProductionTicks } from './staff.js';
import { priceElasticity, quoteStoreItem, settleStorefronts } from './retail.js';
import { createRivalBook } from './rivals.js';

function ownAndComplete(state: WorldState, x: number, y: number, factoryTypeId: keyof typeof FACTORY_TYPES) {
  const parcelId = parcelIdFromCoords(x, y);
  const lot = findOpenLotForParcel(state, parcelId)!;
  let next = applyWorldAction(state, { type: 'BID', parcelId, amount: lot.minPrice });
  next = applyWorldAction(next, { type: 'SETTLE_AUCTION', parcelId });
  next = applyWorldAction(next, { type: 'START_BUILD', parcelId, factoryTypeId });
  for (let i = 0; i < FACTORY_TYPES[factoryTypeId].buildTimeTicks; i += 1) {
    next = applyWorldAction(next, { type: 'ADVANCE_BUILD_TICK' });
  }
  return { state: next, parcelId };
}

describe('人事與日結', () => {
  it('聘用後才在日結扣薪，沒有人時不扣', () => {
    const before = createInitialWorld();
    const idle = applyWorldAction(before, { type: 'ADVANCE_DAY' });
    const hired = applyWorldAction(before, { type: 'HIRE_STAFF', candidateId: 'lin-foreman' });
    const paid = applyWorldAction(hired, { type: 'ADVANCE_DAY' });
    expect(idle.players['player-1']!.cash - paid.players['player-1']!.cash).toBe(420);
    expect(paid.pnl['player-1']!.maintenance - idle.pnl['player-1']!.maintenance).toBe(420);
  });

  it('班長技能決定額外產線刻', () => {
    expect(extraProductionTicks(0, 0)).toBe(0);
    expect(extraProductionTicks(3, 1)).toBe(0);
    expect(extraProductionTicks(3, 0)).toBe(1);
    expect(extraProductionTicks(5, 4)).toBe(1);
  });
});

describe('研發解鎖', () => {
  it('未解鎖不能排城市消費品，研發室累點後可以', () => {
    let state = createInitialWorld({ startingCash: 400_000 });
    const land = state.map.parcels.find((parcel) => parcel.role === 'land')!;
    const other = state.map.parcels.find(
      (parcel) => parcel.role === 'land' && parcel.id.value !== land.id.value,
    )!;
    const workshop = ownAndComplete(state, land.x, land.y, 'workshop');
    state = workshop.state;
    state = applyWorldAction(state, {
      type: 'START_PRODUCTION',
      parcelId: workshop.parcelId,
      recipeId: 'pack-tool-kit',
    });
    expect(getProductionLine(state, workshop.parcelId)).toBeUndefined();

    const lab = ownAndComplete(state, other.x, other.y, 'lab');
    state = lab.state;
    state = applyWorldAction(state, { type: 'HIRE_STAFF', candidateId: 'pei-lab' });
    const hired = state.staff!.find((person) => person.candidateId === 'pei-lab')!;
    state = applyWorldAction(state, {
      type: 'ASSIGN_STAFF',
      staffId: hired.id,
      parcelId: lab.parcelId,
    });
    state = applyWorldAction(state, { type: 'ADVANCE_PRODUCTION_TICK' });
    state = applyWorldAction(state, { type: 'ADVANCE_PRODUCTION_TICK' });
    expect(state.research!.points).toBe(10);
    state = applyWorldAction(state, { type: 'UNLOCK_RESEARCH', projectId: 'civic-tools' });
    expect(state.research!.unlocked).toContain('civic-tools');
    state = applyWorldAction(state, {
      type: 'START_PRODUCTION',
      parcelId: workshop.parcelId,
      recipeId: 'pack-tool-kit',
    });
    expect(getProductionLine(state, workshop.parcelId)?.recipeId).toBe('pack-tool-kit');
  });
});

describe('門市、對手與事件', () => {
  it('售價高於錨點時需求下降，低於錨點時需求上升', () => {
    const anchor = 1_000;
    expect(priceElasticity(anchor, anchor)).toBe(1);
    expect(priceElasticity(anchor * 2, anchor)).toBe(0);
    expect(priceElasticity(Math.floor(anchor * 0.5), anchor)).toBeGreaterThan(1);
  });

  it('對手只擠門市，平靜日的港區收購單維持原價', () => {
    let state = createInitialWorld();
    state = applyWorldAction(state, { type: 'ADVANCE_DAY' });
    expect(state.gameDay).toBe(1);
    expect(state.npcBuyOffers).toEqual(generateNpcBuyOffers(1));
    expect(state.rivals!.firms[0]!.shareByCity).not.toEqual(
      createRivalBook(state.map.cities).firms[0]!.shareByCity,
    );
  });

  it('同一天事件固定，原料緊俏只抬原礦價', () => {
    expect(eventForDay(5)).toEqual(eventForDay(5));
    expect(eventForDay(5).kind).toBe('festival');
    expect(eventForDay(3).extraShipTicks).toBe(2);
    expect(eventForDay(6).orePriceMultiplier).toBe(1.08);

    let state = createInitialWorld();
    for (let day = 0; day < 6; day += 1) {
      state = applyWorldAction(state, { type: 'ADVANCE_DAY' });
    }
    const plain = generateNpcBuyOffers(6).find((offer) => offer.itemId === 'raw-ore')!;
    const squeezed = state.npcBuyOffers.find((offer) => offer.itemId === 'raw-ore')!;
    expect(squeezed.unitPrice).toBe(Math.floor(plain.unitPrice * 1.08));
    const other = state.npcBuyOffers.find((offer) => offer.itemId === 'coal')!;
    const plainCoal = generateNpcBuyOffers(6).find((offer) => offer.itemId === 'coal')!;
    expect(other.unitPrice).toBe(plainCoal.unitPrice);
  });

  it('人口不足不能蓋門市，有貨的門市日結會入帳', () => {
    let state = createInitialWorld({ startingCash: 400_000 });
    const sparse = state.map.parcels.find(
      (parcel) => parcel.role === 'land' && parcel.populationDensity < 55,
    )!;
    const dense = state.map.parcels.find(
      (parcel) => parcel.role === 'land' && parcel.populationDensity >= 55,
    )!;
    const blocked = ownAndComplete(state, sparse.x, sparse.y, 'storefront');
    expect(blocked.state.sites[blocked.parcelId.value]).toBeUndefined();

    const store = ownAndComplete(state, dense.x, dense.y, 'storefront');
    state = store.state;
    expect(state.sites[store.parcelId.value]?.phase).toBe('complete');
    const playerId = state.localPlayerId;
    state = {
      ...state,
      research: { points: 0, unlocked: ['civic-tools'] },
      inventories: { ...state.inventories, [playerId]: { 'tool-kit': 8 } },
    };
    const anchor = ITEMS['tool-kit'].unitValue;
    const quiet = quoteStoreItem({
      parcel: state.map.parcels.find((parcel) => parcel.id.value === store.parcelId.value)!,
      itemId: 'tool-kit',
      unitPrice: anchor,
      quality: 1,
      brand: 0,
      rivals: state.rivals!,
      shopkeeperSkill: 0,
      retailMultiplier: 1,
      cityId: state.map.cities[0]?.id ?? null,
    });
    const expensive = quoteStoreItem({
      parcel: state.map.parcels.find((parcel) => parcel.id.value === store.parcelId.value)!,
      itemId: 'tool-kit',
      unitPrice: anchor * 2,
      quality: 1,
      brand: 0,
      rivals: state.rivals!,
      shopkeeperSkill: 0,
      retailMultiplier: 1,
      cityId: state.map.cities[0]?.id ?? null,
    });
    expect(expensive.units).toBeLessThan(quiet.units);

    const cashBefore = state.players[playerId]!.cash;
    const sold = settleStorefronts(state, eventForDay(0), state.rivals!);
    expect(sold.players[playerId]!.cash).toBeGreaterThan(cashBefore);
    expect(sold.inventories[playerId]!['tool-kit']).toBeLessThan(8);
  });
});

describe('大宗提領', () => {
  it('煤炭一手進庫存，花費高於自採名目價值', () => {
    let state = createInitialWorld();
    const ask = quoteCommodityAsk('coal', state.financeTick);
    const cost = ask * 20;
    expect(cost).toBeGreaterThan(ITEMS.coal.unitValue);
    state = applyWorldAction(state, { type: 'BUY_COMMODITY', commodityId: 'coal', lots: 1 });
    const cashAfterBuy = state.players['player-1']!.cash;
    state = applyWorldAction(state, { type: 'WITHDRAW_COMMODITY', commodityId: 'coal', lots: 1 });
    expect(state.players['player-1']!.cash).toBe(cashAfterBuy);
    expect(state.inventories['player-1']!.coal).toBe(1);
    expect(state.bank['player-1']!.commodities.find((item) => item.commodityId === 'coal')).toBeUndefined();
    const yarn = applyWorldAction(state, { type: 'WITHDRAW_COMMODITY', commodityId: 'yarn', lots: 1 });
    expect(yarn).toBe(state);
  });
});
