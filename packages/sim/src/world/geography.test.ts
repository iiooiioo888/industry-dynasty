import { describe, expect, it } from 'vitest';
import { parcelIdFromCoords } from '../types/map.js';
import { applyWorldAction } from './reducer.js';
import { createInitialWorld } from './create-world.js';
import { quoteLocalDemand } from './demand.js';
import { findOpenLotForParcel, findParcel } from './state.js';

describe('地圖地理', () => {
  it('預設地圖有道路、三座城市與人口密集區，且公共設施不拍賣', () => {
    const state = createInitialWorld();
    expect(state.map.cities.map((city) => city.name)).toEqual(['西灣市', '臨港市', '南站市']);
    expect(state.map.roads.length).toBeGreaterThanOrEqual(4);
    expect(state.map.denseZones.length).toBeGreaterThanOrEqual(3);
    expect(state.map.parcels.some((p) => p.role === 'road')).toBe(true);
    expect(state.map.parcels.some((p) => p.role === 'city-hub')).toBe(true);

    const land = state.map.parcels.filter((p) => p.role === 'land');
    const infra = state.map.parcels.filter((p) => p.role !== 'land');
    expect(state.auctionLots).toHaveLength(land.length);
    for (const parcel of infra) {
      expect(findOpenLotForParcel(state, parcel.id)).toBeUndefined();
    }
    for (const parcel of state.map.parcels) {
      expect(parcel.populationDensity).toBeGreaterThanOrEqual(0);
      expect(parcel.populationDensity).toBeLessThanOrEqual(100);
    }
  });

  it('城市核心人口最高，密集區高於偏遠地，需求量與單價跟著拉開', () => {
    const state = createInitialWorld();
    const city = state.map.parcels.find((p) => p.role === 'city-hub')!;
    const dense = state.map.parcels.find((p) => p.x === 4 && p.y === 5)!;
    const remote = state.map.parcels.find((p) => p.x === 0 && p.y === 0)!;

    expect(city.populationDensity).toBe(100);
    expect(dense.role).toBe('land');
    expect(dense.populationDensity).toBeGreaterThan(remote.populationDensity);
    expect(remote.role).toBe('land');

    const cityQuote = quoteLocalDemand(city);
    const denseQuote = quoteLocalDemand(dense);
    const remoteQuote = quoteLocalDemand(remote);
    expect(cityQuote.weeklyVolume).toBeGreaterThan(remoteQuote.weeklyVolume);
    expect(cityQuote.unitPrice).toBeGreaterThan(remoteQuote.unitPrice);
    expect(denseQuote.weeklyVolume).toBeGreaterThan(remoteQuote.weeklyVolume);
    expect(denseQuote.unitPrice).toBeGreaterThan(remoteQuote.unitPrice);

    const denseLot = findOpenLotForParcel(state, dense.id)!;
    const remoteLot = findOpenLotForParcel(state, remote.id)!;
    expect(denseLot.minPrice).toBeGreaterThan(remoteLot.minPrice);
  });

  it('道路格至少連到另一條道路或城市', () => {
    const state = createInitialWorld();
    const byKey = new Map(state.map.parcels.map((p) => [p.id.value, p]));
    const roads = state.map.parcels.filter((p) => p.role === 'road');
    expect(roads.length).toBeGreaterThan(0);
    for (const road of roads) {
      const neighbors = [
        byKey.get(`${road.x + 1},${road.y}`),
        byKey.get(`${road.x - 1},${road.y}`),
        byKey.get(`${road.x},${road.y + 1}`),
        byKey.get(`${road.x},${road.y - 1}`),
      ];
      expect(neighbors.some((n) => n?.role === 'road' || n?.role === 'city-hub')).toBe(true);
    }
  });

  it('不能對城市核心出價', () => {
    const state = createInitialWorld({ startingCash: 500_000 });
    const city = state.map.parcels.find((p) => p.role === 'city-hub')!;
    const next = applyWorldAction(state, {
      type: 'BID',
      parcelId: city.id,
      amount: 1_000_000,
    });
    expect(next).toBe(state);
    expect(findParcel(next, city.id)?.ownerId).toBeNull();
  });

  it('小地圖仍有城市、道路與可購土地', () => {
    const state = createInitialWorld({ mapWidth: 4, mapHeight: 3 });
    expect(state.map.parcels).toHaveLength(12);
    expect(state.map.cities).toHaveLength(1);
    expect(state.map.parcels.some((p) => p.role === 'road')).toBe(true);
    const land = state.map.parcels.filter((p) => p.role === 'land');
    expect(land.length).toBeGreaterThan(0);
    expect(state.auctionLots.filter((lot) => lot.status === 'open')).toHaveLength(land.length);
    expect(findOpenLotForParcel(state, parcelIdFromCoords(0, 0))).toBeDefined();
  });
});
