/** 地圖上的單一土地區塊（拍賣與建造的基本單位） */
export interface ParcelId {
  readonly value: string;
}

export function parcelIdFromCoords(x: number, y: number): ParcelId {
  return { value: `${x},${y}` };
}

export interface MapSize {
  readonly width: number;
  readonly height: number;
}

import type { ParcelResource } from '../world/parcel-resources.js';

/** 土地狀態：空地 / 已持有 / 建造中 / 已完工可運營 */
export type ParcelState = 'empty' | 'owned' | 'building' | 'building-ready';

/**
 * 地塊角色。道路與城市核心是公共設施，不開放拍賣；
 * 可購買的永遠是 `land`（含人口密集區）。
 */
export type ParcelRole = 'land' | 'road' | 'city-hub';

export interface Parcel {
  readonly id: ParcelId;
  readonly x: number;
  readonly y: number;
  readonly state: ParcelState;
  readonly ownerId: string | null;
  /** 此地皮獨有資源（種類與儲量因座標而異） */
  readonly resource: ParcelResource;
  readonly role: ParcelRole;
  /** 0–100。越高，在地產品需求越大，收購量與單價一起上升。 */
  readonly populationDensity: number;
  /** 0–1。沿路為 1，離道路越遠越低，影響能否把需求真正賣掉。 */
  readonly roadAccess: number;
  /** 0–1。貼著城市核心為 1，超出影響半徑為 0。 */
  readonly cityProximity: number;
  readonly nearestCityName: string | null;
  readonly nearestCityDistance: number;
}

/** 城市據點。核心占地不出售，周圍土地吃到人口與通路。 */
export interface CityHub {
  readonly id: string;
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** 人口密集區。落在可購買土地上，是需求最高的佈局目標。 */
export interface PopulationZone {
  readonly id: string;
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** 區內密度下限（0–100），仍會與城市距離衰減取較高者。 */
  readonly density: number;
}

/** 道路中心線。實際格子會標成 role=road，與城市核心重疊時讓給城市。 */
export interface RoadLine {
  readonly id: string;
  readonly name: string;
  readonly axis: 'h' | 'v';
  readonly fixed: number;
  readonly from: number;
  readonly to: number;
}

export interface GameMap {
  readonly size: MapSize;
  readonly parcels: readonly Parcel[];
  readonly cities: readonly CityHub[];
  readonly denseZones: readonly PopulationZone[];
  readonly roads: readonly RoadLine[];
}
