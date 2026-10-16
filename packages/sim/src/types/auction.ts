import type { ParcelId } from './map.js';

export type AuctionStatus = 'pending' | 'open' | 'closed';

export interface AuctionLot {
  readonly parcelId: ParcelId;
  readonly startingBid: number;
  readonly currentBid: number;
  readonly status: AuctionStatus;
}

export interface Auction {
  readonly id: string;
  readonly lots: readonly AuctionLot[];
}
