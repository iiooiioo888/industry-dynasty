import type { ParcelId } from './map.js';

export type AuctionLotStatus = 'open' | 'closed';

export interface AuctionLot {
  readonly id: string;
  readonly parcelId: ParcelId;
  /** 最低可出價（含） */
  readonly minPrice: number;
  readonly highBid: number;
  readonly highBidderId: string | null;
  readonly status: AuctionLotStatus;
}

/** @deprecated Sprint 0 相容別名 */
export type AuctionStatus = AuctionLotStatus;

/** @deprecated 使用 AuctionLot */
export interface Auction {
  readonly id: string;
  readonly lots: readonly AuctionLot[];
}
