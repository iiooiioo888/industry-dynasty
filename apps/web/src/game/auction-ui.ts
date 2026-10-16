import { findOpenLotForParcel, type AuctionLot, type ParcelId, type WorldState } from '@industry-dynasty/sim';

export function getOpenAuctionLots(state: WorldState): readonly AuctionLot[] {
  return state.auctionLots.filter((lot) => lot.status === 'open');
}

export function isParcelInOpenAuction(state: WorldState, parcelId: ParcelId): boolean {
  return findOpenLotForParcel(state, parcelId) !== undefined;
}

export function getContestedOpenLots(state: WorldState): readonly AuctionLot[] {
  return getOpenAuctionLots(state).filter((lot) => lot.highBidderId !== null);
}
