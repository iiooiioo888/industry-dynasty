import { describe, expect, it } from 'vitest';
import { getSiteLogisticsView } from '../buildings/adjacency.js';
import { FACTORY_TYPES } from '../buildings/catalog.js';
import { parcelIdFromCoords } from '../types/map.js';
import { applyWorldAction } from '../world/reducer.js';
import { createInitialWorld } from '../world/create-world.js';
import { findOpenLotForParcel, type WorldState } from '../world/state.js';
import {
  accrueOperatingProfit,
  aggregateReport,
  buildHistogram,
  emptyLedger,
  isBankrupt,
  measureMarket,
  percentile,
  quoteOperatingRevenue,
  timePlanningFactor,
} from './economy.js';
import type { GameOutcome, GamePlayerOutcome } from './types.js';

function player(
  partial: Partial<GamePlayerOutcome> & Pick<GamePlayerOutcome, 'playerId'>,
): GamePlayerOutcome {
  return {
    name: '測試企業',
    strategy: 'cluster',
    startingCash: 100,
    endingCash: 100,
    netProfit: 0,
    won: false,
    bankrupt: false,
    ownedParcels: 0,
    completeFactories: 0,
    capacity: 0,
    revenue: 0,
    ...partial,
  };
}

function completeWorkshops(
  coords: readonly (readonly [number, number])[],
  mapWidth: number,
): WorldState {
  let state = createInitialWorld({
    mapWidth,
    mapHeight: 4,
    startingCash: 200_000,
    playerId: 'owner',
    playerName: '業主',
  });

  for (const [x, y] of coords) {
    const parcelId = parcelIdFromCoords(x, y);
    const lot = findOpenLotForParcel(state, parcelId);
    if (!lot) {
      throw new Error(`找不到拍賣 ${parcelId.value}`);
    }
    state = applyWorldAction(state, { type: 'BID', parcelId, amount: lot.minPrice });
    state = applyWorldAction(state, { type: 'SETTLE_AUCTION', parcelId });
    state = applyWorldAction(state, { type: 'START_BUILD', parcelId, factoryTypeId: 'workshop' });
  }

  for (let tick = 0; tick < FACTORY_TYPES.workshop.buildTimeTicks; tick += 1) {
    state = applyWorldAction(state, { type: 'ADVANCE_BUILD_TICK' });
  }
  return state;
}

function logisticsView(state: WorldState, x: number, y: number) {
  const parcel = state.map.parcels.find((item) => item.x === x && item.y === y);
  const site = parcel ? state.sites[parcel.id.value] : undefined;
  if (!parcel || !site || site.phase !== 'complete') {
    throw new Error(`找不到完工工廠 ${x},${y}`);
  }
  return getSiteLogisticsView(state.map, parcel, site, state.sites);
}

function spatialFactor(state: WorldState, x: number, y: number): number {
  return logisticsView(state, x, y).factor;
}

describe('營運收入公式', () => {
  it('時間規劃在建造期間為 0，完工滿窗後到達上限', () => {
    expect(timePlanningFactor(0, 18, 3)).toBe(0);
    expect(timePlanningFactor(15, 18, 3)).toBeCloseTo(1.25);
    expect(quoteOperatingRevenue(100, 1.5, 10, 16, 6)).toBe(188);
  });

  it('相鄰完工工廠的空間效率高於分離佈局', () => {
    const adjacent = completeWorkshops(
      [
        [0, 0],
        [1, 0],
      ],
      8,
    );
    const isolated = completeWorkshops(
      [
        [0, 0],
        [5, 0],
      ],
      8,
    );

    const cashBefore = adjacent.players.owner?.cash ?? 0;
    const adjacentAccrual = accrueOperatingProfit(adjacent, emptyLedger(), 18);
    const isolatedAccrual = accrueOperatingProfit(isolated, emptyLedger(), 18);
    const adjacentRevenue = adjacentAccrual.ledger.revenueByPlayer.owner ?? 0;
    const isolatedRevenue = isolatedAccrual.ledger.revenueByPlayer.owner ?? 0;

    const adjacentFactor = spatialFactor(adjacent, 0, 0) + spatialFactor(adjacent, 1, 0);
    const isolatedFactor = spatialFactor(isolated, 0, 0) + spatialFactor(isolated, 5, 0);

    expect(adjacentRevenue).toBeGreaterThan(isolatedRevenue);
    expect(logisticsView(adjacent, 0, 0).adjacentFactoryCount).toBe(1);
    expect(logisticsView(isolated, 0, 0).adjacentFactoryCount).toBe(0);
    expect(adjacentRevenue / isolatedRevenue).toBeCloseTo(adjacentFactor / isolatedFactor, 4);
    expect(adjacentAccrual.state.players.owner?.cash).toBe(cashBefore + adjacentRevenue);
  });
});

describe('破產與壟斷', () => {
  it('無現金且無完工工廠才算破產', () => {
    expect(isBankrupt(0, 0)).toBe(true);
    expect(isBankrupt(0, 2)).toBe(false);
    expect(isBankrupt(500, 0)).toBe(false);
  });

  it('以產能份額計算壟斷，沒有工廠時改看土地', () => {
    expect(
      measureMarket([
        { capacity: 3, ownedParcels: 1 },
        { capacity: 1, ownedParcels: 9 },
      ]),
    ).toEqual({ share: 0.75, herfindahl: 0.625 });

    expect(
      measureMarket([
        { capacity: 0, ownedParcels: 1 },
        { capacity: 0, ownedParcels: 3 },
      ]),
    ).toEqual({ share: 0.75, herfindahl: 0.625 });

    expect(measureMarket([])).toEqual({ share: 0, herfindahl: 0 });
    expect(
      measureMarket([
        { capacity: 0, ownedParcels: 0 },
        { capacity: 0, ownedParcels: 0 },
      ]),
    ).toEqual({ share: 0, herfindahl: 0 });
  });
});

describe('報表聚合', () => {
  it('空樣本不產生 NaN', () => {
    const report = aggregateReport([]);
    expect(report.gameCount).toBe(0);
    expect(report.observations).toBe(0);
    expect(report.bankruptcyRate).toBe(0);
    expect(report.netProfit.mean).toBe(0);
    expect(report.netProfit.distribution.buckets).toEqual([]);
    expect(report.monopoly.tendency).toBe(0);
    expect(report.monopoly.dominantGameRate).toBe(0);
    expect(report.strategies).toEqual([]);
  });

  it('四分位使用線性插值', () => {
    expect(percentile([0, 10, 20, 30, 40], 0.25)).toBe(10);
    expect(percentile([0, 10, 20, 30, 40], 0.5)).toBe(20);
    expect(percentile([0, 10, 20, 30, 40], 0.75)).toBe(30);
    expect(percentile([0, 10, 20, 30], 0.5)).toBe(15);
  });

  it('彙整破產率、淨利分布與壟斷傾向', () => {
    const games: GameOutcome[] = [
      {
        seed: 1,
        monopolyShare: 1,
        herfindahl: 1,
        players: [
          player({
            playerId: 'a',
            strategy: 'cluster',
            netProfit: 100,
            endingCash: 200,
            capacity: 10,
          }),
          player({
            playerId: 'b',
            strategy: 'speculator',
            netProfit: -100,
            endingCash: 0,
            bankrupt: true,
          }),
        ],
      },
      {
        seed: 2,
        monopolyShare: 0.4,
        herfindahl: 0.28,
        players: [
          player({
            playerId: 'a',
            strategy: 'cluster',
            netProfit: 40,
            endingCash: 140,
            capacity: 4,
          }),
          player({
            playerId: 'b',
            strategy: 'speculator',
            netProfit: -40,
            endingCash: 60,
            bankrupt: false,
            capacity: 6,
          }),
        ],
      },
    ];

    const report = aggregateReport(games, {
      seed: 99,
      horizon: 18,
      mapWidth: 6,
      mapHeight: 5,
      startingCash: 50_000,
    });

    expect(report.gameCount).toBe(2);
    expect(report.observations).toBe(4);
    expect(report.bankruptCount).toBe(1);
    expect(report.bankruptcyRate).toBe(0.25);
    expect(report.netProfit.mean).toBe(0);
    expect(report.netProfit.distribution.min).toBe(-100);
    expect(report.netProfit.distribution.max).toBe(100);
    expect(report.netProfit.distribution.median).toBe(0);
    expect(
      report.netProfit.distribution.buckets.reduce((sum, bucket) => sum + bucket.count, 0),
    ).toBe(4);
    expect(report.monopoly.tendency).toBeCloseTo(0.7);
    expect(report.monopoly.meanHerfindahl).toBeCloseTo(0.64);
    expect(report.monopoly.dominantGameRate).toBe(0.5);
    expect(report.seed).toBe(99);
    expect(report.parameters).toEqual({
      mapWidth: 6,
      mapHeight: 5,
      horizon: 18,
      startingCash: 50_000,
      rosterSize: 2,
    });
    expect(report.strategies).toEqual([
      {
        strategy: 'cluster',
        label: '聚落工坊',
        observations: 2,
        bankruptcyRate: 0,
        meanNetProfit: 70,
      },
      {
        strategy: 'speculator',
        label: '圈地投機',
        observations: 2,
        bankruptcyRate: 0.5,
        meanNetProfit: -70,
      },
    ]);
  });

  it('相同淨利收成單一區間', () => {
    expect(buildHistogram([5, 5, 5])).toEqual([{ label: '5', min: 5, max: 5, count: 3 }]);
  });
});
