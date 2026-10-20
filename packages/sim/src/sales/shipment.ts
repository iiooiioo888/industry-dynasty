import type { ItemId } from '../production/items.js';

/** 一趟佔用模擬時間的出貨。現金與損益在到達時才入帳。 */
export interface Shipment {
  readonly id: string;
  readonly ownerId: string;
  readonly offerId: string;
  readonly itemId: ItemId;
  readonly quantity: number;
  readonly fromX: number;
  readonly fromY: number;
  readonly grossRevenue: number;
  readonly transportCost: number;
  readonly netCash: number;
  readonly departSimMs: number;
  readonly arriveSimMs: number;
  readonly travelTicks: number;
  /** 缺省時運往港區。合約出貨改指向城市。 */
  readonly toX?: number;
  readonly toY?: number;
  readonly contractId?: string;
}
