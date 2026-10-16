import { describe, expect, it } from 'vitest';
import { parcelIdFromCoords, type Parcel } from '../types/map.js';
import { DEFAULT_WORLD_CONFIG } from './config.js';
import { quoteAuctionMinPrice, quoteLocalDemand } from './demand.js';
import { generateParcelResource } from './parcel-resources.js';

function parcel(overrides: Partial<Parcel> & Pick<Parcel, 'x' | 'y'>): Parcel {
  return {
    id: parcelIdFromCoords(overrides.x, overrides.y),
    state: 'empty',
    ownerId: null,
    role: 'land',
    populationDensity: 10,
    roadAccess: 0.12,
    cityProximity: 0,
    nearestCityName: null,
    nearestCityDistance: 9,
    resource: generateParcelResource(overrides.x, overrides.y),
    ...overrides,
  };
}

describe('在地需求報價', () => {
  it('鎖定人口、城市、道路的收購公式', () => {
    const quote = quoteLocalDemand(
      parcel({
        x: 4,
        y: 5,
        populationDensity: 80,
        roadAccess: 0.78,
        cityProximity: 0.5,
        nearestCityName: '西灣市',
        nearestCityDistance: 3,
      }),
    );
    expect(quote.unitPrice).toBe(138);
    expect(quote.weeklyVolume).toBe(12);
    expect(quote.demandIndex).toBeCloseTo(0.7252, 4);
  });

  it('人口較高時，收購量與單價一起上升', () => {
    const shared = { x: 4, y: 5, roadAccess: 0.78, cityProximity: 0.5 };
    const sparse = quoteLocalDemand(parcel({ ...shared, populationDensity: 20 }));
    const dense = quoteLocalDemand(parcel({ ...shared, populationDensity: 80 }));
    expect(dense.unitPrice).toBeGreaterThan(sparse.unitPrice);
    expect(dense.weeklyVolume).toBeGreaterThan(sparse.weeklyVolume);
    expect(dense.demandIndex).toBeGreaterThan(sparse.demandIndex);
  });

  it('同樣人口下，沿路比偏遠賣得更多、也更貴', () => {
    const shared = { x: 1, y: 1, populationDensity: 60, cityProximity: 0.4 };
    const remote = quoteLocalDemand(parcel({ ...shared, roadAccess: 0.12 }));
    const onRoad = quoteLocalDemand(parcel({ ...shared, roadAccess: 1 }));
    expect(onRoad.weeklyVolume).toBeGreaterThan(remote.weeklyVolume);
    expect(onRoad.unitPrice).toBeGreaterThan(remote.unitPrice);
  });

  it('同樣人口下，靠近城市比遠離城市賣得更多、也更貴', () => {
    const shared = { x: 1, y: 1, populationDensity: 60, roadAccess: 0.7 };
    const far = quoteLocalDemand(parcel({ ...shared, cityProximity: 0 }));
    const near = quoteLocalDemand(parcel({ ...shared, cityProximity: 1 }));
    expect(near.weeklyVolume).toBeGreaterThan(far.weeklyVolume);
    expect(near.unitPrice).toBeGreaterThan(far.unitPrice);
  });

  it('人口對單價的拉力大於單獨的道路加成', () => {
    const baseline = quoteLocalDemand(
      parcel({ x: 0, y: 0, populationDensity: 30, roadAccess: 0.12, cityProximity: 0.2 }),
    );
    const denser = quoteLocalDemand(
      parcel({ x: 0, y: 0, populationDensity: 80, roadAccess: 0.12, cityProximity: 0.2 }),
    );
    const onlyRoad = quoteLocalDemand(
      parcel({ x: 0, y: 0, populationDensity: 30, roadAccess: 1, cityProximity: 0.2 }),
    );
    expect(denser.unitPrice - baseline.unitPrice).toBeGreaterThan(
      onlyRoad.unitPrice - baseline.unitPrice,
    );
    expect(denser.weeklyVolume - baseline.weeklyVolume).toBeGreaterThan(
      onlyRoad.weeklyVolume - baseline.weeklyVolume,
    );
  });

  it('密集區土地的拍賣底價高於偏遠土地', () => {
    const remote = quoteAuctionMinPrice(
      parcel({ x: 0, y: 0, populationDensity: 12, roadAccess: 0.12, cityProximity: 0.1 }),
      DEFAULT_WORLD_CONFIG,
    );
    const dense = quoteAuctionMinPrice(
      parcel({ x: 4, y: 4, populationDensity: 90, roadAccess: 0.78, cityProximity: 0.7 }),
      DEFAULT_WORLD_CONFIG,
    );
    expect(dense).toBeGreaterThan(remote);
  });
});
