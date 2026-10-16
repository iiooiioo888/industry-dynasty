import type { GameMap, Parcel, ParcelId } from '../types/map.js';
import type { FactoryTypeDef } from './catalog.js';
import { FACTORY_TYPES } from './catalog.js';
import type { CompleteSite, ParcelSite } from './site.js';

export interface LogisticsEfficiencyView {
  readonly factor: number;
  readonly base: number;
  readonly adjacencyBonus: number;
  readonly adjacentFactoryCount: number;
}

const CARDINAL_OFFSETS = [
  { dx: 1, dy: 0 },
  { dx: -1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: 0, dy: -1 },
];

export function getParcelAt(map: GameMap, x: number, y: number): Parcel | undefined {
  return map.parcels.find((p) => p.x === x && p.y === y);
}

export function getAdjacentParcelIds(map: GameMap, parcel: Parcel): ParcelId[] {
  const ids: ParcelId[] = [];
  for (const { dx, dy } of CARDINAL_OFFSETS) {
    const neighbor = getParcelAt(map, parcel.x + dx, parcel.y + dy);
    if (neighbor) {
      ids.push(neighbor.id);
    }
  }
  return ids;
}

export function countAdjacentCompleteFactories(
  map: GameMap,
  parcel: Parcel,
  sites: Readonly<Record<string, ParcelSite>>,
  excludeParcelId?: string,
): number {
  let count = 0;
  for (const neighborId of getAdjacentParcelIds(map, parcel)) {
    if (excludeParcelId && neighborId.value === excludeParcelId) {
      continue;
    }
    const site = sites[neighborId.value];
    if (site?.phase === 'complete') {
      count += 1;
    }
  }
  return count;
}

export function computeLogisticsEfficiency(
  factoryType: FactoryTypeDef,
  adjacentFactoryCount: number,
): LogisticsEfficiencyView {
  const adjacencyBonus = adjacentFactoryCount * factoryType.adjacencyEfficiencyBonus;
  const factor = factoryType.baseLogisticsEfficiency + adjacencyBonus;
  return {
    factor,
    base: factoryType.baseLogisticsEfficiency,
    adjacencyBonus,
    adjacentFactoryCount,
  };
}

export function getSiteLogisticsView(
  map: GameMap,
  parcel: Parcel,
  site: CompleteSite,
  sites: Readonly<Record<string, ParcelSite>>,
): LogisticsEfficiencyView {
  const factoryType = FACTORY_TYPES[site.factoryTypeId];
  const neighbors = countAdjacentCompleteFactories(map, parcel, sites);
  return computeLogisticsEfficiency(factoryType, neighbors);
}
