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

export interface Parcel {
  readonly id: ParcelId;
  readonly x: number;
  readonly y: number;
  readonly state: ParcelState;
  readonly ownerId: string | null;
  /** 此地皮獨有資源（種類與儲量因座標而異） */
  readonly resource: ParcelResource;
}

export interface GameMap {
  readonly size: MapSize;
  readonly parcels: readonly Parcel[];
}
