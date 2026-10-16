/** 地圖上的單一土地區塊（拍賣與建造的基本單位） */
export interface ParcelId {
  readonly value: string;
}

export interface MapSize {
  readonly width: number;
  readonly height: number;
}

export interface Parcel {
  readonly id: ParcelId;
  readonly x: number;
  readonly y: number;
  /** 是否已被玩家或 NPC 佔用 */
  readonly occupied: boolean;
}

export interface GameMap {
  readonly size: MapSize;
  readonly parcels: readonly Parcel[];
}
