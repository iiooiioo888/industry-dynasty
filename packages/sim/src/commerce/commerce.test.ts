import { describe, expect, it } from 'vitest';
import { FACTORY_TYPES } from '../buildings/catalog.js';
import { ITEMS } from '../production/items.js';
import { evaluateScenario, createScenarioState } from '../sales/scenario.js';
import { emptyPnL } from '../sales/pnl.js';
import { parcelIdFromCoords } from '../types/map.js';
import { generateParcelResource } from '../world/parcel-resources.js';
import { applyWorldAction } from '../world/reducer.js';
import { createInitialWorld } from '../world/create-world.js';
import { findOpenLotForParcel } from '../world/state.js';
import { listShipments } from '../world/shipments.js';
import type { Parcel } from '../types/map.js';
import {
  CONSUMER_RESEARCH_ID,
  RESEARCH_TICKS,
  STAFF_TABLE,
  applyCommerceDay,
  clerkCoverage,
  marketShareOf,
  operatorThroughputFactor,
  priceVolumeMultiplier,
  quoteRetailDay,
  readCommerce,
  rollWorldEvent,
} from './logic.js';

function parcelAt(patch: Partial<Parcel> & Pick<Parcel, 'x' | 'y'>): Parcel {
  return {
    id: parcelIdFromCoords(patch.x, patch.y),
    state: 'building-ready',
    ownerId: 'player-1',
    resource: generateParcelResource(patch.x, patch.y),
    role: 'land',
    populationDensity: 80,
    roadAccess: 1,
    cityProximity: 1,
    nearestCityName: '西灣市',
    nearestCityDistance: 1,
    ...patch,
  };
}

describe('門市價格與人力', () => {
  it('售價高於基準時成交量下降，低於基準時上升', () => {
    expect(priceVolumeMultiplier(0.8)).toBeGreaterThan(priceVolumeMultiplier(1));
    expect(priceVolumeMultiplier(1)).toBeGreaterThan(priceVolumeMultiplier(1.4));
    expect(priceVolumeMultiplier(2)).toBe(0);
  });

  it('沒有店員時門市賣不動；對手會分走需求', () => {
    const parcel = parcelAt({ x: 4, y: 4 });
    const shared = {
      parcel,
      itemId: 'hand-tool' as const,
      unitPrice: ITEMS['hand-tool'].unitValue,
      qualityBand: 0 as const,
      activeStores: 1,
      campaigns: [],
      events: [],
    };
    const staffed = quoteRetailDay({
      ...shared,
      clerks: 1,
      rivals: [{ id: 'r', nameZh: '北岸聯號', cityId: 'xiwan', cityName: '西灣市', presence: 0.4 }],
    });
    const rivalHeavy = quoteRetailDay({
      ...shared,
      clerks: 1,
      rivals: [
        { id: 'r', nameZh: '北岸聯號', cityId: 'xiwan', cityName: '西灣市', presence: 0.75 },
      ],
    });
    const unstaffed = quoteRetailDay({ ...shared, clerks: 0, rivals: [] });
    expect(staffed.units).toBeGreaterThan(1);
    expect(rivalHeavy.rivalFactor).toBeLessThan(staffed.rivalFactor);
    expect(rivalHeavy.units).toBeLessThan(staffed.units);
    expect(unstaffed.units).toBe(0);
    expect(clerkCoverage(0, 2)).toBe(0);
    expect(clerkCoverage(1, 2)).toBe(0.5);
  });

  it('沒雇技師時產量係數維持 1，雇不夠才下降', () => {
    expect(operatorThroughputFactor(0, 6)).toBe(1);
    expect(operatorThroughputFactor(1, 4)).toBe(0.45);
    expect(operatorThroughputFactor(3, 1)).toBe(1.2);
  });
});

describe('合約、研發與新聞', () => {
  function ownParcel(state: ReturnType<typeof createInitialWorld>, x: number, y: number) {
    const parcelId = parcelIdFromCoords(x, y);
    const lot = findOpenLotForParcel(state, parcelId);
    if (!lot) {
      throw new Error(`no lot at ${x},${y}`);
    }
    let next = applyWorldAction(state, { type: 'BID', parcelId, amount: lot.minPrice });
    next = applyWorldAction(next, { type: 'SETTLE_AUCTION', parcelId });
    return { state: next, parcelId };
  }

  it('合約交貨入帳，逾期扣一次違約金', () => {
    let state = createInitialWorld({ startingCash: 400_000 });
    const land = state.map.parcels.find((parcel) => parcel.role === 'land');
    if (!land) {
      throw new Error('no land');
    }
    const owned = ownParcel(state, land.x, land.y);
    state = owned.state;
    const contract = readCommerce(state).contracts.find((entry) => entry.status === 'open');
    if (!contract) {
      throw new Error('no contract');
    }
    state = {
      ...state,
      inventories: {
        ...state.inventories,
        [state.localPlayerId]: { [contract.itemId]: contract.quantity },
      },
    };
    const cashBefore = state.players[state.localPlayerId]!.cash;
    state = applyWorldAction(state, {
      type: 'ACCEPT_CONTRACT',
      contractId: contract.id,
      shipFromParcelId: owned.parcelId,
    });
    expect(readCommerce(state).contracts.find((entry) => entry.id === contract.id)?.status).toBe(
      'shipping',
    );
    expect(listShipments(state)).toHaveLength(1);
    const travel = listShipments(state)[0]!.travelTicks;
    for (let step = 0; step < travel; step += 1) {
      state = applyWorldAction(state, { type: 'ADVANCE_PRODUCTION_TICK' });
    }
    expect(listShipments(state)).toHaveLength(0);
    expect(readCommerce(state).contracts.find((entry) => entry.id === contract.id)?.status).toBe(
      'fulfilled',
    );
    expect(state.players[state.localPlayerId]!.cash).toBeGreaterThan(cashBefore);
    expect(readCommerce(state).consumerRevenue).toBeGreaterThan(0);

    let late = createInitialWorld({ startingCash: 50_000 });
    const lateLand = late.map.parcels.find((parcel) => parcel.role === 'land')!;
    const lateOwned = ownParcel(late, lateLand.x, lateLand.y);
    late = lateOwned.state;
    const lateContract = readCommerce(late).contracts[0]!;
    late = {
      ...late,
      inventories: {
        ...late.inventories,
        [late.localPlayerId]: { [lateContract.itemId]: lateContract.quantity },
      },
      commerce: {
        ...readCommerce(late),
        contracts: readCommerce(late).contracts.map((entry) =>
          entry.id === lateContract.id ? { ...entry, dueDay: 0 } : entry,
        ),
      },
    };
    late = applyWorldAction(late, {
      type: 'ACCEPT_CONTRACT',
      contractId: lateContract.id,
      shipFromParcelId: lateOwned.parcelId,
    });
    const cashAtShip = late.players[late.localPlayerId]!.cash;
    late = applyWorldAction(late, { type: 'ADVANCE_DAY' });
    expect(readCommerce(late).penaltiesPaid).toBe(lateContract.penalty);
    expect(late.players[late.localPlayerId]!.cash).toBeLessThan(cashAtShip);
    late = applyWorldAction(late, { type: 'ADVANCE_DAY' });
    expect(readCommerce(late).penaltiesPaid).toBe(lateContract.penalty);
  });

  it('沒有研發員時研究停滯，雇人之後解鎖消費品與品質', () => {
    let state = createInitialWorld({ startingCash: 400_000 });
    const land = state.map.parcels.find((parcel) => parcel.role === 'land')!;
    const parcelId = parcelIdFromCoords(land.x, land.y);
    const lot = findOpenLotForParcel(state, parcelId)!;
    state = applyWorldAction(state, { type: 'BID', parcelId, amount: lot.minPrice });
    state = applyWorldAction(state, { type: 'SETTLE_AUCTION', parcelId });
    state = applyWorldAction(state, { type: 'START_BUILD', parcelId, factoryTypeId: 'lab' });
    for (let tick = 0; tick < FACTORY_TYPES.lab.buildTimeTicks; tick += 1) {
      state = applyWorldAction(state, { type: 'ADVANCE_BUILD_TICK' });
    }
    state = applyWorldAction(state, { type: 'START_RESEARCH', parcelId });
    state = applyWorldAction(state, { type: 'ADVANCE_PRODUCTION_TICK' });
    expect(readCommerce(state).research?.progressTicks).toBe(0);
    state = applyWorldAction(state, { type: 'HIRE_STAFF', role: 'researcher', count: 1 });
    expect(state.pnl[state.localPlayerId]!.wages).toBe(STAFF_TABLE.researcher.hireCost);
    for (let tick = 0; tick < RESEARCH_TICKS; tick += 1) {
      state = applyWorldAction(state, { type: 'ADVANCE_PRODUCTION_TICK' });
    }
    const book = readCommerce(state);
    expect(book.unlocked).toContain(CONSUMER_RESEARCH_ID);
    expect(book.qualityBand).toBe(1);
    expect(book.research).toBeNull();
  });

  it('新聞到期後失效', () => {
    const state = createInitialWorld();
    // 事件改成樣板表抽選（`commerce/news.ts`），仍必須對同一天完全決定性。
    // 這裡只斷言「有無抽到東西」是穩定可重現的，不綁死特定日期會抽到哪一種。
    const day2a = rollWorldEvent(2, state.map.cities);
    const day2b = rollWorldEvent(2, state.map.cities);
    expect(day2a?.id).toBe(day2b?.id);
    expect(day2a?.kind).toBe(day2b?.kind);
    expect(day2a === null || day2a.remainingDays > 0).toBe(true);
    const seeded = {
      ...state,
      commerce: {
        ...readCommerce(state),
        events: [
          {
            id: 'evt',
            kind: 'port-raw-down' as const,
            headline: '港區原料庫滿，收購價短跌',
            remainingDays: 1,
            magnitude: 0.93,
          },
        ],
      },
    };
    const next = applyCommerceDay(seeded, 1).state;
    expect(readCommerce(next).events.some((event) => event.id === 'evt')).toBe(false);
  });
});

describe('門市日結', () => {
  it('上架後的日結把貨賣成營收，缺貨就停', () => {
    let state = createInitialWorld({ startingCash: 400_000 });
    const parcel = [...state.map.parcels]
      .filter((entry) => entry.role === 'land')
      .sort((a, b) => b.populationDensity - a.populationDensity)[0]!;
    const lot = findOpenLotForParcel(state, parcel.id)!;
    state = applyWorldAction(state, { type: 'BID', parcelId: parcel.id, amount: lot.minPrice });
    state = applyWorldAction(state, { type: 'SETTLE_AUCTION', parcelId: parcel.id });
    state = applyWorldAction(state, {
      type: 'START_BUILD',
      parcelId: parcel.id,
      factoryTypeId: 'storefront',
    });
    for (let tick = 0; tick < FACTORY_TYPES.storefront.buildTimeTicks; tick += 1) {
      state = applyWorldAction(state, { type: 'ADVANCE_BUILD_TICK' });
    }
    state = applyWorldAction(state, { type: 'HIRE_STAFF', role: 'clerk', count: 1 });
    state = {
      ...state,
      inventories: { ...state.inventories, [state.localPlayerId]: { 'hand-tool': 6 } },
    };
    const quote = quoteRetailDay({
      parcel: state.map.parcels.find((entry) => entry.id.value === parcel.id.value)!,
      itemId: 'hand-tool',
      unitPrice: ITEMS['hand-tool'].unitValue,
      qualityBand: 0,
      clerks: 1,
      activeStores: 1,
      rivals: readCommerce(state).rivals,
      campaigns: [],
      events: [],
    });
    state = applyWorldAction(state, {
      type: 'SET_SHELF',
      parcelId: parcel.id,
      itemId: 'hand-tool',
      unitPrice: quote.referencePrice,
      quantity: 6,
    });
    expect(readCommerce(state).shelves[0]?.quantity).toBe(6);
    const cashBefore = state.players[state.localPlayerId]!.cash;
    state = applyWorldAction(state, { type: 'ADVANCE_DAY' });
    const shelf = readCommerce(state).shelves[0];
    expect(shelf?.quantity ?? 0).toBeLessThan(6);
    expect(state.pnl[state.localPlayerId]!.revenue).toBeGreaterThan(0);
    expect(state.players[state.localPlayerId]!.cash).toBeGreaterThan(cashBefore);
    expect(state.pnl[state.localPlayerId]!.wages).toBe(
      STAFF_TABLE.clerk.hireCost + STAFF_TABLE.clerk.dailyWage,
    );
  });
});

describe('市佔通關與舊賣礦路徑', () => {
  it('淨利未達標時，市佔與消費品營收仍可過關', () => {
    const scenario = createScenarioState();
    const won = evaluateScenario(scenario, 3, emptyPnL(), {
      commerce: { share: 0.2, consumerRevenue: 25_000 },
    });
    expect(won.status).toBe('won');
    const playing = evaluateScenario(scenario, 3, emptyPnL(), {
      commerce: { share: 0.5, consumerRevenue: 100 },
    });
    expect(playing.status).toBe('playing');
  });

  it('不雇人、不開店時日結不會產生新的經營成本', () => {
    const state = createInitialWorld();
    const next = applyWorldAction(state, { type: 'ADVANCE_DAY' });
    const pnl = next.pnl[state.localPlayerId]!;
    expect(pnl.revenue).toBe(0);
    expect(pnl.wages ?? 0).toBe(0);
    expect(pnl.maintenance).toBe(0);
    expect(pnl.taxPaid).toBe(0);
    expect(marketShareOf(readCommerce(next))).toBe(0);
    expect(next.scenario.status).toBe('playing');
  });
});
