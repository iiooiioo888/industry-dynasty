import { FACTORY_TYPES, type FactoryTypeId, type SiteKind } from '../buildings/catalog.js';
import type { ParcelId } from '../types/map.js';
import { findParcel, getSite, type WorldState } from './state.js';

/** 大世界管土地與運路；廠房是單棟建物的室內。 */
export type MapLayer = 'world' | 'floor';

export type FloorStationRole =
  | 'gate'
  | 'intake'
  | 'work'
  | 'machine'
  | 'crew'
  | 'outbound'
  | 'bench'
  | 'shelf'
  | 'counter';

export interface FloorStation {
  readonly id: string;
  readonly role: FloorStationRole;
  readonly nameZh: string;
  readonly x: number;
  readonly y: number;
}

export interface FloorPlan {
  readonly kind: SiteKind;
  readonly width: number;
  readonly height: number;
  readonly stations: readonly FloorStation[];
}

const WORKS_FLOOR: FloorPlan = {
  kind: 'works',
  width: 6,
  height: 4,
  stations: [
    { id: 'gate', role: 'gate', nameZh: '廠門', x: 0, y: 0 },
    { id: 'intake', role: 'intake', nameZh: '進料', x: 1, y: 1 },
    { id: 'work', role: 'work', nameZh: '作業區', x: 2, y: 1 },
    { id: 'machine', role: 'machine', nameZh: '加工機', x: 3, y: 1 },
    { id: 'crew', role: 'crew', nameZh: '班長席', x: 4, y: 1 },
    { id: 'outbound', role: 'outbound', nameZh: '出貨口', x: 5, y: 0 },
  ],
};

const LAB_FLOOR: FloorPlan = {
  kind: 'lab',
  width: 5,
  height: 3,
  stations: [
    { id: 'gate', role: 'gate', nameZh: '室門', x: 0, y: 0 },
    { id: 'bench', role: 'bench', nameZh: '研發台', x: 1, y: 1 },
    { id: 'crew', role: 'crew', nameZh: '研發席', x: 3, y: 1 },
  ],
};

const STORE_FLOOR: FloorPlan = {
  kind: 'store',
  width: 5,
  height: 3,
  stations: [
    { id: 'gate', role: 'gate', nameZh: '店門', x: 0, y: 0 },
    { id: 'shelf', role: 'shelf', nameZh: '貨架', x: 1, y: 1 },
    { id: 'counter', role: 'counter', nameZh: '收銀台', x: 4, y: 0 },
    { id: 'crew', role: 'crew', nameZh: '店長席', x: 3, y: 1 },
  ],
};

const FLOORS: Record<SiteKind, FloorPlan> = {
  works: WORKS_FLOOR,
  lab: LAB_FLOOR,
  store: STORE_FLOOR,
};

export function floorPlanFor(factoryTypeId: FactoryTypeId): FloorPlan {
  return FLOORS[FACTORY_TYPES[factoryTypeId].kind];
}

/** 進得了廠房就回 null。道路、拍賣地、建造中與別人的建物都不開室內。 */
export function enterFloorBlock(state: WorldState, parcelId: ParcelId): string | null {
  const parcel = findParcel(state, parcelId);
  if (!parcel || parcel.role !== 'land') {
    return '這格沒有廠房';
  }
  if (parcel.ownerId !== state.localPlayerId) {
    return '只有自己的建物能進廠房';
  }
  const site = getSite(state, parcelId);
  if (!site) {
    return '這塊地還沒有建物';
  }
  if (site.phase !== 'complete' || site.ownerId !== state.localPlayerId) {
    return '建造完成才能進入廠房';
  }
  return null;
}

export function stationAt(plan: FloorPlan, x: number, y: number): FloorStation | undefined {
  return plan.stations.find((station) => station.x === x && station.y === y);
}
